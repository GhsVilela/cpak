import { describe, it, expect, vi } from 'vitest';
import { AdaptiveThrottler } from '../../../src/services/adaptiveThrottler.js';

describe('AdaptiveThrottler', () => {
  it('initializes with the minimum delay', () => {
    const throttler = new AdaptiveThrottler();
    // Initial delay should be at the minimum (100ms)
    const delay = throttler.calculateDelay(500); // Normal response
    expect(delay).toBeGreaterThanOrEqual(100);
    expect(delay).toBeLessThanOrEqual(400);
  });

  it('returns maximum delay (400ms) after a slow response (>1000ms)', () => {
    const throttler = new AdaptiveThrottler();
    const delay = throttler.calculateDelay(2000); // Very slow
    expect(delay).toBe(400);
  });

  it('returns minimum delay (100ms) after a fast response (<300ms)', () => {
    const throttler = new AdaptiveThrottler();
    const delay = throttler.calculateDelay(100); // Fast
    expect(delay).toBe(100);
  });

  it('interpolates delay for mid-range response times', () => {
    const throttler = new AdaptiveThrottler();
    const delay = throttler.calculateDelay(650); // Mid range
    expect(delay).toBeGreaterThan(100);
    expect(delay).toBeLessThan(400);
  });

  it('consecutive fast responses keep delay at minimum', () => {
    const throttler = new AdaptiveThrottler();
    throttler.calculateDelay(50);
    throttler.calculateDelay(100);
    const delay = throttler.calculateDelay(200);
    expect(delay).toBe(100);
  });

  it('getCurrentDelay returns the current delay value', () => {
    const throttler = new AdaptiveThrottler();
    throttler.calculateDelay(2000); // Set to max
    expect(throttler.getCurrentDelay()).toBe(400);
  });

  it('getStats returns correct shape', () => {
    const throttler = new AdaptiveThrottler();
    const stats = throttler.getStats();
    expect(stats).toEqual({
      currentDelay: 100,
      minDelay: 100,
      maxDelay: 400,
    });
  });

  it('throttle waits for the calculated delay', async () => {
    const throttler = new AdaptiveThrottler();
    vi.useFakeTimers();
    const promise = throttler.throttle(50); // Fast response → 100ms delay
    vi.advanceTimersByTime(100);
    await promise;
    vi.useRealTimers();
  });

  it('reset restores initial state', () => {
    const throttler = new AdaptiveThrottler();
    throttler.calculateDelay(2000); // Set to max
    expect(throttler.getCurrentDelay()).toBe(400);
    throttler.reset();
    expect(throttler.getCurrentDelay()).toBe(100);
  });
});
