import { buildServer } from './server.js';
import { database } from '../../packages/persistence/db.js';
import { authSettingsFromEnv } from '../../packages/auth/auth.js';
const db = database();
const auth = await authSettingsFromEnv();
const app = await buildServer({ db, auth, staticRoot: 'dist/web' });
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, async () => { await app.close(); await db.end(); });
await app.listen({ host: auth.host, port: Number(process.env.PORT ?? '3000') });
console.log('API listening; credentials and request contents are never logged');
