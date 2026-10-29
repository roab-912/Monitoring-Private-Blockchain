import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { database } from '../../packages/persistence/db.js';
import { runCheck } from '../../packages/persistence/operations.js';
import { sourcesFromEnv } from '../../packages/besu-adapter/rpc.js';
import { runConnection } from '../../packages/explorer/connections.js';
import { indexTick } from '../../packages/explorer/indexer.js';
const db = database();
const owner = randomUUID();
const sources=await sourcesFromEnv();
let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { stopping = true; });
console.log('Worker started: foundation checks, network verification and read-only explorer indexing');
while (!stopping) {
  let progress=0;
  try { await runCheck(db, owner);await runConnection(db,owner,sources);if(!stopping)progress=await indexTick(db,sources); } catch { console.error('Worker tick failed; persistent state retained for reconciliation'); }
  if (!stopping) await setTimeout(progress>0?10:1000);
}
await db.end();
