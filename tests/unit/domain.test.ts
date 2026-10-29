import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertSafeStop, consensusQuorum, placementRisk, voteThreshold } from '../../packages/domain/quorum.js';
import { assertTransition } from '../../packages/domain/operations.js';

test('QBFT production quorum and header vote threshold are distinct', () => {
  assert.equal(consensusQuorum(4), 3); assert.equal(consensusQuorum(5), 4); assert.equal(consensusQuorum(7), 5);
  assert.equal(voteThreshold(5), 3);
  for (const count of [0, -1, 1.5, NaN]) assert.throws(() => consensusQuorum(count));
});
test('colocated validators lose quorum when their physical domain fails', () => {
  const validators = Array.from({ length: 4 }, (_, i) => ({ address: `0x${i}`, machineId: `vm-${i}`, failureDomain: `host-${i % 2}` }));
  assert.deepEqual(placementRisk(validators).map(risk => [risk.affected, risk.remaining, risk.survives]), [[2, 2, false], [2, 2, false]]);
  assert.throws(() => placementRisk([validators[0], validators[0]]));
});
test('stop guard refuses stale, divergent, future and insufficient observations', () => {
  const input = { total: 4, available: 4, affectedAvailable: 1, observedAt: 100, now: 150, maxAgeMs: 100, margin: 0, sourcesAgree: true };
  assert.doesNotThrow(() => assertSafeStop(input));
  for (const change of [{ affectedAvailable: 2 }, { margin: 1 }, { now: 201 }, { now: 99 }, { sourcesAgree: false }, { affectedAvailable: -1 }]) {
    assert.throws(() => assertSafeStop({ ...input, ...change }));
  }
});
test('success requires verification, terminal jobs cannot be replayed', () => {
  assertTransition('RUNNING', 'VERIFYING'); assertTransition('VERIFYING', 'SUCCEEDED');
  assert.throws(() => assertTransition('RUNNING', 'SUCCEEDED'));
  assert.throws(() => assertTransition('NEEDS_ATTENTION', 'QUEUED'));
  assert.throws(() => assertTransition('SUCCEEDED', 'RUNNING'));
});
