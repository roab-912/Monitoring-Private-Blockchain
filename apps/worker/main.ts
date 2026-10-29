import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { database } from '../../packages/persistence/db.js';
import { runCheck } from '../../packages/persistence/operations.js';
const db = database();
const owner = randomUUID();
let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { stopping = true; });
console.log('Worker started: foundation.check only; no infrastructure operations enabled');
while (!stopping) {
  try { await runCheck(db, owner); } catch { console.error('Worker check failed; reconciliation required if lease expires'); }
  if (!stopping) await setTimeout(1000);
}
await db.end();
