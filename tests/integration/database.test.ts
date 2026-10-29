import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { database, type Database } from '../../packages/persistence/db.js';
import { migrate } from '../../packages/persistence/migrate.js';
import { claimCheck, enqueueCheck, reconcileExpired, runCheck } from '../../packages/persistence/operations.js';
import { buildServer } from '../../apps/api/server.js';
import { enqueueConnection } from '../../packages/explorer/connections.js';
import { consumeQuota } from '../../packages/explorer/read-model.js';
import { createHash } from 'node:crypto';
const ownerUrl = process.env.DATABASE_URL ?? readFileSync(process.env.DATABASE_URL_FILE!, 'utf8').trim();
const owner = database(ownerUrl);
const dbName = `bpc_test_${process.pid}_${randomBytes(4).toString('hex')}`;
let db: Database;
const networkId = randomUUID(); const machineId = randomUUID();
const nodeIds = [randomUUID(), randomUUID()];
before(async () => {
  assert.match(dbName, /^bpc_test_[0-9]+_[0-9a-f]+$/);
  await owner.query(`CREATE DATABASE ${dbName}`);
  const url = new URL(ownerUrl); url.pathname = `/${dbName}`; db = database(url.toString());
  await migrate(db); await migrate(db);
  await db.query(`INSERT INTO networks(id,name,chain_id,network_id,genesis,genesis_file_sha256,consensus,besu_version) VALUES ($1,'Test',1337,1337,'{}',$2,'QBFT_HEADER','26.9.0')`, [networkId, 'a'.repeat(64)]);
  await db.query(`INSERT INTO machines(id,network_id,name,connection_mode,address,os,architecture,failure_domain)
    VALUES ($1,$2,'Test host','local','localhost','linux','x64','host-1')`, [machineId, networkId]);
  for (const [i, id] of nodeIds.entries()) await db.query(`INSERT INTO node_instances
    (id,network_id,machine_id,service_name,purpose,p2p_identity,node_address,besu_version,storage_profile,cpu_millis,memory_bytes,disk_budget_bytes)
    VALUES ($1,$2,$3,$4,'rpc',$5,$6,'26.9.0','BONSAI_FULL',1000,1000000,10000000)`,
  [id, networkId, machineId, `test-${i}`, String(i + 1).repeat(128), `0x${String(i + 1).repeat(40)}`]);
});
after(async () => {
  if (db) await db.end();
  await owner.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await owner.end();
});
test('same host accepts two instances but refuses port and nested path collisions', async () => {
  assert.equal((await db.query('SELECT count(*)::text AS n FROM node_instances WHERE machine_id=$1', [machineId])).rows[0].n, '2');
  const results = await Promise.allSettled(nodeIds.map(id => db.query("INSERT INTO instance_ports VALUES ($1,$2,'tcp',30303,'p2p')", [id, machineId])));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.status === 'rejected').length, 1);
  await db.query("INSERT INTO instance_paths VALUES ($1,$2,'data','/srv/bpc/test/a')", [nodeIds[0], machineId]);
  await assert.rejects(db.query("INSERT INTO instance_paths VALUES ($1,$2,'data','/srv/bpc/test/a/child')", [nodeIds[1], machineId]));
  await db.query("INSERT INTO instance_paths VALUES ($1,$2,'data','/srv/bpc/test/b')", [nodeIds[1], machineId]);
  await assert.rejects(db.query("INSERT INTO instance_paths VALUES ($1,$2,'config','/srv/bpc/test/../escape')", [nodeIds[1], machineId]));
});
test('concurrent submissions deduplicate and workers cannot claim the same job', async () => {
  const key = randomUUID();
  const jobs = await Promise.all(Array.from({ length: 4 }, () => enqueueCheck(db, networkId, 'admin', key, 'test')));
  assert.equal(new Set(jobs.map(j => j.id)).size, 1);
  const claims = await Promise.all([claimCheck(db, randomUUID()), claimCheck(db, randomUUID())]);
  assert.equal(claims.filter(Boolean).length, 1);
  await assert.rejects(db.query("UPDATE operations SET plan='{}' WHERE id=$1", [jobs[0].id]));
  await db.query("UPDATE operations SET lease_until=now()-interval '1 second' WHERE id=$1", [jobs[0].id]);
  assert.equal(await reconcileExpired(db), 1);
  assert.equal((await db.query('SELECT state FROM operations WHERE id=$1', [jobs[0].id])).rows[0].state, 'NEEDS_ATTENTION');
  assert.equal(await runCheck(db, randomUUID()), false);
});
test('a real database check stores evidence and append-only audit', async () => {
  const job = await enqueueCheck(db, networkId, 'admin', randomUUID(), 'test');
  assert.equal(await runCheck(db, randomUUID()), true);
  const row = (await db.query('SELECT * FROM operations WHERE id=$1', [job.id])).rows[0];
  assert.equal(row.state, 'SUCCEEDED'); assert.equal(row.evidence.instanceCount, '2');
  await assert.rejects(db.query('DELETE FROM audit_events'));
});
test('protected API enforces direct-call RBAC, rejects shell inputs and audits denial', async () => {
  const admin = randomBytes(32).toString('hex'); const viewer = randomBytes(32).toString('hex');
  const app = await buildServer({ db, auth: { mode: 'development', profile: 'local', host: '127.0.0.1', isolated: true, devTokens: { Administrator: admin, Viewer: viewer } } });
  try {
    assert.equal((await app.inject({ url: '/api/foundation' })).statusCode, 401);
    const base = { method: 'POST' as const, url: '/api/operations/check', payload: { networkId }, headers: { authorization: `Bearer ${viewer}`, 'idempotency-key': randomUUID() } };
    assert.equal((await app.inject(base)).statusCode, 403);
    assert.equal((await app.inject({ ...base, headers: { ...base.headers, authorization: `Bearer ${admin}` }, payload: { networkId, command: 'echo injected' } })).statusCode, 400);
    assert.equal((await app.inject({ ...base, headers: { ...base.headers, authorization: `Bearer ${admin}` } })).statusCode, 202);
    const visible = await app.inject({ url: '/api/foundation', headers: { authorization: `Bearer ${viewer}` } });
    assert.equal(visible.statusCode, 200); assert.equal(visible.json().physicalFailureDomains, 1);
    assert.ok((await db.query("SELECT 1 FROM audit_events WHERE outcome='DENIED'")).rowCount! >= 2);
  } finally { await app.close(); }
});

