import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createAuthenticator, validateAuthSettings, verifyAccessToken, type AuthSettings } from '../../packages/auth/auth.js';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
const token = randomBytes(32).toString('hex');
const settings: AuthSettings = { mode: 'development', profile: 'local', isolated: true, host: '127.0.0.1', devTokens: { Viewer: token } };
test('development authentication fails closed outside isolated local/lab profiles', () => {
  assert.doesNotThrow(() => validateAuthSettings(settings));
  for (const change of [{ profile: 'production' as const }, { isolated: false }, { host: '0.0.0.0' }, { devTokens: { Viewer: 'password' } }]) {
    assert.throws(() => validateAuthSettings({ ...settings, ...change }));
  }
  assert.throws(() => validateAuthSettings({ ...settings, mode: 'oidc', issuer: 'http://idp', audience: 'api', clientId: 'web' }));
  assert.throws(() => validateAuthSettings({ mode: 'oidc', profile: 'production', host: '127.0.0.1', isolated: false, issuer: 'https://idp.example', audience: 'web', clientId: 'web' }));
});
test('development tokens never imply additional roles', async () => {
  const authenticate = await createAuthenticator(settings);
  assert.equal(await authenticate(undefined), null);
  assert.equal(await authenticate('Bearer invalid'), null);
  assert.deepEqual((await authenticate(`Bearer ${token}`))?.roles, ['Viewer']);
});

test('OIDC cryptographic verification rejects foreign, expired and oversized-lifetime tokens', async () => {
  const keys = await generateKeyPair('RS256');
  const jwk = await exportJWK(keys.publicKey);
  const jwks = createLocalJWKSet({ keys: [{ ...jwk, kid: 'test-key', alg: 'RS256' }] });
  const now = Math.floor(Date.now() / 1000);
  const settings = { issuer: 'https://identity.example/realms/console', audience: 'console-api' };
  const sign = (claims: Record<string, unknown> = {}) => new SignJWT({ sub: 'person', iss: settings.issuer, aud: settings.audience,
    iat: now, exp: now + 300, roles: ['Viewer', 'unrecognized'], ...claims }).setProtectedHeader({ alg: 'RS256', kid: 'test-key', typ: 'at+jwt' }).sign(keys.privateKey);
  assert.deepEqual(await verifyAccessToken(await sign(), jwks, settings), { subject: 'person', roles: ['Viewer'] });
  for (const claims of [{ iss: 'https://foreign.example' }, { aud: 'other-api' }, { exp: now - 60 }, { exp: now + 3600 }, { iat: now + 120 }, { roles: undefined }]) {
    assert.equal(await verifyAccessToken(await sign(claims), jwks, settings), null);
  }
  const otherKeys = await generateKeyPair('RS256');
  const forged = await new SignJWT({ sub: 'attacker', iss: settings.issuer, aud: settings.audience, roles: ['Administrator'] }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).setIssuedAt().setExpirationTime('5m').sign(otherKeys.privateKey);
  assert.equal(await verifyAccessToken(forged, jwks, settings), null);
});
