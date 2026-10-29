import { createHash, randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { Database } from './db.js';
import type { OperationDto } from '../contracts/api.js';
import { assertTransition } from '../domain/operations.js';

export async function audit(db: Database | pg.PoolClient, subject: string, action: string, resource: string, outcome: string, correlationId: string) {
  await db.query('INSERT INTO audit_events(subject, action, resource, outcome, correlation_id) VALUES ($1,$2,$3,$4,$5)',
    [subject, action, resource, outcome, correlationId]);
}

export function operationDto(row: pg.QueryResultRow): OperationDto {
  return { id: row.id, kind: row.kind, state: row.state, createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(), evidence: row.evidence, errorCode:row.error_code };
}

export async function enqueueCheck(db: Database, networkId: string, author: string, key: string, correlationId: string) {
  const client = await db.connect();
  const plan = { kind: 'foundation.check', networkId, schemaVersion: 1 };
  const hash = createHash('sha256').update(JSON.stringify(plan)).digest('hex');
  try {
    await client.query('BEGIN');
    const network = await client.query('SELECT id FROM networks WHERE id=$1', [networkId]);
    if (!network.rowCount) throw new Error('UNKNOWN_NETWORK');
    const inserted = await client.query(`INSERT INTO operations
      (id,network_id,author,kind,idempotency_key,plan,plan_sha256,state,deadline)
      VALUES ($1,$2,$3,'foundation.check',$4,$5,$6,'QUEUED',clock_timestamp()+interval '5 minutes')
      ON CONFLICT (network_id,author,idempotency_key) DO NOTHING RETURNING *`,
    [randomUUID(), networkId, author, key, plan, hash]);
    let row = inserted.rows[0];
    if (!row) {
      row = (await client.query('SELECT * FROM operations WHERE network_id=$1 AND author=$2 AND idempotency_key=$3', [networkId, author, key])).rows[0];
      if (row.plan_sha256 !== hash) throw new Error('IDEMPOTENCY_CONFLICT');
    } else {
      await client.query("INSERT INTO operation_steps(operation_id,ordinal,name,state) VALUES ($1,1,'database-check','PENDING')", [row.id]);
      await audit(client, author, 'foundation.check.enqueue', row.id, 'QUEUED', correlationId);
    }
    await client.query('COMMIT');
    return operationDto(row);
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function reconcileExpired(db: Database) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const expired = await client.query(`UPDATE operations SET state='NEEDS_ATTENTION', error_code='LEASE_OR_DEADLINE_EXPIRED',
      lease_owner=NULL,lease_until=NULL,updated_at=clock_timestamp()
      WHERE (state IN ('RUNNING','VERIFYING') AND lease_until<clock_timestamp())
        OR (state='QUEUED' AND deadline<clock_timestamp()) RETURNING id`);
    for (const { id } of expired.rows) {
      await client.query("UPDATE operation_steps SET state='NEEDS_ATTENTION',updated_at=clock_timestamp() WHERE operation_id=$1 AND state<>'SUCCEEDED'", [id]);
      await client.query('DELETE FROM resource_locks WHERE operation_id=$1', [id]);
      await audit(client, 'worker', 'operation.reconcile', id, 'NEEDS_ATTENTION', id);
    }
    await client.query('COMMIT');
    return expired.rowCount;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function claimCheck(db: Database, owner: string, kind='foundation.check') {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`SELECT * FROM operations o WHERE state='QUEUED' AND kind=$1 AND deadline>clock_timestamp()
      AND NOT EXISTS (SELECT 1 FROM resource_locks l WHERE l.resource_key='network:'||o.network_id::text)
      ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`,[kind]);
    if (!result.rowCount) { await client.query('COMMIT'); return null; }
    const row = result.rows[0];
    assertTransition('QUEUED', 'RUNNING');
    const lock = await client.query(`INSERT INTO resource_locks(resource_key,operation_id,lease_generation,expires_at)
      VALUES ($1,$2,$3,clock_timestamp()+interval '30 seconds') ON CONFLICT DO NOTHING RETURNING resource_key`,
    [`network:${row.network_id}`, row.id, BigInt(row.lease_generation) + 1n]);
    if (!lock.rowCount) { await client.query('ROLLBACK'); return null; }
    const claimed = await client.query(`UPDATE operations SET state='RUNNING', lease_owner=$2,
      lease_until=clock_timestamp()+interval '30 seconds',lease_generation=lease_generation+1,updated_at=clock_timestamp()
      WHERE id=$1 RETURNING *`, [row.id, owner]);
    await client.query("UPDATE operation_steps SET state='RUNNING',updated_at=clock_timestamp() WHERE operation_id=$1", [row.id]);
    await client.query('COMMIT');
    return claimed.rows[0];
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function runCheck(db: Database, owner: string) {
  await reconcileExpired(db);
  const row = await claimCheck(db, owner);
  if (!row) return false;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    // Recheck the immutable plan's target inside execution, never trust the submission alone.
    const network = await client.query('SELECT id FROM networks WHERE id=$1', [row.plan.networkId]);
    if (!network.rowCount || row.plan.networkId !== row.network_id) throw new Error('PRECONDITION_FAILED');
    const count = await client.query('SELECT count(*)::text AS count FROM node_instances WHERE network_id=$1', [row.network_id]);
    const evidence = { database: 'reachable', instanceCount: count.rows[0].count, checkedAt: new Date().toISOString() };
    assertTransition('RUNNING', 'VERIFYING');
    const verifying = await client.query(`UPDATE operations SET state='VERIFYING',updated_at=clock_timestamp()
      WHERE id=$1 AND state='RUNNING' AND lease_owner=$2 AND lease_generation=$3
        AND lease_until>clock_timestamp() AND deadline>clock_timestamp() RETURNING id`, [row.id, owner, row.lease_generation]);
    if (!verifying.rowCount) throw new Error('LEASE_LOST');
    assertTransition('VERIFYING', 'SUCCEEDED');
    await client.query(`UPDATE operations SET state='SUCCEEDED',evidence=$2,lease_owner=NULL,lease_until=NULL,
      updated_at=clock_timestamp() WHERE id=$1`, [row.id, evidence]);
    await client.query("UPDATE operation_steps SET state='SUCCEEDED',evidence=$2,updated_at=clock_timestamp() WHERE operation_id=$1", [row.id, evidence]);
    await client.query('DELETE FROM resource_locks WHERE operation_id=$1 AND lease_generation=$2', [row.id, row.lease_generation]);
    await audit(client, 'worker', 'foundation.check.verify', row.id, 'SUCCEEDED', row.id);
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    // Leave uncertain work to reconciliation; never invent success or repeat a remote action.
    throw error;
  } finally { client.release(); }
}
