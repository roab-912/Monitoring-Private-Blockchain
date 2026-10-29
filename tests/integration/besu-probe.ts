import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { createPublicClient, createWalletClient, defineChain, http, decodeEventLog, type Abi, type Hex, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { database } from '../../packages/persistence/db.js';

type Instance = { name: string; nodeAddress: string; httpPort: number; p2pIdentity: string };
type Block = { hash: Hex; number: Hex; stateRoot: Hex };
const manifest = JSON.parse(await readFile('/lab/public.json', 'utf8')) as { networkId: string; genesisFileSha256: string; instances: Instance[] };
const artifact = JSON.parse(await readFile('dist/contracts/Witness.json', 'utf8')) as { abi: Abi; bytecode: Hex; compiler: string; evmVersion: string };
const phase = process.argv[2];
let stage = 'initialization';
async function rpc<T>(node: Instance, method: string, params: unknown[] = []): Promise<T> {
  const response = await fetch(`http://${node.name}:${node.httpPort}`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('RPC_HTTP');
  const result = await response.json() as { result: T; error?: { code: number } };
  if (result.error) throw new Error(`RPC_${result.error.code}`);
  return result.result;
}
async function eventually<T>(action: () => Promise<T>, label: string): Promise<T> {
  for (let attempt = 0; attempt < 90; attempt++) {
    try { return await action(); } catch { await setTimeout(2000); }
  }
  throw new Error(`TIMEOUT_${label}`);
}
const rpcNode = manifest.instances[4];
const chain = defineChain({ id: 1337, name: 'QBFT lab', nativeCurrency: { name: 'Lab Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [`http://${rpcNode.name}:${rpcNode.httpPort}`] } } });
const client = createPublicClient({ chain, transport: http(chain.rpcUrls.default.http[0], { timeout: 5000 }) });
const key = (await readFile('/run/secrets/witness_key', 'utf8')).trim() as Hex;
const account = privateKeyToAccount(key);
const wallet = createWalletClient({ chain, account, transport: http(chain.rpcUrls.default.http[0], { timeout: 5000 }) });
const VALUE = 900719925474099312345678901234567890n;

async function networkEvidence() {
  const nodes = [];
  const validators = manifest.instances.slice(0, 4).map(n => n.nodeAddress).sort();
  for (const node of manifest.instances) {
    assert.equal(BigInt(await rpc<Hex>(node, 'eth_chainId')), 1337n);
    const version = await rpc<string>(node, 'web3_clientVersion'); assert.ok(version.includes('26.9.0'));
    const enode = await rpc<string>(node, 'net_enode');
    assert.equal(enode.split('enode://')[1]?.split('@')[0], node.p2pIdentity);
    const genesis = await rpc<Block>(node, 'eth_getBlockByNumber', ['0x0', false]);
    const head = BigInt(await rpc<Hex>(node, 'eth_blockNumber')); assert.ok(head > 0n);
    if (node.name !== 'rpc') {
      for (const tag of ['latest', 'pending']) {
        const actual = await rpc<string[]>(node, 'qbft_getValidatorsByBlockNumber', [tag]);
        assert.deepEqual(actual.map(a => a.toLowerCase()).sort(), validators);
      }
    }
    nodes.push({ name: node.name, version, enode, genesisBlockHash: genesis.hash, height: head.toString(), nodeAddress: node.nodeAddress, p2pIdentity: node.p2pIdentity });
  }
  assert.equal(new Set(nodes.map(n => n.genesisBlockHash)).size, 1);
  const commonHeight = nodes.reduce((min, node) => BigInt(node.height) < min ? BigInt(node.height) : min, BigInt(nodes[0].height));
  const blocks = await Promise.all(manifest.instances.map(node => rpc<Block>(node, 'eth_getBlockByNumber', [`0x${commonHeight.toString(16)}`, false])));
  assert.equal(new Set(blocks.map(b => b.hash)).size, 1); assert.equal(new Set(blocks.map(b => b.stateRoot)).size, 1);
  return { nodes, checkpoint: { height: commonHeight.toString(), hash: blocks[0].hash, stateRoot: blocks[0].stateRoot } };
}

async function apiEvidence() {
  const tokens = JSON.parse(await readFile('/run/secrets/dev_tokens', 'utf8'));
  const base = process.env.API_URL!;
  assert.equal((await fetch(`${base}/api/foundation`)).status, 401);
  const body = JSON.stringify({ networkId: manifest.networkId });
  assert.equal((await fetch(`${base}/api/operations/check`, { method: 'POST', headers: {
    'Content-Type': 'application/json', Authorization: `Bearer ${tokens.Viewer}`, 'Idempotency-Key': crypto.randomUUID(),
  }, body })).status, 403);
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.Administrator}`, 'Idempotency-Key': crypto.randomUUID() };
  const queued = await fetch(`${base}/api/operations/check`, { method: 'POST', headers, body }); assert.equal(queued.status, 202);
  const job = await queued.json() as { id: string };
  const finished = await eventually(async () => {
    const response = await fetch(`${base}/api/operations/${job.id}`, { headers });
    const result = await response.json() as { state: string; evidence?: { instanceCount: string } };
    assert.equal(result.state, 'SUCCEEDED'); assert.equal(result.evidence?.instanceCount, '5'); return result;
  }, 'worker');
  return { anonymous: 401, viewerMutation: 403, jobId: job.id, job: finished };
}

try {
  stage = 'network identity and progress';
  const network = await eventually(networkEvidence, 'network');
  if (phase === 'before') {
    stage = 'validator proposer metrics';
    const metrics = await eventually(async () => {
      const result = await rpc<{ address: string; proposedBlockCount: string }[]>(manifest.instances[0], 'qbft_getSignerMetrics', ['0x0', 'latest']);
      for (const node of manifest.instances.slice(0, 4)) assert.ok(result.some(m => m.address.toLowerCase() === node.nodeAddress && BigInt(m.proposedBlockCount) > 0n));
      return result;
    }, 'all-four-proposers');
    stage = 'restricted RPC';
    await assert.rejects(rpc(rpcNode, 'qbft_getValidatorsByBlockNumber', ['latest']), /RPC_-32601|RPC_-32604/);
    stage = 'contract deployment';
    const deploymentHash = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode, gas: 2000000n, gasPrice: 0n, type: 'legacy' });
    const deployment = await client.waitForTransactionReceipt({ hash: deploymentHash, timeout: 60000 });
    assert.equal(deployment.status, 'success'); assert.ok(deployment.contractAddress);
    const address = deployment.contractAddress;
    stage = 'persistent state and event';
    const writeHash = await wallet.writeContract({ address, abi: artifact.abi, functionName: 'setValue', args: [VALUE], gas: 200000n, gasPrice: 0n, type: 'legacy' });
    const receipt = await client.waitForTransactionReceipt({ hash: writeHash, timeout: 60000 }); assert.equal(receipt.status, 'success');
    assert.equal(await client.readContract({ address, abi: artifact.abi, functionName: 'value' }), VALUE);
    const event = decodeEventLog({ abi: artifact.abi, data: receipt.logs[0].data, topics: receipt.logs[0].topics }); assert.equal(event.eventName, 'ValueChanged');
    const eventArgs: unknown = event.args;
    assert.ok(typeof eventArgs === 'object' && eventArgs !== null && 'newValue' in eventArgs);
    assert.equal(eventArgs.newValue, VALUE);
    assert.equal((await client.readContract({ address, abi: artifact.abi, functionName: 'owner' }) as string).toLowerCase(), account.address.toLowerCase());
    stage = 'access control';
    await assert.rejects(client.simulateContract({ address, abi: artifact.abi, functionName: 'setValue', args: [1n], account: manifest.instances[0].nodeAddress as Address }), /not owner/);
    stage = 'reverted transaction';
    await assert.rejects(client.simulateContract({ address, abi: artifact.abi, functionName: 'alwaysRevert', account: account.address }), /witness revert/);
    const revertHash = await wallet.writeContract({ address, abi: artifact.abi, functionName: 'alwaysRevert', gas: 100000n, gasPrice: 0n, type: 'legacy' });
    const reverted = await client.waitForTransactionReceipt({ hash: revertHash, timeout: 60000 }); assert.equal(reverted.status, 'reverted');
    assert.equal(await client.readContract({ address, abi: artifact.abi, functionName: 'value' }), VALUE);
    stage = 'protected API and durable job';
    const api = await apiEvidence();
    const db = database();
    try { await db.query('UPDATE networks SET genesis_block_hash=$1 WHERE id=$2 AND (genesis_block_hash IS NULL OR genesis_block_hash=$1)', [network.nodes[0].genesisBlockHash, manifest.networkId]); } finally { await db.end(); }
    await writeFile('/evidence/before.json', JSON.stringify({ phase, recordedAt: new Date().toISOString(), network, metrics,
      topology: { physicalFailureDomains: 1, instances: 5, validators: 4 }, genesisFileSha256: manifest.genesisFileSha256,
      contract: { address, deploymentHash, writeHash, revertHash, value: VALUE.toString(), writeBlock: receipt.blockNumber.toString(), writeBlockHash: receipt.blockHash,
        compiler: artifact.compiler, evmVersion: artifact.evmVersion }, api }, null, 2) + '\n');
  } else if (phase === 'after') {
    stage = 'restart preservation';
    const before = JSON.parse(await readFile('/evidence/before.json', 'utf8'));
    assert.deepEqual(network.nodes.map(n => [n.nodeAddress, n.p2pIdentity, n.genesisBlockHash]), before.network.nodes.map((n: { nodeAddress: string; p2pIdentity: string; genesisBlockHash: string }) => [n.nodeAddress, n.p2pIdentity, n.genesisBlockHash]));
    assert.ok(BigInt(network.checkpoint.height) >= BigInt(before.network.checkpoint.height));
    assert.equal((await client.getBlock({ blockNumber: BigInt(before.network.checkpoint.height) })).hash, before.network.checkpoint.hash);
    const address = before.contract.address as Address;
    assert.equal(await client.readContract({ address, abi: artifact.abi, functionName: 'value' }), VALUE);
    assert.equal((await client.getTransactionReceipt({ hash: before.contract.writeHash })).status, 'success');
    assert.equal((await client.getTransactionReceipt({ hash: before.contract.revertHash })).status, 'reverted');
    assert.equal((await client.getBlock({ blockNumber: BigInt(before.contract.writeBlock) })).hash, before.contract.writeBlockHash);
    const logs = await client.getLogs({ address, fromBlock: BigInt(before.contract.writeBlock), toBlock: BigInt(before.contract.writeBlock) }); assert.ok(logs.length > 0);
    const height = await client.getBlockNumber({ cacheTime: 0 });
    await eventually(async () => { assert.ok(await client.getBlockNumber({ cacheTime: 0 }) > height); }, 'post-restart-progress');
    stage = 'post-restart transaction';
    const hash = await wallet.writeContract({ address, abi: artifact.abi, functionName: 'setValue', args: [VALUE], gas: 200000n, gasPrice: 0n, type: 'legacy' });
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: 60000 }); assert.equal(receipt.status, 'success');
    const tokens = JSON.parse(await readFile('/run/secrets/dev_tokens', 'utf8'));
    const preservedJob = await fetch(`${process.env.API_URL}/api/operations/${before.api.jobId}`, { headers: { Authorization: `Bearer ${tokens.Administrator}` } });
    assert.equal(preservedJob.status, 200);
    assert.equal((await preservedJob.json() as { state: string }).state, 'SUCCEEDED');
    await writeFile('/evidence/after.json', JSON.stringify({ phase, recordedAt: new Date().toISOString(), network,
      t01: 'passed', contractAddress: address, value: VALUE.toString(), postRestartTransaction: hash,
      genesisFileSha256: manifest.genesisFileSha256 }, null, 2) + '\n');
  } else if (phase === 'independence') {
    const height = await client.getBlockNumber({ cacheTime: 0 });
    await eventually(async () => { assert.ok(await client.getBlockNumber({ cacheTime: 0 }) > height); }, 'independent-consensus');
    await writeFile('/evidence/independence.json', JSON.stringify({ recordedAt: new Date().toISOString(), consoleStopped: true, beforeHeight: height.toString(), afterHeight: (await client.getBlockNumber({ cacheTime: 0 })).toString() }, null, 2) + '\n');
  } else throw new Error('INVALID_PHASE');
  console.log(`Besu real qualification ${phase}: passed`);
} catch {
  console.error(`Besu real qualification ${phase}: FAILED at ${stage}. No success evidence generated for this phase.`);
  process.exitCode = 1;
}
