import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import type { Database } from '../../packages/persistence/db.js';
import { Operation,ErrorResponse } from '../../packages/contracts/api.js';
import { Address,AddressView,BlockPage,BlockView,ConnectionRequest,Decimal,Hash,IndexStatus,LogPage,PageQuery,SearchResult,SourceOptions,TransactionPage,TransactionView } from '../../packages/contracts/explorer.js';
import { enqueueConnection } from '../../packages/explorer/connections.js';
import { activeNetworkId,blockDto,blockSelect,indexStatus,logDto,transactionDto,transactionSelect,tupleCursor } from '../../packages/explorer/read-model.js';
import { ExplorerError,type RpcSource } from '../../packages/besu-adapter/rpc.js';

export async function explorerRoutes(app:FastifyInstance,db:Database,sources:RpcSource[]) {
  const api=app.withTypeProvider<TypeBoxTypeProvider>();
  const security=[{bearerAuth:[]}]; const errors={400:ErrorResponse,401:ErrorResponse,403:ErrorResponse,404:ErrorResponse,409:ErrorResponse,429:ErrorResponse,503:ErrorResponse};
  api.get('/api/explorer/status',{schema:{security,response:{200:IndexStatus,...errors}}},async()=>indexStatus(db));
  api.get('/api/explorer/sources',{config:{adminOnly:true},schema:{security,response:{200:SourceOptions,...errors}}},async()=>sources.map(({id,label})=>({id,label})));
  api.post('/api/explorer/connection',{schema:{security,body:ConnectionRequest,
    headers:Type.Object({'idempotency-key':Type.String({minLength:8,maxLength:128,pattern:'^[a-zA-Z0-9_-]+$'})}),response:{202:Operation,...errors}}},
  async(request,reply)=>reply.code(202).send(await enqueueConnection(db,request.body,request.principal!.subject,request.headers['idempotency-key'],request.id,sources)));
  api.get('/api/explorer/blocks',{schema:{security,querystring:PageQuery,response:{200:BlockPage,...errors}}},async request=>{
    const network=await activeNetworkId(db);const {limit=20,before}=request.query;
    if(before!==undefined&&!/^(0|[1-9][0-9]{0,77})$/.test(before))throw new ExplorerError('INVALID_CURSOR');
    const rows=(await db.query(`${blockSelect} WHERE b.network_id=$1 AND ($2::numeric IS NULL OR b.height<$2) ORDER BY b.height DESC LIMIT $3`,[network,before??null,limit+1])).rows;
    return {items:rows.slice(0,limit).map(blockDto),nextCursor:rows.length>limit?rows[limit-1].height:null};
  });
  api.get('/api/explorer/blocks/:height',{schema:{security,params:Type.Object({height:Decimal}),response:{200:BlockView,...errors}}},async(request,reply)=>{
    const rows=await db.query(`${blockSelect} WHERE b.network_id=$1 AND b.height=$2`,[await activeNetworkId(db),request.params.height]);
    return rows.rowCount?blockDto(rows.rows[0]):reply.code(404).send({error:'Block not indexed'});
  });
  const txList=async(network:string,limit:number,before:string|undefined,filter:{height?:string;address?:string}={})=>{
    const cursor=tupleCursor(before);
    const rows=(await db.query(`${transactionSelect} WHERE t.network_id=$1
      AND ($2::numeric IS NULL OR (t.block_height,t.transaction_index)<($2::numeric,$3::int))
      AND ($4::numeric IS NULL OR t.block_height=$4)
      AND ($5::text IS NULL OR t.sender=$5 OR t.recipient=$5 OR r.contract_address=$5)
      ORDER BY t.block_height DESC,t.transaction_index DESC LIMIT $6`,[network,cursor?.[0]??null,cursor?.[1]??null,filter.height??null,filter.address??null,limit+1])).rows;
    return {items:rows.slice(0,limit).map(transactionDto),nextCursor:rows.length>limit?`${rows[limit-1].block_height}:${rows[limit-1].transaction_index}`:null};
  };
  api.get('/api/explorer/transactions',{schema:{security,querystring:PageQuery,response:{200:TransactionPage,...errors}}},async request=>txList(await activeNetworkId(db),request.query.limit??20,request.query.before));
  api.get('/api/explorer/blocks/:height/transactions',{schema:{security,params:Type.Object({height:Decimal}),querystring:PageQuery,response:{200:TransactionPage,...errors}}},
    async request=>txList(await activeNetworkId(db),request.query.limit??20,request.query.before,{height:request.params.height}));
  api.get('/api/explorer/transactions/:hash',{schema:{security,params:Type.Object({hash:Hash}),response:{200:TransactionView,...errors}}},async(request,reply)=>{
    const rows=await db.query(`${transactionSelect} WHERE t.network_id=$1 AND t.hash=$2`,[await activeNetworkId(db),request.params.hash.toLowerCase()]);
    return rows.rowCount?transactionDto(rows.rows[0]):reply.code(404).send({error:'Transaction not indexed; no successful receipt can be inferred'});
  });
  api.get('/api/explorer/addresses/:address',{schema:{security,params:Type.Object({address:Address}),response:{200:AddressView,...errors}}},async request=>{
    const network=await activeNetworkId(db);const address=request.params.address.toLowerCase();
    const row=(await db.query(`SELECT
      (SELECT count(*)::text FROM chain_transactions t JOIN chain_receipts r ON (r.network_id,r.transaction_hash)=(t.network_id,t.hash)
        WHERE t.network_id=$1 AND (t.sender=$2 OR t.recipient=$2 OR r.contract_address=$2)) AS transaction_count,
      (SELECT count(*)::text FROM chain_logs WHERE network_id=$1 AND address=$2) AS log_count,
      EXISTS(SELECT 1 FROM chain_receipts WHERE network_id=$1 AND contract_address=$2 AND status='success') AS observed_creation`,[network,address])).rows[0];
    return {networkId:network,address,transactionCount:row.transaction_count,logCount:row.log_count,observedContractCreation:row.observed_creation};
  });
  api.get('/api/explorer/addresses/:address/transactions',{schema:{security,params:Type.Object({address:Address}),querystring:PageQuery,response:{200:TransactionPage,...errors}}},
    async request=>txList(await activeNetworkId(db),request.query.limit??20,request.query.before,{address:request.params.address.toLowerCase()}));
  api.get('/api/explorer/logs',{schema:{security,querystring:Type.Object({...PageQuery.properties,address:Type.Optional(Address),transactionHash:Type.Optional(Hash)},{additionalProperties:false}),response:{200:LogPage,...errors}}},async request=>{
    const {limit=20,before,address,transactionHash}=request.query;const cursor=tupleCursor(before);
    const rows=(await db.query(`SELECT * FROM chain_logs WHERE network_id=$1
      AND ($2::numeric IS NULL OR (block_height,log_index)<($2::numeric,$3::int)) AND ($4::text IS NULL OR address=$4)
      AND ($5::text IS NULL OR transaction_hash=$5) ORDER BY block_height DESC,log_index DESC LIMIT $6`,
    [await activeNetworkId(db),cursor?.[0]??null,cursor?.[1]??null,address?.toLowerCase()??null,transactionHash?.toLowerCase()??null,limit+1])).rows;
    return {items:rows.slice(0,limit).map(logDto),nextCursor:rows.length>limit?`${rows[limit-1].block_height}:${rows[limit-1].log_index}`:null};
  });
  api.get('/api/explorer/search',{schema:{security,querystring:Type.Object({q:Type.String({minLength:1,maxLength:80})},{additionalProperties:false}),response:{200:SearchResult,...errors}}},async request=>{
    const q=request.query.q.trim().toLowerCase();const network=await activeNetworkId(db);
    if(/^0x[0-9a-f]{40}$/.test(q))return {kind:'address' as const,value:q};
    if(/^[0-9]{1,78}$/.test(q)) {
      const height=BigInt(q).toString();const exists=await db.query('SELECT 1 FROM chain_blocks WHERE network_id=$1 AND height=$2',[network,height]);
      return {kind:exists.rowCount?'block' as const:'not_found' as const,value:height};
    }
    if(/^0x[0-9a-f]{64}$/.test(q)) {
      const block=await db.query('SELECT height::text FROM chain_blocks WHERE network_id=$1 AND hash=$2',[network,q]);
      if(block.rowCount)return {kind:'block' as const,value:block.rows[0].height};
      const tx=await db.query('SELECT 1 FROM chain_transactions WHERE network_id=$1 AND hash=$2',[network,q]);
      return {kind:tx.rowCount?'transaction' as const:'not_found' as const,value:q};
    }
    throw new ExplorerError('INVALID_SEARCH');
  });
}