test('network registration is durable, concurrent-idempotent and preserves large chain IDs',async()=>{
  const input={name:'Imported chain',chainId:'900719925474099312345678901234567890',networkId:'900719925474099312345678901234567890',genesisHash:`0x${'c'.repeat(64)}`,sourceIds:['reader']};
  const sources=[{id:'reader',label:'Approved source',url:'http://127.0.0.1:8545',allowedCidrs:['127.0.0.1/32']}];
  const key=randomUUID();
  const jobs=await Promise.all(Array.from({length:3},()=>enqueueConnection(db,input,'operator',key,'registration-test',sources)));
  assert.equal(new Set(jobs.map(job=>job.id)).size,1);assert.equal(jobs[0].state,'QUEUED');
  const network=(await db.query('SELECT * FROM networks WHERE chain_id=$1',[input.chainId])).rows[0];
  assert.equal(network.chain_id,input.chainId);assert.equal(network.ownership,'imported');assert.equal(network.genesis,null);assert.equal(network.genesis_block_hash,null);
  assert.equal((await db.query('SELECT * FROM explorer_connection')).rowCount,0);
  await assert.rejects(enqueueConnection(db,{...input,name:'Changed'},'operator',key,'test',sources));
  await assert.rejects(enqueueConnection(db,{...input,sourceIds:['unknown']},'operator',randomUUID(),'test',sources));
});
test('read quotas survive server recreation and all recognized roles can read indexed data',async()=>{
  const subject=randomUUID();
  const results=await Promise.all(Array.from({length:125},()=>consumeQuota(db,subject,'read')));
  assert.equal(results.filter(r=>r.allowed).length,120);
  const tokens={Viewer:randomBytes(32).toString('hex'),ContractOperator:randomBytes(32).toString('hex'),InfrastructureOperator:randomBytes(32).toString('hex'),ValidatorGovernor:randomBytes(32).toString('hex'),Administrator:randomBytes(32).toString('hex')};
  const auth={mode:'development' as const,profile:'local' as const,host:'127.0.0.1',isolated:true,devTokens:tokens};
  const app=await buildServer({db,auth,rpcSources:[{id:'reader',label:'Approved',url:'http://127.0.0.1:8545',allowedCidrs:['127.0.0.1/32']}]});
  try {
    for(const token of Object.values(tokens))assert.equal((await app.inject({url:'/api/explorer/status',headers:{authorization:`Bearer ${token}`}})).statusCode,200);
    assert.equal((await app.inject({url:'/api/explorer/sources',headers:{authorization:`Bearer ${tokens.Viewer}`}})).statusCode,403);
    const sources=await app.inject({url:'/api/explorer/sources',headers:{authorization:`Bearer ${tokens.Administrator}`}});
    assert.equal(sources.statusCode,200);assert.ok(!sources.body.includes('http://'));
    await db.query(`UPDATE api_rate_limits SET hits=120 WHERE subject_hash=$1 AND bucket='read'`,[createHash('sha256').update('development:Viewer').digest('hex')]);
  } finally{await app.close();}
  const restarted=await buildServer({db,auth});
  try {
    const denied=await restarted.inject({url:'/api/explorer/status',headers:{authorization:`Bearer ${tokens.Viewer}`}});
    assert.equal(denied.statusCode,429);assert.ok(Number(denied.headers['retry-after'])>0);
  }finally{await restarted.close();}
});
