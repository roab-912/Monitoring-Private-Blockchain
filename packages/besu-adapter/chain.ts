import { Type, type Static } from '@sinclair/typebox';
import { fromRlp,toRlp } from 'viem';
import { decode, ExplorerError, readRpc, type RpcSource } from './rpc.js';

export const Hash = Type.String({ pattern: '^0x[0-9a-fA-F]{64}$' });
export const Address = Type.String({ pattern: '^0x[0-9a-fA-F]{40}$' });
export const Quantity = Type.String({ pattern: '^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$', maxLength: 66 });
const Bytes = Type.String({ pattern: '^0x(?:[0-9a-fA-F]{2})*$', maxLength: 2 * 1024 * 1024 });
export const RpcTransaction = Type.Object({ hash: Hash, blockHash: Hash, blockNumber: Quantity, transactionIndex: Quantity,
  from: Address, to: Type.Union([Address, Type.Null()]), value: Quantity, nonce: Quantity, gas: Quantity,
  gasPrice: Type.Optional(Quantity), input: Bytes, type: Type.Optional(Quantity) });
export const RpcBlock = Type.Object({ number: Quantity, hash: Hash, parentHash: Hash, stateRoot: Hash,
  timestamp: Quantity, miner: Address, gasLimit: Quantity, gasUsed: Quantity, extraData: Bytes,
  transactions: Type.Array(RpcTransaction, { maxItems: 2048 }) });
export const RpcLog = Type.Object({ address: Address, blockHash: Hash, blockNumber: Quantity, transactionHash: Hash,
  transactionIndex: Quantity, logIndex: Quantity, topics: Type.Array(Hash, { maxItems: 4 }), data: Bytes, removed: Type.Optional(Type.Boolean()) });
export const RpcReceipt = Type.Object({ transactionHash: Hash, blockHash: Hash, blockNumber: Quantity, transactionIndex: Quantity,
  status: Type.Union([Type.Literal('0x0'), Type.Literal('0x1')]), gasUsed: Quantity, cumulativeGasUsed: Quantity,
  effectiveGasPrice: Type.Optional(Quantity), contractAddress: Type.Union([Address, Type.Null()]), logs: Type.Array(RpcLog, { maxItems: 4096 }) });
