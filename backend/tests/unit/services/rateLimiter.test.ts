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
    // Use a fresh identifier to avoid interference
    const id = 'rate-limit-test';
    // Make requests up to the steam limit (100 by default)
    for (let i = 0; i < 100; i++) {
      rateLimiter.canMakeRequest('steam', id);
    }
    expect(rateLimiter.canMakeRequest('steam', id)).toBe(false);
  });

  it('resets rate limit after window expires', () => {
    vi.useFakeTimers();
    const id = 'rate-window-test';
    for (let i = 0; i < 100; i++) {
      rateLimiter.canMakeRequest('steam', id);
    }
    expect(rateLimiter.canMakeRequest('steam', id)).toBe(false);
    // Advance past the 60s window
    vi.advanceTimersByTime(61000);
    expect(rateLimiter.canMakeRequest('steam', id)).toBe(true);
  });

  it('getStatus returns remaining requests for unused platform', () => {
    const status = rateLimiter.getStatus('steam', 'fresh');
    expect(status.remaining).toBe(100); // default steam limit
    expect(status.resetTime).toBeNull();
  });

  it('getStatus returns 0 remaining for unknown platform', () => {
    const status = rateLimiter.getStatus('unknown');
    expect(status.remaining).toBe(0);
  });

  it('getStatus reflects request count', () => {
    const id = 'status-test';
    rateLimiter.canMakeRequest('steam', id);
    rateLimiter.canMakeRequest('steam', id);
    const status = rateLimiter.getStatus('steam', id);
    expect(status.remaining).toBe(98); // 100 - 2
    expect(status.resetTime).not.toBeNull();
  });

  it('clearLimits resets all counters', () => {
    const id = 'clear-test';
    for (let i = 0; i < 100; i++) {
      rateLimiter.canMakeRequest('steam', id);
    }
    expect(rateLimiter.canMakeRequest('steam', id)).toBe(false);
    rateLimiter.clearLimits();
    expect(rateLimiter.canMakeRequest('steam', id)).toBe(true);
  });

  it('waitForDelay resolves after platform delay', async () => {
    vi.useFakeTimers();
    const promise = rateLimiter.waitForDelay('steam');
    vi.advanceTimersByTime(200);
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
    // Advance to let retry delay pass
    await vi.advanceTimersByTimeAsync(500);
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
    await vi.advanceTimersByTimeAsync(500);
    const result = await promise;
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('executeWithRetry waits and retries when rate limit is exceeded', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const id = 'rate-exceed-retry';

    // Exhaust steam limit so canMakeRequest returns false
    for (let i = 0; i < 100; i++) {
      rateLimiter.canMakeRequest('steam', id);
    }

    const fn = vi.fn().mockResolvedValue('ok');
    // With maxRetries=2, it will wait once then throw
    await expect(
      rateLimiter.executeWithRetry('steam', fn, id, 2),
    ).rejects.toThrow(/Rate limit exceeded/);
    // fn should never be called since canMakeRequest always returns false
    expect(fn).not.toHaveBeenCalled();
  });

  it('executeWithRetry throws when rate limit exceeded after all retries', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const id = 'rate-exhaust';

    // Exhaust steam limit
    for (let i = 0; i < 100; i++) {
      rateLimiter.canMakeRequest('steam', id);
    }

    const fn = vi.fn().mockResolvedValue('ok');
    // Only 1 retry
    await expect(
      rateLimiter.executeWithRetry('steam', fn, id, 1),
    ).rejects.toThrow(/Rate limit exceeded/);
  });
});
