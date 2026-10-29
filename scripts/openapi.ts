import { mkdir, writeFile } from 'node:fs/promises';
import { buildServer } from '../apps/api/server.js';
import { database } from '../packages/persistence/db.js';
// Generation never connects to PostgreSQL or an identity provider.
const db = database('postgresql://unused:unused@127.0.0.1/unused');
const app = await buildServer({ db, auth: { mode: 'development', profile: 'local', isolated: true,
  host: '127.0.0.1', devTokens: { Viewer: 'a'.repeat(64) } } });
await mkdir('docs/generated', { recursive: true });
await writeFile('docs/generated/openapi.json', JSON.stringify(app.swagger(), null, 2) + '\n');
await app.close(); await db.end();
