import { createHash,randomUUID } from 'node:crypto';
import type { Database } from '../persistence/db.js';
import { audit,claimCheck,operationDto } from '../persistence/operations.js';
import { ExplorerError,type RpcSource } from '../besu-adapter/rpc.js';
import { blockAt,normalize,verifySource } from '../besu-adapter/chain.js';
import type { ConnectionInput } from '../contracts/explorer.js';

export async function enqueueConnection(db:Database,input:ConnectionInput,author:string,key:string,correlationId:string,sources:RpcSource[]) {
  if(input.sourceIds.some(id=>!sources.some(s=>s.id===id))) throw new ExplorerError('UNKNOWN_SOURCE');
  const client=await db.connect();
  try {
    await client.query('BEGIN');
    const inserted=await client.query(`INSERT INTO networks(id,name,chain_id,network_id,expected_genesis_hash,ownership,consensus,besu_version)
      VALUES($1,$2,$3,$4,$5,'imported','QBFT_HEADER','26.9.0')
      ON CONFLICT(chain_id,expected_genesis_hash) WHERE expected_genesis_hash IS NOT NULL DO NOTHING RETURNING id`,
    [randomUUID(),input.name,input.chainId,input.networkId,normalize(input.genesisHash)]);
    const network=(await client.query('SELECT * FROM networks WHERE chain_id=$1 AND expected_genesis_hash=$2',[input.chainId,normalize(input.genesisHash)])).rows[0];
    if(!network || network.network_id!==input.networkId) throw new ExplorerError('NETWORK_ID_CONFLICT');
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`connect:${network.id}`]);
    const existing=(await client.query('SELECT * FROM operations WHERE network_id=$1 AND author=$2 AND idempotency_key=$3',[network.id,author,key])).rows[0];
    if(existing) {
      const previous=existing.plan;
      if(previous.kind!=='network.connect' || previous.name!==input.name || previous.chainId!==input.chainId || previous.networkId!==input.networkId || previous.genesisHash!==normalize(input.genesisHash) || JSON.stringify(previous.sourceIds)!==JSON.stringify([...input.sourceIds].sort())) throw new ExplorerError('IDEMPOTENCY_CONFLICT');
      await client.query('COMMIT'); return operationDto(existing);
    }
    const active=(await client.query('SELECT generation::text FROM explorer_connection WHERE singleton=true')).rows[0];
    const plan={kind:'network.connect',...input,genesisHash:normalize(input.genesisHash),sourceIds:[...input.sourceIds].sort(),expectedGeneration:active?.generation??'0'};
    const result=await client.query(`INSERT INTO operations(id,network_id,author,kind,idempotency_key,plan,plan_sha256,state,deadline)
      VALUES($1,$2,$3,'network.connect',$4,$5,$6,'QUEUED',clock_timestamp()+interval '5 minutes') RETURNING *`,
    [randomUUID(),network.id,author,key,plan,createHash('sha256').update(JSON.stringify(plan)).digest('hex')]);
    await client.query("INSERT INTO operation_steps(operation_id,ordinal,name,state) VALUES($1,1,'verify-network-identity','PENDING')",[result.rows[0].id]);
    await audit(client,author,'network.connect.enqueue',network.id,inserted.rowCount?'IMPORTED_PENDING':'QUEUED',correlationId);
    await client.query('COMMIT'); return operationDto(result.rows[0]);
  } catch(error) {await client.query('ROLLBACK');throw error;} finally{client.release();}
}

