import pg from 'pg';
import { readFileSync } from 'node:fs';
export function database(url = process.env.DATABASE_URL ?? (process.env.DATABASE_URL_FILE ? readFileSync(process.env.DATABASE_URL_FILE, 'utf8').trim() : undefined)) {
  if (!url) throw new Error('DATABASE_URL required');
  const pool = new pg.Pool({ connectionString: url, max: 8, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
  pool.on('error', () => console.error('Database connection lost; new requests will retry or fail closed'));
  return pool;
}
export type Database = ReturnType<typeof database>;
