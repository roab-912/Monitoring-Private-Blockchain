import type pg from 'pg';
import type { Database } from '../persistence/db.js';
import { ExplorerError,readRpc,decode,type RpcSource } from '../besu-adapter/rpc.js';
import { blockAt,comparableBlock,decimal,normalize,RpcReceipt,sameData,validateBlock,validateReceipt,verifySource,type ChainBlock,type ChainReceipt } from '../besu-adapter/chain.js';

export type ActiveConnection = { network_id:string; generation:string; source_ids:string[]; chain_id:string; network_id_decimal:string; expected_genesis_hash:string };
export async function activeConnection(db:Database|pg.PoolClient):Promise<ActiveConnection|null> {
  return (await db.query(`SELECT c.network_id,c.generation::text,c.source_ids,n.chain_id::text,n.network_id::text AS network_id_decimal,n.expected_genesis_hash
    FROM explorer_connection c JOIN networks n ON n.id=c.network_id WHERE c.singleton=true`)).rows[0]??null;
}
function incidentState(code:string) {
  if(code==='INDEX_DATABASE_ERROR')return 'INDEX_ERROR';
  if(['SOURCES_DIVERGED','PARENT_HASH_MISMATCH','CHECKPOINT_MISMATCH'].includes(code))return 'DIVERGED';
  if(code==='MISSING_RECEIPT')return 'MISSING_RECEIPT';
  if(code==='LIMIT_EXCEEDED')return 'LIMIT_EXCEEDED';
  if(['CHAIN_ID_MISMATCH','GENESIS_MISMATCH','UNSUPPORTED_BESU_VERSION','UNSUPPORTED_CONSENSUS','UNKNOWN_SOURCE','RPC_ADDRESS_DENIED'].includes(code))return 'INVALID_SOURCE';
  if(code==='INVALID_RPC_DATA')return 'INVALID_DATA';
  return 'RPC_UNAVAILABLE';
}
async function insertBlock(client:pg.PoolClient,connection:ActiveConnection,block:ChainBlock,receipts:ChainReceipt[]) {
  const height=decimal(block.number);
  await client.query(`INSERT INTO chain_blocks(network_id,height,hash,parent_hash,timestamp_seconds,state_root,miner,gas_limit,gas_used,source_ids)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[connection.network_id,height,normalize(block.hash),normalize(block.parentHash),decimal(block.timestamp),normalize(block.stateRoot),normalize(block.miner),decimal(block.gasLimit),decimal(block.gasUsed),JSON.stringify(connection.source_ids)]);
  for(const [index,tx]of block.transactions.entries()) {
    const receipt=receipts[index];
    await client.query(`INSERT INTO chain_transactions(network_id,hash,block_height,transaction_index,sender,recipient,value_wei,nonce,gas,gas_price,input,type)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[connection.network_id,normalize(tx.hash),height,index,normalize(tx.from),tx.to?normalize(tx.to):null,decimal(tx.value),decimal(tx.nonce),decimal(tx.gas),tx.gasPrice?decimal(tx.gasPrice):null,tx.input.toLowerCase(),tx.type??'0x0']);
    await client.query(`INSERT INTO chain_receipts(network_id,transaction_hash,status,gas_used,cumulative_gas_used,effective_gas_price,contract_address)
      VALUES($1,$2,$3,$4,$5,$6,$7)`,[connection.network_id,normalize(tx.hash),receipt.status==='0x1'?'success':'reverted',decimal(receipt.gasUsed),decimal(receipt.cumulativeGasUsed),receipt.effectiveGasPrice?decimal(receipt.effectiveGasPrice):null,receipt.contractAddress?normalize(receipt.contractAddress):null]);
    for(const log of receipt.logs) {
      const index=BigInt(log.logIndex); if(index>2147483647n)throw new ExplorerError('LIMIT_EXCEEDED');
      await client.query(`INSERT INTO chain_logs(network_id,block_height,log_index,transaction_hash,address,topics,data) VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [connection.network_id,height,index.toString(),normalize(tx.hash),normalize(log.address),JSON.stringify(log.topics.map(normalize)),log.data.toLowerCase()]);
    }
  }
}

/** One bounded tick. A session lock serializes workers; cursor + complete block commit atomically. */
export async function indexTick(db:Database,sources:RpcSource[],options:{maxBlocks?:number;maxWorkMs?:number}={}):Promise<number> {
  const connection=await activeConnection(db);if(!connection)return 0;
  const client=await db.connect();let locked=false;let failureHeight:string|null=null;let committed=0;
  try {
    locked=(await client.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',[`index:${connection.network_id}`])).rows[0].locked;
    if(!locked)return 0;
    await client.query('INSERT INTO index_cursors(network_id) VALUES($1) ON CONFLICT DO NOTHING',[connection.network_id]);
    const selected=connection.source_ids.map(id=>{const source=sources.find(s=>s.id===id);if(!source)throw new ExplorerError('UNKNOWN_SOURCE');return source;});
    const observations=await Promise.all(selected.map(source=>verifySource(source,{chainId:connection.chain_id,networkId:connection.network_id_decimal,genesisHash:connection.expected_genesis_hash})));
    const head=observations.reduce((min,o)=>BigInt(o.head)<min?BigInt(o.head):min,BigInt(observations[0].head));
    const cursor=(await client.query('SELECT next_block::text,last_hash FROM index_cursors WHERE network_id=$1',[connection.network_id])).rows[0];
    let next=BigInt(cursor.next_block);let lastHash:string|null=cursor.last_hash;
    if(next>0n) {
      failureHeight=(next-1n).toString();
      const checkpoints=await Promise.all(selected.map(source=>blockAt(source,next-1n)));
      if(checkpoints.some(block=>normalize(block.hash)!==lastHash))throw new ExplorerError('CHECKPOINT_MISMATCH');
    }
    await client.query(`UPDATE index_cursors SET observed_head=$2,last_observed_at=clock_timestamp(),heartbeat_at=clock_timestamp(),observations=$3
      WHERE network_id=$1`,[connection.network_id,head.toString(),JSON.stringify(observations)]);
    const started=Date.now();
    const maxBlocks=options.maxBlocks??64; const maxWorkMs=options.maxWorkMs??2000;
    for(let count=0;count<maxBlocks && next<=head && (count===0 || Date.now()-started<maxWorkMs);count++) {
      failureHeight=next.toString();
      const blocks=await Promise.all(selected.map(source=>blockAt(source,next)));
      const block=blocks[0];
      for(const other of blocks.slice(1))if(!sameData(comparableBlock(block),comparableBlock(other)))throw new ExplorerError('SOURCES_DIVERGED');
      validateBlock(block,next,lastHash);
      if(next===0n && normalize(block.hash)!==connection.expected_genesis_hash)throw new ExplorerError('GENESIS_MISMATCH');
      const receipts:ChainReceipt[]=[];
      for(let offset=0;offset<block.transactions.length;offset+=4) {
        const chunk=await Promise.all(block.transactions.slice(offset,offset+4).map(async(tx,index)=>{
          const results=await Promise.all(selected.map(source=>readRpc(source,'eth_getTransactionReceipt',[tx.hash])));
          if(results.some(result=>result===null))throw new ExplorerError('MISSING_RECEIPT');
          const receipt=decode(RpcReceipt,results[0]);
          for(const other of results.slice(1))if(!sameData(receipt,other))throw new ExplorerError('SOURCES_DIVERGED');
          validateReceipt(receipt,block,offset+index);return receipt;
        }));
        receipts.push(...chunk);
      }
      const logs=receipts.flatMap(r=>r.logs);
      if(logs.length>4096 || logs.some((log,index)=>BigInt(log.logIndex)!==BigInt(index)))throw new ExplorerError('INVALID_RPC_DATA');
      await client.query('BEGIN');
      const current=(await client.query('SELECT network_id,generation::text FROM explorer_connection WHERE singleton=true FOR SHARE')).rows[0];
      if(current.network_id!==connection.network_id || current.generation!==connection.generation) {await client.query('ROLLBACK');return committed;}
      const saved=(await client.query('SELECT next_block::text,last_hash FROM index_cursors WHERE network_id=$1 FOR UPDATE',[connection.network_id])).rows[0];
      if(saved.next_block!==next.toString() || saved.last_hash!==lastHash)throw new ExplorerError('CHECKPOINT_MISMATCH');
      await insertBlock(client,connection,block,receipts);
      lastHash=normalize(block.hash);next++;
      await client.query(`UPDATE index_cursors SET next_block=$2,last_hash=$3,last_indexed_at=clock_timestamp(),heartbeat_at=clock_timestamp(),
        state=$4,incident_code=NULL,incident_height=NULL WHERE network_id=$1`,[connection.network_id,next.toString(),lastHash,next>head?'CAUGHT_UP':'INDEXING']);
      await client.query('COMMIT');committed++;
    }
    await client.query(`UPDATE index_cursors SET state=$2,incident_code=NULL,incident_height=NULL,heartbeat_at=clock_timestamp() WHERE network_id=$1`,[connection.network_id,next>head?'CAUGHT_UP':'INDEXING']);
    return committed;
  } catch(error) {
    await client.query('ROLLBACK');
    const code=error instanceof ExplorerError?error.code:'INDEX_DATABASE_ERROR';
    await client.query(`UPDATE index_cursors SET state=$2,incident_code=$3,incident_height=$4,heartbeat_at=clock_timestamp() WHERE network_id=$1`,[connection.network_id,incidentState(code),code,failureHeight]);
    return committed;
  } finally {
    if(locked)await client.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[`index:${connection.network_id}`]);
    client.release();
  }
}
