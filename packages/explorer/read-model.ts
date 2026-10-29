import type pg from 'pg';
import { createHash } from 'node:crypto';
import type { Database } from '../persistence/db.js';
import type { BlockDto,IndexStatusDto,LogDto,TransactionDto } from '../contracts/explorer.js';
import { ExplorerError } from '../besu-adapter/rpc.js';

export async function consumeQuota(db:Database,subject:string,bucket:'read'|'write') {
  const result=await db.query(`INSERT INTO api_rate_limits(subject_hash,bucket,window_start,hits) VALUES($1,$2,date_trunc('minute',clock_timestamp()),1)
    ON CONFLICT(subject_hash,bucket) DO UPDATE SET window_start=date_trunc('minute',clock_timestamp()),
      hits=CASE WHEN api_rate_limits.window_start=date_trunc('minute',clock_timestamp()) THEN least(api_rate_limits.hits+1,100000) ELSE 1 END
    RETURNING hits, greatest(1,ceil(extract(epoch FROM window_start+interval '1 minute'-clock_timestamp())))::int AS retry`,
  [createHash('sha256').update(subject).digest('hex'),bucket]);
  return {allowed:result.rows[0].hits<=(bucket==='read'?120:10),retryAfter:result.rows[0].retry as number};
}
const iso=(value:Date|null)=>value?.toISOString()??null;
export async function indexStatus(db:Database|pg.PoolClient):Promise<IndexStatusDto> {
  const result=await db.query(`SELECT n.id,n.name,n.chain_id::text,n.network_id::text AS network_id_decimal,n.expected_genesis_hash,n.ownership,n.besu_version,
    c.generation::text,c.source_ids,i.next_block::text,i.last_hash,i.state,i.observed_head::text,i.last_observed_at,i.last_indexed_at,i.heartbeat_at,
    i.incident_code,i.incident_height::text,i.observations,
    (SELECT count(*)::text FROM chain_blocks b WHERE b.network_id=n.id) AS block_count,
    (SELECT count(*)::text FROM chain_transactions t WHERE t.network_id=n.id) AS transaction_count,
    (SELECT count(*)::text FROM chain_logs l WHERE l.network_id=n.id) AS log_count
    FROM explorer_connection c JOIN networks n ON n.id=c.network_id LEFT JOIN index_cursors i ON i.network_id=n.id WHERE singleton=true`);
  const row=result.rows[0];
  if(!row)return {network:null,generation:'0',sourceIds:[],state:'UNCONFIGURED',nextBlock:'0',indexedHeight:null,indexedHash:null,observedHead:null,lag:null,
    lastObservedAt:null,lastIndexedAt:null,heartbeatAt:null,observationStale:true,incidentCode:null,incidentHeight:null,observations:[],blockCount:'0',transactionCount:'0',logCount:'0'};
  const next=BigInt(row.next_block??'0');const observed:bigint|null=row.observed_head===null||row.observed_head===undefined?null:BigInt(row.observed_head);
  return {network:{id:row.id,name:row.name,chainId:row.chain_id,networkId:row.network_id_decimal,genesisHash:row.expected_genesis_hash,ownership:row.ownership,besuVersion:row.besu_version},
    generation:row.generation,sourceIds:row.source_ids,state:row.state??'CONNECTING',nextBlock:next.toString(),indexedHeight:next>0n?(next-1n).toString():null,
    indexedHash:row.last_hash??null,observedHead:observed?.toString()??null,lag:observed===null?null:(observed>=next?observed-next+1n:0n).toString(),
    lastObservedAt:iso(row.last_observed_at??null),lastIndexedAt:iso(row.last_indexed_at??null),heartbeatAt:iso(row.heartbeat_at??null),
    observationStale:!row.last_observed_at||Date.now()-row.last_observed_at.getTime()>15000,
    incidentCode:row.incident_code??null,incidentHeight:row.incident_height??null,observations:row.observations??[],
    blockCount:row.block_count,transactionCount:row.transaction_count,logCount:row.log_count};
}
export async function activeNetworkId(db:Database) {
  const row=(await db.query('SELECT network_id FROM explorer_connection WHERE singleton=true')).rows[0];
  if(!row)throw new ExplorerError('NO_CONNECTION');return row.network_id as string;
}
export function blockDto(row:pg.QueryResultRow):BlockDto {
  return {networkId:row.network_id,height:row.height,hash:row.hash,parentHash:row.parent_hash,stateRoot:row.state_root,miner:row.miner,timestamp:row.timestamp_seconds,
    gasLimit:row.gas_limit,gasUsed:row.gas_used,transactionCount:Number(row.transaction_count),sourceIds:row.source_ids,indexedAt:row.indexed_at.toISOString()};
}
export const blockSelect=`SELECT b.*, (SELECT count(*)::int FROM chain_transactions t WHERE t.network_id=b.network_id AND t.block_height=b.height) AS transaction_count FROM chain_blocks b`;
export function transactionDto(row:pg.QueryResultRow):TransactionDto {
  return {networkId:row.network_id,hash:row.hash,blockHeight:row.block_height,blockHash:row.block_hash,transactionIndex:row.transaction_index,sender:row.sender,recipient:row.recipient,
    valueWei:row.value_wei,nonce:row.nonce,gas:row.gas,gasPrice:row.gas_price,input:row.input,type:row.type,kind:row.recipient===null?'creation':'transaction',
    receipt:{status:row.status,gasUsed:row.receipt_gas_used,cumulativeGasUsed:row.cumulative_gas_used,effectiveGasPrice:row.effective_gas_price,contractAddress:row.contract_address},
    timestamp:row.timestamp_seconds,sourceIds:row.source_ids,indexedAt:row.indexed_at.toISOString()};
}
export const transactionSelect=`SELECT t.*,b.hash AS block_hash,b.timestamp_seconds,b.source_ids,b.indexed_at,
  r.status,r.gas_used AS receipt_gas_used,r.cumulative_gas_used,r.effective_gas_price,r.contract_address
  FROM chain_transactions t JOIN chain_blocks b ON (b.network_id,b.height)=(t.network_id,t.block_height)
  JOIN chain_receipts r ON (r.network_id,r.transaction_hash)=(t.network_id,t.hash)`;
export function logDto(row:pg.QueryResultRow):LogDto {
  return {networkId:row.network_id,blockHeight:row.block_height,logIndex:String(row.log_index),transactionHash:row.transaction_hash,address:row.address,topics:row.topics,data:row.data};
}
export function tupleCursor(before:string|undefined):[string,string]|null {
  if(before===undefined)return null;
  if(!/^(0|[1-9][0-9]{0,77}):(0|[1-9][0-9]{0,9})$/.test(before))throw new ExplorerError('INVALID_CURSOR');
  const [height,index]=before.split(':');if(BigInt(index)>2147483647n)throw new ExplorerError('INVALID_CURSOR');return [height,index];
}
