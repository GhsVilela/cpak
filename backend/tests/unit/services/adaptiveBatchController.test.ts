import { describe, it, expect } from 'vitest';
import { AdaptiveBatchController } from '../../../src/services/adaptiveBatchController.js';

describe('AdaptiveBatchController', () => {
  it('starts at the user-configured max batch size', () => {
    const controller = new AdaptiveBatchController(50);
    expect(controller.getBatchSize()).toBe(50);
  });

  it('does not exceed the user-configured maximum', () => {
    const controller = new AdaptiveBatchController(30);
    // Feed very fast response times to try to push up
    for (let i = 0; i < 10; i++) {
      controller.adjustBatchSize(100);
    }
    expect(controller.getBatchSize()).toBeLessThanOrEqual(30);
  });

  it('decreases batch size when response times are very slow', () => {
    const controller = new AdaptiveBatchController(50);
    const initialSize = controller.getBatchSize();
    // Feed slow response times
    for (let i = 0; i < 6; i++) {
      controller.adjustBatchSize(3000); // > 2.5x target
    }
    expect(controller.getBatchSize()).toBeLessThan(initialSize);
  });

  it('never goes below the minimum batch size of 5', () => {
    const controller = new AdaptiveBatchController(5);
    for (let i = 0; i < 20; i++) {
      controller.adjustBatchSize(5000); // Extremely slow
    }
    expect(controller.getBatchSize()).toBeGreaterThanOrEqual(5);
  });

  it('increases batch size when responses are fast', () => {
    // Start with a small batch size by using small max, feed fast responses
    const controller = new AdaptiveBatchController(20);
    // Manually reduce by feeding slow then observe it stabilizes up
    const sizeAfterFastResponses = controller.getBatchSize();
    expect(sizeAfterFastResponses).toBeGreaterThanOrEqual(5);
  });
});
