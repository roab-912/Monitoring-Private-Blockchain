import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import fastifyStatic from '@fastify/static';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { resolve } from 'node:path';
import type { Database } from '../../packages/persistence/db.js';
import { audit, enqueueCheck, operationDto } from '../../packages/persistence/operations.js';
import { createAuthenticator, type AuthSettings, type Principal } from '../../packages/auth/auth.js';
import { AuthConfig, CheckRequest, ErrorResponse, Foundation, Me, Operation } from '../../packages/contracts/api.js';

declare module 'fastify' { interface FastifyRequest { principal: Principal | null } }

export async function buildServer(options: { db: Database; auth: AuthSettings; staticRoot?: string }) {
  const authenticate = await createAuthenticator(options.auth);
  const app = Fastify({ logger: false, bodyLimit: 8192, requestTimeout: 10000, trustProxy: false,
    ajv: { customOptions: { removeAdditional: false } } });
  const api = app.withTypeProvider<TypeBoxTypeProvider>();
  app.decorateRequest('principal', null);
  await app.register(swagger, { openapi: { info: { title: 'Besu Console Foundation', version: '0.0.0' },
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } } } });
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff').header('Referrer-Policy', 'no-referrer');
    const connect = options.auth.mode === 'oidc' ? ` ${new URL(options.auth.issuer!).origin}` : '';
    reply.header('Content-Security-Policy', `default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'${connect}; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`);
  });
  app.setErrorHandler((error, _request, reply) => {
    if ((error as { validation?: unknown }).validation) return reply.code(400).send({ error: 'Invalid request' });
    // Never send database URLs, provider errors, headers, bodies or stack traces to clients/logs.
    return reply.code(503).send({ error: 'Service unavailable' });
  });
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: 'Not found' }));
  api.get('/health/live', { schema: { response: { 200: Type.Object({ status: Type.Literal('up') }) } } }, async () => ({ status: 'up' as const }));
  api.get('/auth/config', { schema: { response: { 200: AuthConfig } } }, async () => ({
    mode: options.auth.mode, issuer: options.auth.issuer ?? '', clientId: options.auth.clientId ?? '', scope: options.auth.scope ?? 'openid profile',
  }));
  await app.register(async scoped => {
    const protectedApi = scoped.withTypeProvider<TypeBoxTypeProvider>();
    scoped.addHook('onRequest', async (request, reply) => {
      request.principal = await authenticate(request.headers.authorization);
      const admin = request.method === 'POST';
      const allowed = request.principal && (admin ? request.principal.roles.includes('Administrator') : request.principal.roles.length > 0);
      if (!allowed) {
        await audit(options.db, request.principal?.subject ?? 'anonymous', 'api.access', request.routeOptions.url ?? '/api', 'DENIED', request.id);
        return reply.code(request.principal ? 403 : 401).send({ error: request.principal ? 'Forbidden' : 'Unauthorized' });
      }
    });
    const errors = { 401: ErrorResponse, 403: ErrorResponse, 503: ErrorResponse };
    const security = [{ bearerAuth: [] }];
    protectedApi.get('/api/me', { schema: { security, response: { 200: Me, ...errors } } }, async request => ({ ...request.principal!, mode: options.auth.mode }));
    protectedApi.get('/api/foundation', { schema: { security, response: { 200: Foundation, ...errors } } }, async () => {
      const network = (await options.db.query('SELECT id, chain_id::text FROM networks ORDER BY id LIMIT 1')).rows[0];
      if (!network) throw new Error('NETWORK_NOT_INITIALIZED');
      const machines = (await options.db.query('SELECT id,name,failure_domain AS "failureDomain" FROM machines WHERE network_id=$1 ORDER BY name', [network.id])).rows;
      const instances = (await options.db.query(`SELECT n.id,n.machine_id AS "machineId",n.service_name AS "serviceName",n.purpose,
        n.p2p_identity AS "p2pIdentity",n.node_address AS "nodeAddress",p.path AS "dataPath",
        (SELECT coalesce(json_agg(json_build_object('protocol',protocol,'port',port,'purpose',purpose) ORDER BY port,protocol),'[]')
          FROM instance_ports WHERE node_id=n.id) AS ports
        FROM node_instances n JOIN instance_paths p ON p.node_id=n.id AND p.kind='data' WHERE n.network_id=$1 ORDER BY n.service_name`, [network.id])).rows;
      const domains = new Set(machines.map(m => m.failureDomain)).size;
      return { version: '0.0.0' as const, networkId: network.id, chainId: network.chain_id, machines, instances,
        physicalFailureDomains: domains, warning: domains === 1 ? 'Un seul domaine de panne physique : la perte de cet hôte arrête le laboratoire.' : 'Inventaire déclaré ; indépendance physique à vérifier.' };
    });
    protectedApi.post('/api/operations/check', { schema: {
      security, body: CheckRequest,
      headers: Type.Object({ 'idempotency-key': Type.String({ minLength: 8, maxLength: 128, pattern: '^[a-zA-Z0-9_-]+$' }) }),
      response: { 202: Operation, 400: ErrorResponse, 404: ErrorResponse, 409: ErrorResponse, ...errors },
    } }, async (request, reply) => {
      try {
        const result = await enqueueCheck(options.db, request.body.networkId, request.principal!.subject, request.headers['idempotency-key'], request.id);
        return reply.code(202).send(result);
      } catch (error) {
        const message = (error as Error).message;
        if (message === 'UNKNOWN_NETWORK') return reply.code(404).send({ error: 'Unknown network' });
        if (message === 'IDEMPOTENCY_CONFLICT') return reply.code(409).send({ error: 'Idempotency conflict' });
        throw error;
      }
    });
    protectedApi.get('/api/operations/:id', { schema: { security,
      params: Type.Object({ id: Type.String({ format: 'uuid' }) }), response: { 200: Operation, 404: ErrorResponse, ...errors },
    } }, async (request, reply) => {
      const result = await options.db.query('SELECT * FROM operations WHERE id=$1 AND (author=$2 OR $3)',
        [request.params.id, request.principal!.subject, request.principal!.roles.includes('Administrator')]);
      if (!result.rowCount) return reply.code(404).send({ error: 'Not found' });
      return operationDto(result.rows[0]);
    });
  });
  if (options.staticRoot) {
    await app.register(fastifyStatic, { root: resolve(options.staticRoot), wildcard: false });
  }
  await app.ready();
  return app;
}
