import { describe, it, expect, vi } from 'vitest';
import { AdaptiveConcurrencyController } from '../../../src/services/adaptiveConcurrencyController.js';

describe('AdaptiveConcurrencyController', () => {
  it('starts at the user-configured max concurrency', () => {
    const controller = new AdaptiveConcurrencyController(10);
    expect(controller.getConcurrency()).toBe(10);
  });

  it('executes operations and returns their results', async () => {
    const controller = new AdaptiveConcurrencyController(5);
    const result = await controller.execute(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  it('enforces concurrency limit — no more than N concurrent operations', async () => {
    const controller = new AdaptiveConcurrencyController(2);
    let concurrent = 0;
    let maxConcurrent = 0;

    const operation = () =>
      new Promise<void>((resolve) => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        setTimeout(() => {
          concurrent--;
          resolve();
        }, 10);
      });

    await Promise.all([
      controller.execute(operation),
      controller.execute(operation),
      controller.execute(operation),
      controller.execute(operation),
    ]);

    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it('never goes below minimum concurrency of 1', () => {
    const controller = new AdaptiveConcurrencyController(1);
    expect(controller.getConcurrency()).toBe(1);
  });

  it('reset() restores the controller to its initial state', () => {
    const controller = new AdaptiveConcurrencyController(5);
    controller.reset();
    expect(controller.getConcurrency()).toBe(5);
  });

  it('getStats() returns expected shape', () => {
    const controller = new AdaptiveConcurrencyController(4);
    const stats = controller.getStats();
    expect(stats).toHaveProperty('currentConcurrency');
    expect(stats).toHaveProperty('maxConcurrency');
    expect(stats).toHaveProperty('activeCount');
    expect(stats).toHaveProperty('pendingCount');
  });

  it('decreases concurrency when operations are slow', async () => {
    const controller = new AdaptiveConcurrencyController(5);
    // Simulate slow operations by mocking Date.now
    const realNow = Date.now;
    let callCount = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => {
      callCount++;
      // Alternate between start and end calls with 3000ms gap (> 2000ms slow threshold)
      return callCount % 2 === 1 ? 1000 : 4000;
    });

    // Execute enough operations to trigger adjustment (need 5+ samples)
    for (let i = 0; i < 6; i++) {
      await controller.execute(() => Promise.resolve());
    }

    expect(controller.getConcurrency()).toBeLessThan(5);

    vi.spyOn(Date, 'now').mockRestore();
  });

  it('increases concurrency when operations are fast', async () => {
    const controller = new AdaptiveConcurrencyController(10);
    // First, artificially reduce concurrency
    const realNow = Date.now;
    let callCount = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => {
      callCount++;
      return callCount % 2 === 1 ? 1000 : 4000; // Slow
    });
    for (let i = 0; i < 6; i++) {
      await controller.execute(() => Promise.resolve());
    }
    const reducedLevel = controller.getConcurrency();
    expect(reducedLevel).toBeLessThan(10);

    // Now simulate fast operations
    callCount = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => {
      callCount++;
      return callCount % 2 === 1 ? 1000 : 1100; // 100ms (< 500ms fast threshold)
    });
    // Need more operations to fill window
    for (let i = 0; i < 12; i++) {
      await controller.execute(() => Promise.resolve());
    }

    expect(controller.getConcurrency()).toBeGreaterThan(reducedLevel);
    vi.spyOn(Date, 'now').mockRestore();
  });

  it('propagates errors from execute', async () => {
    const controller = new AdaptiveConcurrencyController(2);
    await expect(
      controller.execute(() => Promise.reject(new Error('test error')))
    ).rejects.toThrow('test error');
  });

  it('getStats averageOperationTime computes correctly', async () => {
    const controller = new AdaptiveConcurrencyController(3);
    let callCount = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => {
      callCount++;
      return callCount % 2 === 1 ? 1000 : 1500; // 500ms per op
    });

    await controller.execute(() => Promise.resolve());
    await controller.execute(() => Promise.resolve());

    const stats = controller.getStats();
    expect(stats.averageOperationTime).toBe(500);
    expect(stats.recentOperationTimes).toHaveLength(2);
    vi.spyOn(Date, 'now').mockRestore();
  });

  it('clamps user-configured max to at least 1', () => {
    const controller = new AdaptiveConcurrencyController(0);
    expect(controller.getConcurrency()).toBe(1);
  });
});
