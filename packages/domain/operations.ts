export const states = ['DRAFT', 'PLANNED', 'AWAITING_APPROVAL', 'QUEUED', 'RUNNING', 'VERIFYING', 'SUCCEEDED', 'FAILED', 'CANCELED', 'NEEDS_ATTENTION'] as const;
export type OperationState = typeof states[number];
const transitions: Record<OperationState, readonly OperationState[]> = {
  DRAFT: ['PLANNED', 'CANCELED'], PLANNED: ['AWAITING_APPROVAL', 'QUEUED', 'CANCELED'],
  AWAITING_APPROVAL: ['QUEUED', 'CANCELED'], QUEUED: ['RUNNING', 'CANCELED'],
  RUNNING: ['VERIFYING', 'FAILED', 'NEEDS_ATTENTION'], VERIFYING: ['SUCCEEDED', 'FAILED', 'NEEDS_ATTENTION'],
  SUCCEEDED: [], FAILED: [], CANCELED: [], NEEDS_ATTENTION: [],
};
export function assertTransition(from: OperationState, to: OperationState) {
  if (!transitions[from].includes(to)) throw new Error(`Invalid operation transition: ${from} -> ${to}`);
}
