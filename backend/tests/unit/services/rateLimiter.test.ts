import { describe, it, expect, vi, afterEach } from 'vitest';
import { rateLimiter } from '../../../src/services/rateLimiter.js';

describe('RateLimiter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows the first request for any known platform', () => {
    expect(rateLimiter.canMakeRequest('steam', 'test-id-1')).toBe(true);
  });

  it('allows requests for an unknown platform (falls back to true)', () => {
    expect(rateLimiter.canMakeRequest('unknown-platform', 'any')).toBe(true);
  });

  it('getRetryDelay returns a number for known platforms', () => {
    expect(rateLimiter.getRetryDelay('steam')).toBeGreaterThan(0);
    expect(rateLimiter.getRetryDelay('xbox')).toBeGreaterThan(0);
    expect(rateLimiter.getRetryDelay('playstation')).toBeGreaterThan(0);
  });

  it('getRetryDelay returns 1000 for unknown platform (default)', () => {
    expect(rateLimiter.getRetryDelay('nonexistent')).toBe(1000);
  });

  it('executeWithRetry executes a function and returns its result', async () => {
    const result = await rateLimiter.executeWithRetry('steam', () => Promise.resolve('done'), 'test-id-exec', 3);
    expect(result).toBe('done');
  });

  it('executeWithRetry throws after exhausting all retries on non-retryable error', async () => {
    const failFn = vi.fn().mockRejectedValue(new Error('permanent error'));
    await expect(
      rateLimiter.executeWithRetry('steam', failFn, 'test-fail', 3),
    ).rejects.toThrow('permanent error');
    expect(failFn).toHaveBeenCalledTimes(1); // Non-retryable: only 1 attempt
  });
});
