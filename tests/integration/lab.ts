import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { compose } from '../../scripts/lab-lib.js';
import { recordEnvironment } from '../../scripts/record-environment.js';
await mkdir('.runtime/lab/evidence', { recursive: true });
// Invalidate old results before starting; stale evidence cannot count as a new pass.
await writeFile('.runtime/lab/evidence/run.json', JSON.stringify({ startedAt: new Date().toISOString(), state: 'RUNNING' }));
const probe = (phase: string) => compose(['run', '--rm', '--no-deps', 'verifier', 'node', '--import', 'tsx', 'tests/integration/besu-probe.ts', phase]);
try {
  await probe('before');
  // Recreate all ordinary services, preserving volumes and bind-mounted local identities.
  await compose(['down']);
  await compose(['up', '-d']);
  await probe('after');
  await compose(['stop', 'api', 'worker']);
  try { await probe('independence'); } finally { await compose(['start', 'api', 'worker']); }
  await compose(['run', '--rm', '--no-deps', 'verifier', 'npm', 'run', 'test:db']);
  await recordEnvironment();
  await writeFile('.runtime/lab/evidence/run.json', JSON.stringify({ completedAt: new Date().toISOString(), state: 'SUCCEEDED', scenario: 'v0.0+T01' }, null, 2) + '\n');
  await mkdir('docs/evidence/v0.0', { recursive: true });
  for (const name of ['before', 'after', 'independence', 'environment', 'run']) await copyFile(`.runtime/lab/evidence/${name}.json`, `docs/evidence/v0.0/${name}.json`);
} catch (error) {
  await writeFile('.runtime/lab/evidence/run.json', JSON.stringify({ completedAt: new Date().toISOString(), state: 'FAILED' }));
  throw error;
}
