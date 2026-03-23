import { describe, it, expect } from 'vitest';
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
});
