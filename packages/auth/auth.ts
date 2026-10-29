import { timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { readFile } from 'node:fs/promises';

export const roles = ['Viewer', 'ContractOperator', 'InfrastructureOperator', 'ValidatorGovernor', 'Administrator'] as const;
export type Role = typeof roles[number];
export type Principal = { subject: string; roles: Role[] };
export type AuthSettings = {
  mode: 'development' | 'oidc'; profile: 'local' | 'laboratory' | 'production'; isolated: boolean;
  host: string; devTokens?: Partial<Record<Role, string>>;
  issuer?: string; audience?: string; clientId?: string; scope?: string;
};
export type Authenticator = (authorization: string | undefined) => Promise<Principal | null>;

export function validateAuthSettings(settings: AuthSettings) {
  if (settings.mode === 'development') {
    if (settings.profile === 'production' || !settings.isolated) throw new Error('Development authentication requires explicit isolation');
    if (settings.profile === 'local' && !['127.0.0.1', '::1'].includes(settings.host)) throw new Error('Local authentication requires loopback binding');
    const tokens = Object.values(settings.devTokens ?? {});
    if (tokens.length < 1 || tokens.some(token => !/^[a-f0-9]{64,}$/.test(token)) || new Set(tokens).size !== tokens.length) throw new Error('Unique random development tokens required');
  } else {
    if (!settings.issuer || new URL(settings.issuer).protocol !== 'https:' || !settings.audience || !settings.clientId || settings.audience === settings.clientId) throw new Error('OIDC HTTPS issuer and distinct API audience / web client ID required');
    if (settings.devTokens) throw new Error('Development credentials forbidden with OIDC');
  }
}

function equalToken(left: string, right: string) {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function createAuthenticator(settings: AuthSettings): Promise<Authenticator> {
  validateAuthSettings(settings);
  if (settings.mode === 'development') {
    return async authorization => {
      if (!authorization?.startsWith('Bearer ')) return null;
      const token = authorization.slice(7);
      for (const [role, expected] of Object.entries(settings.devTokens!)) {
        if (equalToken(token, expected)) return { subject: `development:${role}`, roles: [role as Role] };
      }
      return null;
    };
  }
  const discoveryUrl = `${settings.issuer!.replace(/\/$/, '')}/.well-known/openid-configuration`;
  const response = await fetch(discoveryUrl, { signal: AbortSignal.timeout(5000), redirect: 'error' });
  if (!response.ok) throw new Error('OIDC discovery unavailable');
  const discovery = await response.json() as { issuer: string; jwks_uri: string };
  if (discovery.issuer !== settings.issuer || new URL(discovery.jwks_uri).protocol !== 'https:') throw new Error('Invalid OIDC discovery');
  const jwks = createRemoteJWKSet(new URL(discovery.jwks_uri), { timeoutDuration: 5000, cooldownDuration: 30000, cacheMaxAge: 60000 });
  return async authorization => {
    if (!authorization?.startsWith('Bearer ')) return null;
    return verifyAccessToken(authorization.slice(7), jwks, settings);
  };
}

export async function verifyAccessToken(token: string, jwks: JWTVerifyGetKey, settings: Pick<AuthSettings, 'issuer' | 'audience'>): Promise<Principal | null> {
  try {
    const { payload, protectedHeader } = await jwtVerify(token, jwks, {
      issuer: settings.issuer, audience: settings.audience, algorithms: ['RS256', 'ES256'],
      requiredClaims: ['sub', 'exp', 'iat'], maxTokenAge: '15 minutes', clockTolerance: 5,
    });
    if (protectedHeader.typ && !['JWT', 'at+jwt'].includes(protectedHeader.typ)) return null;
    if (payload.exp! - payload.iat! > 900 || !payload.sub || !Array.isArray(payload.roles)) return null;
    return { subject: payload.sub, roles: roles.filter(role => (payload.roles as unknown[]).includes(role)) };
  } catch { return null; }
}

export async function authSettingsFromEnv(): Promise<AuthSettings> {
  const mode = process.env.AUTH_MODE;
  const profile = process.env.APP_PROFILE;
  if (!['development', 'oidc'].includes(mode ?? '') || !['local', 'laboratory', 'production'].includes(profile ?? '')) throw new Error('Explicit AUTH_MODE and APP_PROFILE required');
  return {
    mode: mode as AuthSettings['mode'], profile: profile as AuthSettings['profile'],
    isolated: process.env.LAB_ISOLATED === 'true', host: process.env.APP_HOST ?? '127.0.0.1',
    devTokens: process.env.DEV_TOKENS_FILE ? JSON.parse(await readFile(process.env.DEV_TOKENS_FILE, 'utf8')) : undefined,
    issuer: process.env.OIDC_ISSUER, audience: process.env.OIDC_AUDIENCE, clientId: process.env.OIDC_CLIENT_ID,
    scope: process.env.OIDC_SCOPE ?? 'openid profile',
  };
}
