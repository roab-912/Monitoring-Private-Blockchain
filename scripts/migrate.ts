import { database } from '../packages/persistence/db.js';
import { migrate } from '../packages/persistence/migrate.js';
const db = database();
try { await migrate(db); console.log('Migrations applied'); } finally { await db.end(); }