export async function runConnection(db:Database,owner:string,sources:RpcSource[]) {
  const job=await claimCheck(db,owner,'network.connect'); if(!job)return false;
  const client=await db.connect();
  try {
    const plan=job.plan as ConnectionInput&{expectedGeneration:string};
    const selected=plan.sourceIds.map(id=>{const source=sources.find(s=>s.id===id);if(!source)throw new ExplorerError('UNKNOWN_SOURCE');return source;});
    const observations=await Promise.all(selected.map(source=>verifySource(source,plan)));
    const common=observations.reduce((min,o)=>BigInt(o.head)<min?BigInt(o.head):min,BigInt(observations[0].head));
    const heads=await Promise.all(selected.map(source=>blockAt(source,common)));
    if(new Set(heads.map(block=>normalize(block.hash))).size!==1 || new Set(heads.map(block=>normalize(block.stateRoot))).size!==1) throw new ExplorerError('SOURCES_DIVERGED');
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(709102)');
    const active=(await client.query('SELECT generation::text FROM explorer_connection WHERE singleton=true FOR UPDATE')).rows[0];
    if((active?.generation??'0')!==plan.expectedGeneration)throw new ExplorerError('CONNECTION_PLAN_STALE');
    const network=(await client.query('SELECT expected_genesis_hash,chain_id::text,network_id::text FROM networks WHERE id=$1',[job.network_id])).rows[0];
    if(!network || network.expected_genesis_hash!==plan.genesisHash || network.chain_id!==plan.chainId || network.network_id!==plan.networkId)throw new ExplorerError('PRECONDITION_FAILED');
    const verifying=await client.query(`UPDATE operations SET state='VERIFYING',updated_at=clock_timestamp() WHERE id=$1 AND state='RUNNING'
      AND lease_owner=$2 AND lease_generation=$3 AND lease_until>clock_timestamp() AND deadline>clock_timestamp() RETURNING id`,[job.id,owner,job.lease_generation]);
    if(!verifying.rowCount)throw new ExplorerError('LEASE_LOST');
    await client.query(`UPDATE networks SET genesis_block_hash=$2,besu_version='26.9.0' WHERE id=$1`,[job.network_id,plan.genesisHash]);
    await client.query(`INSERT INTO explorer_connection(singleton,network_id,source_ids) VALUES(true,$1,$2)
      ON CONFLICT(singleton) DO UPDATE SET network_id=excluded.network_id,source_ids=excluded.source_ids,generation=explorer_connection.generation+1,verified_at=clock_timestamp()`,[job.network_id,JSON.stringify(plan.sourceIds)]);
    await client.query(`INSERT INTO index_cursors(network_id,observations) VALUES($1,$2) ON CONFLICT(network_id) DO NOTHING`,[job.network_id,JSON.stringify(observations)]);
    const evidence={networkId:job.network_id,chainId:plan.chainId,genesisHash:plan.genesisHash,sourceIds:plan.sourceIds,checkedAt:new Date().toISOString()};
    await client.query(`UPDATE operations SET state='SUCCEEDED',evidence=$2,lease_owner=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE id=$1`,[job.id,evidence]);
    await client.query("UPDATE operation_steps SET state='SUCCEEDED',evidence=$2,updated_at=clock_timestamp() WHERE operation_id=$1",[job.id,evidence]);
    await client.query('DELETE FROM resource_locks WHERE operation_id=$1 AND lease_generation=$2',[job.id,job.lease_generation]);
    await audit(client,job.author,'network.connect.verify',job.network_id,'SUCCEEDED',job.id);
    await client.query('COMMIT');return true;
  } catch(error) {
    await client.query('ROLLBACK');
    const code=error instanceof ExplorerError?error.code:'CONNECTION_FAILED';
    await client.query('BEGIN');
    const failed=await client.query(`UPDATE operations SET state='FAILED',error_code=$4,lease_owner=NULL,lease_until=NULL,updated_at=clock_timestamp()
      WHERE id=$1 AND state IN ('RUNNING','VERIFYING') AND lease_owner=$2 AND lease_generation=$3 RETURNING id`,[job.id,owner,job.lease_generation,code]);
    if(failed.rowCount) {
      await client.query("UPDATE operation_steps SET state='FAILED',updated_at=clock_timestamp() WHERE operation_id=$1",[job.id]);
      await client.query('DELETE FROM resource_locks WHERE operation_id=$1 AND lease_generation=$2',[job.id,job.lease_generation]);
      await audit(client,job.author,'network.connect.verify',job.network_id,code,job.id);
    }
    await client.query('COMMIT');return true;
  } finally {client.release();}
}
