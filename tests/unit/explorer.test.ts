import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSources,resolveApproved,ExplorerError } from '../../packages/besu-adapter/rpc.js';
import { comparableBlock,decimal,sameData,validateBlock,validateReceipt,type ChainBlock,type ChainReceipt } from '../../packages/besu-adapter/chain.js';
import { toRlp } from 'viem';
import { tupleCursor } from '../../packages/explorer/read-model.js';

const hash=`0x${'a'.repeat(64)}`;const parent=`0x${'b'.repeat(64)}`;const address=`0x${'1'.repeat(40)}`;
const block:ChainBlock={number:'0x1',hash,parentHash:parent,stateRoot:hash,timestamp:'0x1',miner:address,gasLimit:'0xffffff',gasUsed:'0x5208',extraData:'0x',
  transactions:[{hash,blockHash:hash,blockNumber:'0x1',transactionIndex:'0x0',from:address,to:address,value:'0x0',nonce:'0x0',gas:'0x5208',gasPrice:'0x0',input:'0x'}]};
const receipt:ChainReceipt={transactionHash:hash,blockHash:hash,blockNumber:'0x1',transactionIndex:'0x0',status:'0x0',gasUsed:'0x5208',cumulativeGasUsed:'0x5208',contractAddress:null,logs:[]};
test('Ethereum quantities preserve uint256 precision and cursor validation bounds SQL tuple integers',()=>{
  assert.equal(decimal(`0x${'f'.repeat(64)}`),(2n**256n-1n).toString());
  assert.deepEqual(tupleCursor('9007199254740993123:42'),['9007199254740993123','42']);
  for(const cursor of ['1','1:2147483648','-1:0','1:0;SELECT','01:0'])assert.throws(()=>tupleCursor(cursor));
});
test('block and receipt consistency guards refuse broken ancestry and foreign receipts',()=>{
  validateBlock(block,1n,parent);validateReceipt(receipt,block,0);
  assert.throws(()=>validateBlock(block,1n,hash));assert.throws(()=>validateBlock(block,2n,parent));
  assert.throws(()=>validateReceipt({...receipt,blockHash:parent},block,0));
  assert.throws(()=>validateReceipt({...receipt,transactionIndex:'0x1'},block,0));
  assert.equal(receipt.status,'0x0');
  assert.ok(sameData({hash,other:'0xAB'},{other:'0xab',hash}));assert.ok(!sameData(block,{...block,hash:parent}));
});
test('RPC source policy rejects credentials, free-form fields and non-approved resolved addresses',async()=>{
  const source={id:'reader',label:'Read endpoint',url:'http://127.0.0.1:8545',allowedCidrs:['127.0.0.1/32']};
  assert.deepEqual((await resolveApproved(validateSources([source])[0])).address,'127.0.0.1');
  for(const change of [{url:'http://user:password@127.0.0.1:8545'},{url:'http://127.0.0.1:8545?target=metadata'},{allowedCidrs:['any']},{command:'shell'}])assert.throws(()=>validateSources([{...source,...change}]));
  await assert.rejects(resolveApproved({...source,allowedCidrs:['172.29.77.0/24']}),ExplorerError);
  await assert.rejects(resolveApproved({...source,url:'http://169.254.169.254',allowedCidrs:['169.254.0.0/16']}),ExplorerError);
});
test('QBFT comparison permits distinct commit seals and rounds while retaining other header data',()=>{
  const extra=(round:`0x${string}`,seal:`0x${string}`)=>toRlp([`0x${'0'.repeat(64)}`,[address as `0x${string}`],[],round,[seal]]);
  const first={...block,extraData:extra('0x01','0x11')};const second={...block,extraData:extra('0x02','0x22')};
  assert.ok(sameData(comparableBlock(first),comparableBlock(second)));
  assert.ok(!sameData(comparableBlock(first),comparableBlock({...second,stateRoot:parent})));
});
