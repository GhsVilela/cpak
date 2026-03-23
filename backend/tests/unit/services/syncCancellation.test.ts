import { describe, it, expect } from 'vitest';
import {
  isSyncCancelled,
  markSyncAsCancelled,
  markSyncAsCompleted,
} from '../../../src/services/syncCancellation.js';

describe('syncCancellation', () => {
  it('returns false for an unknown operationId', () => {
    expect(isSyncCancelled('non-existent-op-id')).toBe(false);
  });

  it('returns true after markSyncAsCancelled is called', () => {
    const id = 'op-cancel-test-1';
    markSyncAsCancelled(id);
    expect(isSyncCancelled(id)).toBe(true);
  });

  it('returns false after markSyncAsCompleted clears the cancellation', () => {
    const id = 'op-cancel-test-2';
    markSyncAsCancelled(id);
    expect(isSyncCancelled(id)).toBe(true);
    markSyncAsCompleted(id);
    expect(isSyncCancelled(id)).toBe(false);
  });

  it('cancelling an unknown id is a no-op (does not throw)', () => {
    expect(() => markSyncAsCancelled('no-such-id')).not.toThrow();
  });

  it('completing an unknown id is a no-op (does not throw)', () => {
    expect(() => markSyncAsCompleted('no-such-id')).not.toThrow();
  });
});
