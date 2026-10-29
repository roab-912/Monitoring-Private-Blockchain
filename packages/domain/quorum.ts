export type ValidatorPlacement = { address: string; machineId: string; failureDomain: string };

export function consensusQuorum(validators: number): number {
  if (!Number.isSafeInteger(validators) || validators < 1) throw new Error('Invalid validator count');
  return Math.ceil((2 * validators) / 3);
}

export function voteThreshold(validators: number): number {
  consensusQuorum(validators);
  return Math.floor(validators / 2) + 1;
}

export function placementRisk(validators: ValidatorPlacement[]) {
  if (new Set(validators.map(v => v.address.toLowerCase())).size !== validators.length) {
    throw new Error('Duplicate validator identity');
  }
  const quorum = consensusQuorum(validators.length);
  return [...new Set(validators.map(v => v.failureDomain))].map(failureDomain => {
    const affected = validators.filter(v => v.failureDomain === failureDomain).length;
    return { failureDomain, affected, remaining: validators.length - affected, quorum,
      survives: validators.length - affected >= quorum };
  });
}

export function assertSafeStop(input: {
  total: number; available: number; affectedAvailable: number; observedAt: number; now: number;
  maxAgeMs: number; margin: number; sourcesAgree: boolean;
}) {
  const { total, available, affectedAvailable, observedAt, now, maxAgeMs, margin, sourcesAgree } = input;
  const quorum = consensusQuorum(total);
  if (![available, affectedAvailable, margin].every(n => Number.isSafeInteger(n) && n >= 0) ||
    available > total || affectedAvailable > available || maxAgeMs <= 0) throw new Error('Invalid observation');
  if (!sourcesAgree || now < observedAt || now - observedAt > maxAgeMs) throw new Error('Untrusted or stale observation');
  if (available - affectedAvailable < quorum + margin) throw new Error('Quorum budget exceeded');
}
