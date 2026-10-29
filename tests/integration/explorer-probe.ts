import assert from 'node:assert/strict';
import { randomUUID,randomBytes } from 'node:crypto';
import { readFile,writeFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { createServer } from 'node:http';
import { createPublicClient,createWalletClient,defineChain,http,type Hex,type Abi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { database,type Database } from '../../packages/persistence/db.js';
import { migrate } from '../../packages/persistence/migrate.js';
import { activeConnection,indexTick } from '../../packages/explorer/indexer.js';
import { indexStatus } from '../../packages/explorer/read-model.js';
import { runConnection } from '../../packages/explorer/connections.js';
import { readRpc,sourcesFromEnv,type RpcSource,type ReadMethod } from '../../packages/besu-adapter/rpc.js';
import { buildServer } from '../../apps/api/server.js';
import type { TransactionDto,BlockDto,LogDto } from '../../packages/contracts/explorer.js';

const phase=process.argv[2];let stage='initialization';const db=database();const sources=await sourcesFromEnv();
const tokens=JSON.parse(await readFile('/run/secrets/dev_tokens','utf8'));
const manifest=JSON.parse(await readFile('/lab/public.json','utf8'));
const before=JSON.parse(await readFile('/evidence/before.json','utf8'));
const artifact=JSON.parse(await readFile('dist/contracts/Witness.json','utf8')) as {abi:Abi};
const chain=defineChain({id:1337,name:'QBFT verification',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:{default:{http:['http://rpc:8549']}}});
const client=createPublicClient({chain,transport:http(chain.rpcUrls.default.http[0])});
const wallet=createWalletClient({chain,account:privateKeyToAccount((await readFile('/run/secrets/witness_key','utf8')).trim() as Hex),transport:http(chain.rpcUrls.default.http[0])});
async function api<T>(path:string):Promise<T> {
  const response=await fetch(`${process.env.API_URL}${path}`,{headers:{Authorization:`Bearer ${tokens.Viewer}`},signal:AbortSignal.timeout(10000)});
  assert.equal(response.status,200,`API ${path} must return 200`);return response.json() as Promise<T>;
}
async function until<T>(action:()=>Promise<T>,label:string):Promise<T> {
  for(let attempt=0;attempt<180;attempt++){try{return await action();}catch{await setTimeout(1000);}}
  throw new Error(`TIMEOUT_${label}`);
}
async function waitIndexed(height:bigint) {
  return until(async()=>{const status=await indexStatus(db);assert.ok(BigInt(status.nextBlock)>height);assert.ok(!status.incidentCode);return status;},'indexed');
}
async function snapshot(database:Database=db) {
  const client=await database.connect();
  try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const status=await indexStatus(client);assert.ok(status.network);
  const rows=(await client.query(`SELECT count(*)::text AS count,min(height)::text AS first,max(height)::text AS last FROM chain_blocks WHERE network_id=$1`,[status.network.id])).rows[0];
  assert.equal(rows.first,'0');assert.equal(rows.count,status.nextBlock);assert.equal(rows.last,(BigInt(status.nextBlock)-1n).toString());
  const tx=(await client.query(`SELECT (SELECT count(*)::text FROM chain_transactions WHERE network_id=$1) AS tx,
    (SELECT count(*)::text FROM chain_receipts WHERE network_id=$1) AS receipts`,[status.network.id])).rows[0];
  assert.equal(tx.tx,tx.receipts);
  await client.query('COMMIT');
  return {status,nextBlock:status.nextBlock,lastHash:status.indexedHash,blockCount:rows.count,transactionCount:tx.tx,networkId:status.network.id};
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
const save=(name:string,data:unknown)=>writeFile(`/evidence/explorer-${name}.json`,JSON.stringify({recordedAt:new Date().toISOString(),...data as object},null,2)+'\n');

async function faultTests() {
  stage='foreign genesis';
  const foreign:RpcSource={id:'foreign',label:'Isolated foreign genesis',url:'http://foreign:8555',allowedCidrs:['172.29.77.20/32']};
  const foreignZero=await until(async()=>{const zero=await readRpc(foreign,'eth_getBlockByNumber',['0x0',true]) as {hash:string};assert.ok(zero.hash);return zero;},'foreign');
  assert.equal(BigInt(await readRpc(foreign,'eth_chainId') as string),1337n);
  const baseline=await snapshot();assert.notEqual(foreignZero.hash,baseline.status.network!.genesisHash);
  const auth={mode:'development' as const,profile:'local' as const,isolated:true,host:'127.0.0.1',devTokens:{Administrator:randomBytes(32).toString('hex')}};
  const app=await buildServer({db,auth,rpcSources:[foreign]});
  let rejectedJob:string;
  try {
    const queued=await app.inject({method:'POST',url:'/api/explorer/connection',headers:{authorization:`Bearer ${auth.devTokens.Administrator}`,'idempotency-key':randomUUID()},
      payload:{name:'Negative genesis test',chainId:'1337',networkId:'1337',genesisHash:baseline.status.network!.genesisHash,sourceIds:['foreign']}});
    assert.equal(queued.statusCode,202);rejectedJob=queued.json().id;
    await runConnection(db,randomUUID(),[foreign]);
    const job=(await db.query('SELECT state,error_code FROM operations WHERE id=$1',[rejectedJob])).rows[0];
    assert.equal(job.state,'FAILED');assert.equal(job.error_code,'GENESIS_MISMATCH');
    assert.equal((await activeConnection(db))!.generation,baseline.status.generation);
  } finally{await app.close();}

  stage='verified imported connection in isolated database';
  const dbName=`bpc_explorer_${process.pid}_${randomBytes(4).toString('hex')}`;assert.match(dbName,/^bpc_explorer_[0-9]+_[0-9a-f]+$/);
  await db.query(`CREATE DATABASE ${dbName}`);
  const ownerUrl=new URL((await readFile(process.env.DATABASE_URL_FILE!,'utf8')).trim());ownerUrl.pathname=`/${dbName}`;
  const imported=database(ownerUrl.toString());
  let importedEvidence;
  try {
    await migrate(imported);
    const isolatedApi=await buildServer({db:imported,auth,rpcSources:sources});
    try {
      const response=await isolatedApi.inject({method:'POST',url:'/api/explorer/connection',headers:{authorization:`Bearer ${auth.devTokens.Administrator}`,'idempotency-key':randomUUID()},
        payload:{name:'Verified import',chainId:'1337',networkId:'1337',genesisHash:baseline.status.network!.genesisHash,sourceIds:sources.map(s=>s.id)}});
      assert.equal(response.statusCode,202);await runConnection(imported,randomUUID(),sources);
      const job=(await imported.query('SELECT state,error_code FROM operations WHERE id=$1',[response.json().id])).rows[0];assert.equal(job.state,'SUCCEEDED');
      assert.equal((await indexStatus(imported)).network!.ownership,'imported');
      assert.equal(await indexTick(imported,sources,{maxBlocks:3,maxWorkMs:10000}),3);
      importedEvidence=await snapshot(imported);
      await imported.query('ALTER TABLE chain_blocks ADD CONSTRAINT qualification_write_failure CHECK(height<3)');
      assert.equal(await indexTick(imported,sources,{maxBlocks:1}),0);
      assert.equal((await indexStatus(imported)).state,'INDEX_ERROR');
      assert.equal((await snapshot(imported)).nextBlock,'3');
      await imported.query('ALTER TABLE chain_blocks DROP CONSTRAINT qualification_write_failure');
      assert.equal(await indexTick(imported,sources,{maxBlocks:1}),1);
    }finally{await isolatedApi.close();}
  } finally{await imported.end();await db.query(`DROP DATABASE ${dbName}`);}

  stage='injected RPC divergence and parent hash';
  let mode:'hash'|'parent'|'receipt'='hash';let faultHeight=BigInt((await indexStatus(db)).nextBlock);let missingHash='';
  const proxy=createServer((request,response)=>{
    void(async()=>{
      let body='';for await(const chunk of request)body+=chunk.toString();
      const rpc=JSON.parse(body) as {method:ReadMethod;params:unknown[];id:number};
      const id=(request.url??'').slice(1);const upstream=sources.find(s=>s.id===id);assert.ok(upstream);
      let result=await readRpc(upstream,rpc.method,rpc.params);
      if(rpc.method==='eth_getBlockByNumber'&&BigInt(rpc.params[0] as string)===faultHeight) {
        if(mode==='hash'&&id===sources[0].id)result={...result as object,hash:`0x${'f'.repeat(64)}`};
        if(mode==='parent')result={...result as object,parentHash:`0x${'e'.repeat(64)}`};
      }
      if(mode==='receipt'&&rpc.method==='eth_getTransactionReceipt'&&rpc.params[0]===missingHash&&id===sources[0].id)result=null;
      response.writeHead(200,{'Content-Type':'application/json'});response.end(JSON.stringify({jsonrpc:'2.0',id:rpc.id,result}));
    })().catch(()=>{response.writeHead(500);response.end();});
  });
  await new Promise<void>(accept=>proxy.listen(0,'127.0.0.1',accept));const address=proxy.address();assert.ok(address&&typeof address==='object');
  const injected=sources.map(source=>({...source,url:`http://127.0.0.1:${address.port}/${source.id}`,allowedCidrs:['127.0.0.1/32']}));
  const injectionEvidence=[];
  try {
    await until(async()=>{assert.ok(BigInt(await readRpc(sources[0],'eth_blockNumber') as string)>=faultHeight);},'next-block');
    for(const corruption of ['hash','parent'] as const) {
      mode=corruption;const saved=await snapshot();faultHeight=BigInt(saved.nextBlock);
      assert.equal(await indexTick(db,injected,{maxBlocks:1}),0);
      const current=await snapshot();assert.equal(current.nextBlock,saved.nextBlock);assert.equal(current.status.state,'DIVERGED');
      assert.equal(current.status.incidentCode,corruption==='hash'?'SOURCES_DIVERGED':'PARENT_HASH_MISMATCH');
      injectionEvidence.push({injection:corruption,state:current.status.state,incidentCode:current.status.incidentCode,nextBlock:current.nextBlock,historyPreserved:true});
    }
    mode='receipt';
    const txHash=await wallet.writeContract({address:before.contract.address,abi:artifact.abi,functionName:'setValue',args:[BigInt(before.contract.value)],gas:200000n,gasPrice:0n,type:'legacy'});
    const receipt=await client.waitForTransactionReceipt({hash:txHash,timeout:60000});assert.equal(receipt.status,'success');missingHash=txHash;faultHeight=receipt.blockNumber;
    while(BigInt((await indexStatus(db)).nextBlock)<faultHeight) {
      const difference=faultHeight-BigInt((await indexStatus(db)).nextBlock);
      const progress=await indexTick(db,sources,{maxBlocks:difference>64n?64:Number(difference),maxWorkMs:10000});assert.ok(progress>0);
    }
    const saved=await snapshot();assert.equal(await indexTick(db,injected,{maxBlocks:1}),0);
    const missing=await snapshot();assert.equal(missing.nextBlock,saved.nextBlock);assert.equal(missing.status.state,'MISSING_RECEIPT');
    assert.equal((await db.query('SELECT 1 FROM chain_transactions WHERE network_id=$1 AND hash=$2',[saved.networkId,txHash])).rowCount,0);
    const notIndexed=await fetch(`${process.env.API_URL}/api/explorer/transactions/${txHash}`,{headers:{Authorization:`Bearer ${tokens.Viewer}`}});assert.equal(notIndexed.status,404);
    injectionEvidence.push({injection:'missing-receipt',state:missing.status.state,nextBlock:missing.nextBlock,historyPreserved:true});
    assert.equal(await indexTick(db,sources,{maxBlocks:1}),1);
    assert.equal((await api<TransactionDto>(`/api/explorer/transactions/${txHash}`)).receipt.status,'success');
  } finally{await new Promise<void>((accept,reject)=>proxy.close(error=>error?reject(error):accept()));}
  await save('faults',{foreignGenesis:{chainId:'1337',expected:baseline.status.network!.genesisHash,actual:foreignZero.hash,jobId:rejectedJob!,result:'GENESIS_MISMATCH'},
    importedConnection:{isolatedDatabase:true,verified:true,evidence:importedEvidence},rpcFaultInjection:injectionEvidence,
    note:'Injected RPC responses test index safety; they are not a real Byzantine fork.'});
}

try {
  if(phase==='baseline') {
    stage='real transaction with value beyond Number precision';
    const hash=await wallet.sendTransaction({to:manifest.instances[0].nodeAddress,value:9007199254740993n,gas:21000n,gasPrice:0n,type:'legacy'});
    const receipt=await client.waitForTransactionReceipt({hash,timeout:60000});assert.equal(receipt.status,'success');
    await waitIndexed(receipt.blockNumber);
    stage='explorer API and pagination';
    const tx=await api<TransactionDto>(`/api/explorer/transactions/${hash}`);assert.equal(tx.valueWei,'9007199254740993');
    const creation=await api<TransactionDto>(`/api/explorer/transactions/${before.contract.deploymentHash}`);assert.equal(creation.kind,'creation');assert.equal(creation.receipt.status,'success');
    const reverted=await api<TransactionDto>(`/api/explorer/transactions/${before.contract.revertHash}`);assert.equal(reverted.receipt.status,'reverted');
    const written=await api<TransactionDto>(`/api/explorer/transactions/${before.contract.writeHash}`);assert.equal(written.receipt.status,'success');
    const logs=await api<{items:LogDto[]}>(`/api/explorer/logs?transactionHash=${before.contract.writeHash}`);assert.ok(logs.items.length>0);
    assert.equal(BigInt(`0x${logs.items[0].data.slice(-64)}`).toString(),before.contract.value);
    const block=await api<BlockDto>(`/api/explorer/blocks/${before.contract.writeBlock}`);assert.equal(block.hash,before.contract.writeBlockHash);
    const page1=await api<{items:BlockDto[];nextCursor:string|null}>('/api/explorer/blocks?limit=2');assert.ok(page1.nextCursor);
    const page2=await api<{items:BlockDto[]}>(`/api/explorer/blocks?limit=2&before=${page1.nextCursor}`);
    assert.equal(new Set([...page1.items,...page2.items].map(b=>b.height)).size,4);
    for(const [q,kind]of [[block.hash,'block'],[block.height,'block'],[hash,'transaction'],[before.contract.address,'address']])assert.equal((await api<{kind:string}>(`/api/explorer/search?q=${q}`)).kind,kind);
    const badPage=await fetch(`${process.env.API_URL}/api/explorer/blocks?limit=51`,{headers:{Authorization:`Bearer ${tokens.Viewer}`}});assert.equal(badPage.status,400);
    const anon=await fetch(`${process.env.API_URL}/api/explorer/blocks`);assert.equal(anon.status,401);
    const forbidden=await fetch(`${process.env.API_URL}/api/explorer/connection`,{method:'POST',headers:{Authorization:`Bearer ${tokens.Viewer}`,'Content-Type':'application/json'},body:'{}'});assert.equal(forbidden.status,403);
    await save('baseline',{scenario:'Real Besu explorer',snapshot:await snapshot(),transferHash:hash,exactValueWei:tx.valueWei,contract:before.contract,readRbac:{anonymous:401,viewerWrite:403},pagination:'passed',logs:'passed'});
  }else if(phase==='worker-down') {
    stage='worker stopped freshness';await until(async()=>{assert.equal((await indexStatus(db)).observationStale,true);},'stale-worker');
    await save('worker-down',{snapshot:await snapshot(),stoppedWith:'SIGKILL'});
  }else if(phase==='resumed') {
    stage='resume without duplicate blocks';const down=JSON.parse(await readFile('/evidence/explorer-worker-down.json','utf8')).snapshot;
    await waitIndexed(BigInt(down.nextBlock));const resumed=await snapshot();
    assert.ok(BigInt(resumed.nextBlock)>BigInt(down.nextBlock));
    const hash=(await db.query('SELECT hash FROM chain_blocks WHERE network_id=$1 AND height=$2',[down.networkId,(BigInt(down.nextBlock)-1n).toString()])).rows[0].hash;assert.equal(hash,down.lastHash);
    await save('resumed',{t02:'passed',before:down,after:resumed,prefixPreserved:true,noDuplicatesOrGaps:true});
  }else if(phase==='rpc-down') {
    stage='RPC outage, retained history and stale observation';
    await until(async()=>{const s=await indexStatus(db);assert.equal(s.state,'RPC_UNAVAILABLE');assert.equal(s.observationStale,true);},'rpc-outage');
    const frozen=await snapshot();await setTimeout(2000);assert.equal((await snapshot()).nextBlock,frozen.nextBlock);
    const written=await api<TransactionDto>(`/api/explorer/transactions/${before.contract.writeHash}`);assert.equal(written.receipt.status,'success');
    await save('rpc-down',{snapshot:frozen,historyServedFromDatabase:true,staleObservationVisible:true});
  }else if(phase==='rpc-recovered') {
    stage='RPC recovery';const down=JSON.parse(await readFile('/evidence/explorer-rpc-down.json','utf8')).snapshot;
    await waitIndexed(BigInt(down.nextBlock));await save('rpc-recovered',{snapshot:await snapshot(),historyPreserved:true,resumed:true});
  }else if(phase==='faults')await faultTests();
  else throw new Error('Unknown phase');
  console.log(`Explorer real Besu qualification ${phase}: passed`);
}catch(error){console.error(`Explorer qualification ${phase}: FAILED at ${stage} (${error instanceof Error?error.name:'error'}).`);process.exitCode=1;}
finally{await db.end();}
