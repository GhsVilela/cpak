import { describe, it, expect } from 'vitest';
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
});
