import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Database } from './db.js';

export async function migrate(db: Database, directory = fileURLToPath(new URL('./migrations/', import.meta.url))) {
  const client = await db.connect();
  try {
    await client.query('SELECT pg_advisory_lock(709001)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    for (const name of (await readdir(directory)).filter(n => /^\d+_.*\.sql$/.test(n)).sort()) {
      const sql = await readFile(`${directory}/${name}`, 'utf8');
      const hash = createHash('sha256').update(sql).digest('hex');
      const existing = await client.query('SELECT sha256 FROM schema_migrations WHERE name=$1', [name]);
      if (existing.rowCount) {
        if (existing.rows[0].sha256 !== hash) throw new Error(`Migration checksum changed: ${name}`);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(name, sha256) VALUES ($1,$2)', [name, hash]);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(709001)');
    client.release();
  }
}
