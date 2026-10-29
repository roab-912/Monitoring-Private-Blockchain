import { readFile } from 'node:fs/promises';
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { Type, type Static, type TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

export class ExplorerError extends Error {
  constructor(public readonly code: string, public readonly sourceId?: string) { super(code); }
}
export const RpcSourceSchema = Type.Object({ id: Type.String({ pattern: '^[a-z][a-z0-9-]{0,47}$' }), label: Type.String({ minLength: 1, maxLength: 100 }),
  url: Type.String({ maxLength: 512 }), allowedCidrs: Type.Array(Type.String(), { minItems: 1, maxItems: 8 }) }, { additionalProperties: false });
export type RpcSource = Static<typeof RpcSourceSchema>;
export function decode<T extends TSchema>(schema: T, value: unknown): Static<T> {
  if (!Value.Check(schema, value)) throw new ExplorerError('INVALID_RPC_DATA');
  return value as Static<T>;
}
export function validateSources(input: unknown): RpcSource[] {
  const sources = decode(Type.Array(RpcSourceSchema, { maxItems: 20 }), input);
  if (new Set(sources.map(s => s.id)).size !== sources.length) throw new Error('Duplicate RPC source IDs');
  for (const source of sources) {
    const url = new URL(source.url);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash || url.search) throw new Error('RPC URLs must not contain credentials, query or fragment');
    sourceBlockList(source);
  }
  return sources;
}
export async function sourcesFromEnv(): Promise<RpcSource[]> {
  return process.env.RPC_SOURCES_FILE ? validateSources(JSON.parse(await readFile(process.env.RPC_SOURCES_FILE, 'utf8'))) : [];
}
function sourceBlockList(source: RpcSource) {
  const list = new BlockList();
  for (const cidr of source.allowedCidrs) {
    const [address, prefix, extra] = cidr.split('/'); const version = isIP(address);
    if (!version || extra || prefix === undefined || !/^\d+$/.test(prefix) || Number(prefix) > (version === 4 ? 32 : 128)) throw new Error('Invalid approved RPC subnet');
    list.addSubnet(address, Number(prefix), version === 4 ? 'ipv4' : 'ipv6');
  }
  return list;
}
export async function resolveApproved(source: RpcSource) {
  const url = new URL(source.url); const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await lookup(hostname, { all: true });
  const allowed = sourceBlockList(source);
  if (!addresses.length || addresses.some(a => !allowed.check(a.address, a.family === 4 ? 'ipv4' : 'ipv6') || a.address === '169.254.169.254')) {
    throw new ExplorerError('RPC_ADDRESS_DENIED', source.id);
  }
  return addresses[0];
}

// No generic method, endpoint, header or parameter forwarding is exposed by the API.
export type ReadMethod = 'eth_chainId' | 'net_version' | 'web3_clientVersion' | 'rpc_modules' | 'eth_blockNumber' |
  'eth_getBlockByNumber' | 'eth_getTransactionReceipt' | 'eth_getLogs';
const methods: readonly string[] = ['eth_chainId','net_version','web3_clientVersion','rpc_modules','eth_blockNumber','eth_getBlockByNumber','eth_getTransactionReceipt','eth_getLogs'];
export async function readRpc(source: RpcSource, method: ReadMethod, params: unknown[] = []): Promise<unknown> {
  if (!methods.includes(method)) throw new ExplorerError('RPC_METHOD_DENIED', source.id);
  try {
    const address = await Promise.race([resolveApproved(source), new Promise<never>((_, reject) => {
      const timer = setTimeout(() => reject(new ExplorerError('RPC_DNS_TIMEOUT', source.id)), 3000); timer.unref();
    })]);
    const url = new URL(source.url);
    const payload = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
    const raw = await new Promise<string>((accept, reject) => {
      const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
        method: 'POST', agent: false, family:address.family, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
        // Pin the validated address for this request, including when DNS changes afterward.
        lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
      }, response => {
        if (response.statusCode !== 200) { response.resume(); reject(new ExplorerError('RPC_HTTP_ERROR', source.id)); return; }
        const chunks: Buffer[] = []; let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > 8 * 1024 * 1024) { response.destroy(); reject(new ExplorerError('LIMIT_EXCEEDED', source.id)); }
          else chunks.push(chunk);
        });
        response.once('end', () => accept(Buffer.concat(chunks).toString('utf8')));
        response.once('error', () => reject(new ExplorerError('RPC_UNAVAILABLE', source.id)));
      });
      const timer = setTimeout(() => request.destroy(new Error('timeout')), 4000);
      request.once('close', () => clearTimeout(timer));
      request.once('error', () => reject(new ExplorerError('RPC_UNAVAILABLE', source.id)));
      request.end(payload);
    });
    const result = JSON.parse(raw) as { jsonrpc?: unknown; id?: unknown; result?: unknown; error?: unknown };
    if (result.jsonrpc !== '2.0' || result.id !== 1 || result.error || !Object.hasOwn(result, 'result')) throw new ExplorerError('RPC_CAPABILITY_ERROR', source.id);
    return result.result;
  } catch (error) {
    if (error instanceof ExplorerError) throw error;
    throw new ExplorerError('RPC_UNAVAILABLE', source.id);
  }
}
