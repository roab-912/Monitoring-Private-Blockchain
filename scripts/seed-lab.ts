import { readFile } from 'node:fs/promises';
import { database } from '../packages/persistence/db.js';
const manifest = JSON.parse(await readFile(process.env.LAB_PUBLIC_MANIFEST ?? '/lab/public.json', 'utf8'));
const db = database(); const client = await db.connect();
try {
  await client.query('BEGIN');
  const existing = await client.query('SELECT genesis_file_sha256 FROM networks WHERE id=$1', [manifest.networkId]);
  if (existing.rowCount && existing.rows[0].genesis_file_sha256 !== manifest.genesisFileSha256) throw new Error('Seed genesis mismatch');
  await client.query(`INSERT INTO networks(id,name,chain_id,network_id,genesis,genesis_file_sha256,consensus,besu_version)
    VALUES ($1,'Local QBFT laboratory',1337,1337,$2,$3,'QBFT_HEADER','26.9.0') ON CONFLICT DO NOTHING`, [manifest.networkId, manifest.genesis, manifest.genesisFileSha256]);
  await client.query(`INSERT INTO machines(id,network_id,name,connection_mode,address,os,architecture,failure_domain)
    VALUES ($1,$2,'Hôte Compose','local','compose-host','linux',$3,'physical-host-1') ON CONFLICT DO NOTHING`, [manifest.machineId, manifest.networkId, process.arch]);
  for (const node of manifest.instances) {
    await client.query(`INSERT INTO node_instances(id,network_id,machine_id,service_name,purpose,p2p_identity,node_address,besu_version,storage_profile,cpu_millis,memory_bytes,disk_budget_bytes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'26.9.0','BONSAI_FULL',1000,805306368,10737418240) ON CONFLICT DO NOTHING`,
    [node.id, manifest.networkId, manifest.machineId, `bpc-${node.name}`, node.purpose, node.p2pIdentity, node.nodeAddress]);
    for (const kind of ['data', 'config', 'logs', 'runtime', 'key']) {
      const path = kind === 'key' ? `/srv/bpc/keys/${node.id}/node_key` : `/srv/bpc/networks/${manifest.networkId}/nodes/${node.id}/${kind}`;
      const reserved = await client.query('SELECT path FROM instance_paths WHERE node_id=$1 AND kind=$2', [node.id, kind]);
      if (!reserved.rowCount) await client.query('INSERT INTO instance_paths(node_id,machine_id,kind,path) VALUES ($1,$2,$3,$4)', [node.id, manifest.machineId, kind, path]);
    }
    for (const [protocol, port, purpose] of [['tcp', node.p2pPort, 'p2p'], ['udp', node.p2pPort, 'discovery'], ['tcp', node.httpPort, 'http'], ['tcp', node.metricsPort, 'metrics']]) {
      await client.query('INSERT INTO instance_ports(node_id,machine_id,protocol,port,purpose) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING', [node.id, manifest.machineId, protocol, port, purpose]);
    }
  }
  await client.query('GRANT bpc_api TO console_api');
  await client.query('GRANT bpc_worker TO console_worker');
  await client.query('COMMIT');
  console.log('Lab inventory seeded; managed paths describe target host namespace; Compose mounts documented separately');
} catch (error) { await client.query('ROLLBACK'); throw error; }
finally { client.release(); await db.end(); }