export type ChainBlock = Static<typeof RpcBlock>;
export type ChainReceipt = Static<typeof RpcReceipt>;
export const decimal = (value: string) => BigInt(value).toString();
export const hexHeight = (height: bigint) => `0x${height.toString(16)}`;
export const normalize = (value: string) => value.toLowerCase();
export function sameData(left: unknown, right: unknown): boolean {
  const canonical = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
    return JSON.stringify(typeof value === 'string' && value.startsWith('0x') ? value.toLowerCase() : value);
  };
  return canonical(left) === canonical(right);
}
export function comparableBlock(block:ChainBlock) {
  if(BigInt(block.number)===0n)return block;
  const extra=fromRlp(block.extraData as `0x${string}`);
  if(!Array.isArray(extra)||extra.length!==5)throw new ExplorerError('INVALID_RPC_DATA');
  // Besu BftBlockHashing.calculateHashOfBftBlockOnchain excludes round/commit seals.
  // Different valid commit subsets for the same chain block are not a divergence.
  return {...block,extraData:toRlp([extra[0],extra[1],extra[2],'0x',[]])};
}
export async function blockAt(source: RpcSource, height: bigint): Promise<ChainBlock> {
  return decode(RpcBlock, await readRpc(source, 'eth_getBlockByNumber', [hexHeight(height), true]));
}
export async function verifySource(source: RpcSource, identity: { chainId: string; networkId: string; genesisHash: string }) {
  const [chain, network, version, genesis, head, modules] = await Promise.all([
    readRpc(source,'eth_chainId'), readRpc(source,'net_version'), readRpc(source,'web3_clientVersion'),
    readRpc(source,'eth_getBlockByNumber',['0x0',true]), readRpc(source,'eth_blockNumber'), readRpc(source,'rpc_modules'),
  ]);
  if (decimal(decode(Quantity,chain)) !== identity.chainId || decode(Type.String({ pattern: '^[0-9]+$' }),network) !== identity.networkId) throw new ExplorerError('CHAIN_ID_MISMATCH',source.id);
  const zero = decode(RpcBlock,genesis);
  if (normalize(zero.hash) !== identity.genesisHash || decimal(zero.number) !== '0') throw new ExplorerError('GENESIS_MISMATCH',source.id);
  const clientVersion = decode(Type.String({ maxLength: 256 }),version);
  if (!/^besu\/v26\.9\.0\//.test(clientVersion)) throw new ExplorerError('UNSUPPORTED_BESU_VERSION',source.id);
  try {
    const extra = fromRlp(zero.extraData as `0x${string}`);
    if (!Array.isArray(extra) || extra.length !== 5 || !Array.isArray(extra[1]) || extra[1].length === 0 || extra[1].some(a => typeof a !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(a))) throw new Error('not header QBFT');
  } catch { throw new ExplorerError('UNSUPPORTED_CONSENSUS',source.id); }
  const enabled = decode(Type.Record(Type.String(),Type.String()),modules);
  if (!Object.keys(enabled).some(key => key.toLowerCase()==='eth')) throw new ExplorerError('RPC_CAPABILITY_ERROR',source.id);
  // Exercise methods; rpc_modules alone does not prove that these calls work.
  const [receipt, logs] = await Promise.all([
    readRpc(source,'eth_getTransactionReceipt',[`0x${'0'.repeat(64)}`]),
    readRpc(source,'eth_getLogs',[{ fromBlock:'0x0',toBlock:'0x0' }]),
  ]);
  if (receipt !== null || !Array.isArray(logs) || logs.length !== 0) throw new ExplorerError('RPC_CAPABILITY_ERROR',source.id);
  return { sourceId:source.id, label:source.label, version:clientVersion, chainId:identity.chainId, genesisHash:identity.genesisHash,
    head:decimal(decode(Quantity,head)), observedAt:new Date().toISOString(), capabilities:['blocks','transactions','receipts','logs'] };
}

export function validateBlock(block: ChainBlock, height: bigint, parentHash: string | null) {
  if (BigInt(block.number)!==height || (parentHash !== null && normalize(block.parentHash)!==parentHash)) throw new ExplorerError('PARENT_HASH_MISMATCH');
  if (new Set(block.transactions.map(t => normalize(t.hash))).size !== block.transactions.length) throw new ExplorerError('INVALID_RPC_DATA');
  for (const [index, transaction] of block.transactions.entries()) {
    if (BigInt(transaction.transactionIndex)!==BigInt(index) || BigInt(transaction.blockNumber)!==height || normalize(transaction.blockHash)!==normalize(block.hash)) throw new ExplorerError('INVALID_RPC_DATA');
  }
}
export function validateReceipt(receipt: ChainReceipt, block: ChainBlock, index: number) {
  const transaction = block.transactions[index];
  if (normalize(receipt.transactionHash)!==normalize(transaction.hash) || normalize(receipt.blockHash)!==normalize(block.hash) ||
    BigInt(receipt.blockNumber)!==BigInt(block.number) || BigInt(receipt.transactionIndex)!==BigInt(index)) throw new ExplorerError('INVALID_RPC_DATA');
  for (const log of receipt.logs) {
    if (log.removed || normalize(log.blockHash)!==normalize(block.hash) || BigInt(log.blockNumber)!==BigInt(block.number) ||
      normalize(log.transactionHash)!==normalize(transaction.hash) || BigInt(log.transactionIndex)!==BigInt(index)) throw new ExplorerError('INVALID_RPC_DATA');
  }
}
