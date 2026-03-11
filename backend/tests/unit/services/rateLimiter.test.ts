import { describe, it, expect, vi, afterEach } from 'vitest';
import { rateLimiter } from '../../../src/services/rateLimiter.js';

describe('RateLimiter', () => {
  afterEach(() => {
    vi.useRealTimers();
    rateLimiter.clearLimits();
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

  it('blocks requests when rate limit is exceeded', () => {
    // Make requests up to the steam limit (300 by default)
    for (let i = 0; i < 300; i++) {
      rateLimiter.canMakeRequest('steam', `id-${i}`);
    }
    expect(rateLimiter.canMakeRequest('steam', 'extra')).toBe(false);
  });

  it('resets rate limit after window expires', () => {
    vi.useFakeTimers();
    for (let i = 0; i < 300; i++) {
      rateLimiter.canMakeRequest('steam', `id-${i}`);
    }
    expect(rateLimiter.canMakeRequest('steam', 'extra')).toBe(false);
    // Advance past the 60s window
    vi.advanceTimersByTime(61000);
    expect(rateLimiter.canMakeRequest('steam', 'after-reset')).toBe(true);
  });

  it('getStatus returns remaining requests for unused platform', () => {
    const status = rateLimiter.getStatus('steam');
    expect(status.remaining).toBe(300); // default steam limit
    expect(status.resetTime).toBeNull();
  });

  it('getStatus returns 0 remaining for unknown platform', () => {
    const status = rateLimiter.getStatus('unknown');
    expect(status.remaining).toBe(0);
  });

  it('getStatus reflects request count', () => {
    rateLimiter.canMakeRequest('steam', 'a');
    rateLimiter.canMakeRequest('steam', 'b');
    const status = rateLimiter.getStatus('steam');
    expect(status.remaining).toBe(298); // 300 - 2
    expect(status.resetTime).not.toBeNull();
  });

  it('clearLimits resets all counters', () => {
    for (let i = 0; i < 300; i++) {
      rateLimiter.canMakeRequest('steam', `id-${i}`);
    }
    expect(rateLimiter.canMakeRequest('steam', 'extra')).toBe(false);
    rateLimiter.clearLimits();
    expect(rateLimiter.canMakeRequest('steam', 'fresh')).toBe(true);
  });

  it('waitForDelay resolves after platform delay', async () => {
    vi.useFakeTimers();
    const promise = rateLimiter.waitForDelay('steam');
    vi.advanceTimersByTime(1000); // steam retry delay is now 1000ms
    await promise; // should resolve
  });

  it('executeWithRetry retries on retryable error (429)', async () => {
    vi.useFakeTimers();
    let attempt = 0;
    const fn = vi.fn().mockImplementation(async () => {
      attempt++;
      if (attempt < 2) throw new Error('429 Too Many Requests');
      return 'ok';
    });
    
    const promise = rateLimiter.executeWithRetry('steam', fn, 'retry-429', 3);
    // Advance to let retry delay pass (steam retryAfterMs = 1000)
    await vi.advanceTimersByTimeAsync(1500);
    const result = await promise;
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('executeWithRetry retries on timeout error', async () => {
    vi.useFakeTimers();
    let attempt = 0;
    const fn = vi.fn().mockImplementation(async () => {
      attempt++;
      if (attempt < 2) throw new Error('Request timeout');
      return 'ok';
    });
    
    const promise = rateLimiter.executeWithRetry('steam', fn, 'retry-timeout', 3);
    await vi.advanceTimersByTimeAsync(1500);
    const result = await promise;
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('executeWithRetry uses exponential backoff on retryable errors', async () => {
    vi.useFakeTimers();
    let attempt = 0;
    const fn = vi.fn().mockImplementation(async () => {
      attempt++;
      if (attempt < 3) throw new Error('429 Too Many Requests');
      return 'ok';
    });

    const promise = rateLimiter.executeWithRetry('steam', fn, 'backoff-test', 4);
    // 1st retry backoff: 1000ms * 2^0 = 1000ms
    await vi.advanceTimersByTimeAsync(1100);
    // 2nd retry backoff: 1000ms * 2^1 = 2000ms
    await vi.advanceTimersByTimeAsync(2100);
    const result = await promise;
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('executeWithRetry throws non-retryable error immediately without retry', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('403 Forbidden'));
    await expect(
      rateLimiter.executeWithRetry('steam', fn, 'no-retry', 3),
    ).rejects.toThrow('403 Forbidden');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
