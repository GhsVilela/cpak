/**
 * Track cancelled sync operations
 * Separated to avoid circular dependencies between routes and services
 */
const cancelledSyncs = new Set<string>();

export function isSyncCancelled(operationId: string): boolean {
  return cancelledSyncs.has(operationId);
}

export function markSyncAsCancelled(operationId: string): void {
  cancelledSyncs.add(operationId);
}

export function markSyncAsCompleted(operationId: string): void {
  cancelledSyncs.delete(operationId);
}
