import { describe, it, expect } from 'vitest';
import { SYNC_DEFAULTS } from '../../../src/services/syncDefaults.js';

describe('syncDefaults', () => {
  it('exports SYNC_DEFAULTS with expected keys', () => {
    expect(SYNC_DEFAULTS).toBeDefined();
    expect(SYNC_DEFAULTS).toHaveProperty('BATCH_SIZE');
    expect(SYNC_DEFAULTS).toHaveProperty('MAX_BATCH_SIZE');
    expect(SYNC_DEFAULTS).toHaveProperty('MIN_BATCH_SIZE');
    expect(SYNC_DEFAULTS).toHaveProperty('CONCURRENCY');
    expect(SYNC_DEFAULTS).toHaveProperty('MAX_CONCURRENCY');
    expect(SYNC_DEFAULTS).toHaveProperty('MIN_CONCURRENCY');
    expect(SYNC_DEFAULTS).toHaveProperty('DELAY');
  });

  it('all values are numbers', () => {
    for (const [key, value] of Object.entries(SYNC_DEFAULTS)) {
      expect(typeof value).toBe('number');
    }
  });

  it('has sensible default ranges', () => {
    expect(SYNC_DEFAULTS.BATCH_SIZE).toBeGreaterThan(0);
    expect(SYNC_DEFAULTS.MAX_BATCH_SIZE).toBeGreaterThanOrEqual(SYNC_DEFAULTS.BATCH_SIZE);
    expect(SYNC_DEFAULTS.MIN_BATCH_SIZE).toBeLessThanOrEqual(SYNC_DEFAULTS.BATCH_SIZE);
    expect(SYNC_DEFAULTS.CONCURRENCY).toBeGreaterThan(0);
    expect(SYNC_DEFAULTS.MAX_CONCURRENCY).toBeGreaterThanOrEqual(SYNC_DEFAULTS.CONCURRENCY);
    expect(SYNC_DEFAULTS.MIN_CONCURRENCY).toBeLessThanOrEqual(SYNC_DEFAULTS.CONCURRENCY);
    expect(SYNC_DEFAULTS.DELAY).toBeGreaterThanOrEqual(0);
  });
});
