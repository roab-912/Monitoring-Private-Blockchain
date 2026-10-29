import { mkdir, readFile, writeFile, lstat, chmod } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { resolve, sep } from 'node:path';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { toRlp, type Hex } from 'viem';
import { compose, labMachineId, labNetworkId } from './lab-lib.js';

const names = ['v1', 'v2', 'v3', 'v4', 'rpc'];
async function exists(path: string) { try { await lstat(path); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; } }
async function guardRoot() {
  for (const path of ['.runtime', '.runtime/lab']) if (await exists(path) && (await lstat(path)).isSymbolicLink()) throw new Error('Symlinked lab root rejected');
  if (!resolve('.runtime/lab').startsWith(resolve('.') + sep)) throw new Error('Lab path outside repository');
}
async function secret(path: string, content: string) { await writeFile(path, content, { flag: 'wx', mode: 0o600 }); await chmod(path, 0o600); }

async function init() {
  await guardRoot();
  if (await exists('.runtime/lab')) {
    const manifest = JSON.parse(await readFile('.runtime/lab/public.json', 'utf8'));
    const genesis = await readFile('.runtime/lab/genesis.json', 'utf8');
    if (createHash('sha256').update(genesis).digest('hex') !== manifest.genesisFileSha256) throw new Error('Genesis file changed; refusing startup');
    for (const node of manifest.instances) {
      const key = (await readFile(`.runtime/lab/keys/${node.name}.key`, 'utf8')).trim();
      if (privateKeyToAccount(`0x${key}`).address.toLowerCase() !== node.nodeAddress) throw new Error('Node identity mismatch');
    }
    await writeComposeIdentity();
    console.log('Existing lab verified; identities and genesis preserved');
    return;
  }
  for (const directory of ['keys', 'auth', 'db', 'evidence']) await mkdir(`.runtime/lab/${directory}`, { recursive: true, mode: 0o700 });
  await writeComposeIdentity();
  await mkdir('infra/lab', { recursive: true });
  const instances = [];
  for (const [index, name] of names.entries()) {
    const key = generatePrivateKey(); const account = privateKeyToAccount(key);
    await secret(`.runtime/lab/keys/${name}.key`, key.slice(2));
    instances.push({ name, id: `00000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`,
      machineId: labMachineId, purpose: index < 4 ? 'consensus' : 'rpc', nodeAddress: account.address.toLowerCase(),
      p2pIdentity: account.publicKey.slice(4), p2pHost: `172.29.77.${index + 10}`, p2pPort: 30303 + index, httpPort: 8545 + index, metricsPort: 9545 + index });
  }
  const walletKey = generatePrivateKey(); const wallet = privateKeyToAccount(walletKey);
  await secret('.runtime/lab/witness.key', walletKey);
  const genesis = { config: { chainId: 1337, berlinBlock: 0, qbft: { blockperiodseconds: 2, epochlength: 30000, requesttimeoutseconds: 4 } },
    nonce: '0x0', timestamp: '0x0', gasLimit: '0x1c9c380', difficulty: '0x1',
    mixHash: '0x63746963616c2062797a616e74696e65206661756c7420746f6c6572616e6365', coinbase: `0x${'0'.repeat(40)}`,
    extraData: toRlp([`0x${'0'.repeat(64)}`, instances.slice(0, 4).map(n => n.nodeAddress as Hex).sort(), [], '0x', []]),
    alloc: { [wallet.address.slice(2).toLowerCase()]: { balance: '1000000000000000000000' } },
  };
  const genesisText = JSON.stringify(genesis, null, 2) + '\n';
  await writeFile('.runtime/lab/genesis.json', genesisText, { flag: 'wx' });
  // The tracked genesis is the public reference from the qualified lab, never the active
  // genesis of a fresh checkout (whose validator keys must be generated locally).
  if (!await exists('infra/lab/genesis.json')) await writeFile('infra/lab/genesis.json', genesisText, { flag: 'wx' });
  const genesisFileSha256 = createHash('sha256').update(genesisText).digest('hex');
  const publicManifest = { schemaVersion: 1, networkId: labNetworkId, machineId: labMachineId,
    physicalFailureDomains: 1, genesis, genesisFileSha256, witnessAddress: wallet.address, instances };
  await writeFile('.runtime/lab/public.json', JSON.stringify(publicManifest, null, 2) + '\n');
  if (!await exists('infra/lab/manifest.json')) await writeFile('infra/lab/manifest.json', JSON.stringify(publicManifest, null, 2) + '\n');
  const dbPassword = randomBytes(32).toString('hex');
  const apiPassword = randomBytes(32).toString('hex'); const workerPassword = randomBytes(32).toString('hex');
  await secret('.runtime/lab/db/password', dbPassword);
  await secret('.runtime/lab/db/owner-url', `postgresql://console_owner:${dbPassword}@postgres:5432/console`);
  await secret('.runtime/lab/db/api-url', `postgresql://console_api:${apiPassword}@postgres:5432/console`);
  await secret('.runtime/lab/db/worker-url', `postgresql://console_worker:${workerPassword}@postgres:5432/console`);
  await secret('.runtime/lab/db/init.sql', `CREATE USER console_api PASSWORD '${apiPassword}';\nCREATE USER console_worker PASSWORD '${workerPassword}';\n`);
  await secret('.runtime/lab/auth/tokens.json', JSON.stringify({ Administrator: randomBytes(32).toString('hex'), Viewer: randomBytes(32).toString('hex') }));
  for (const node of instances) {
    const directory = `.runtime/lab/instances/${node.name}/config`;
    await mkdir(directory, { recursive: true });
    const peers = instances.filter(n => n.name !== node.name).map(n => `enode://${n.p2pIdentity}@${n.p2pHost}:${n.p2pPort}`);
    await writeFile(`${directory}/static-nodes.json`, JSON.stringify(peers, null, 2));
    await writeFile(`${directory}/besu.toml`, [
      'data-path="/data"', 'genesis-file="/genesis.json"', 'node-private-key-file="/keys/node_key"',
      'network-id=1337', 'sync-mode="FULL"', 'data-storage-format="BONSAI"',
      `p2p-port=${node.p2pPort}`, `p2p-host="${node.p2pHost}"`, 'discovery-enabled=false',
      'static-nodes-file="/config/static-nodes.json"', 'rpc-http-enabled=true', 'rpc-http-host="0.0.0.0"',
      `rpc-http-port=${node.httpPort}`, `rpc-http-api=["ETH","NET","WEB3"${node.name !== 'rpc' ? ',"QBFT"' : ''}]`,
      `host-allowlist=["${node.name}","localhost","127.0.0.1"]`,
      'metrics-enabled=true', 'metrics-host="0.0.0.0"', `metrics-port=${node.metricsPort}`, 'min-gas-price=0', '',
    ].join('\n'));
  }
  console.log('Local keys generated; public genesis and manifest written. One physical failure domain.');
}

async function writeComposeIdentity() {
  // Compose file-backed secrets retain their host ownership. Match the invoking
  // POSIX user for application containers; Besu and PostgreSQL have separate volumes.
  await writeFile('.runtime/lab/compose.env', `LAB_UID=${process.getuid?.() ?? 1000}\nLAB_GID=${process.getgid?.() ?? 1000}\n`);
}

const action = process.argv[2];
if (action === 'init') await init();
else if (action === 'up') {
  await init();
  await compose(['up', '--build', '-d', '--wait', '--wait-timeout', '180']);
  console.log('Console: http://127.0.0.1:3000 · credentials: npm run lab:credentials · proof: npm run lab:verify');
} else if (action === 'down') await compose(['down']);
else if (action === 'credentials') {
  await guardRoot();
  console.log('Local laboratory tokens. Do not capture or share this output.');
  console.log(await readFile('.runtime/lab/auth/tokens.json', 'utf8'));
} else throw new Error('Use init, up, down or credentials');
