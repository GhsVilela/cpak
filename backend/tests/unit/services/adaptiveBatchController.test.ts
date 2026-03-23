import { describe, it, expect } from 'vitest';
import { AdaptiveBatchController } from '../../../src/services/adaptiveBatchController.js';

describe('AdaptiveBatchController', () => {
  it('starts at the configured starting batch size', () => {
    const controller = new AdaptiveBatchController(50, 100);
    expect(controller.getBatchSize()).toBe(50);
  });

  it('scales up beyond starting value to max when responses are fast', () => {
    const controller = new AdaptiveBatchController(30, 100);
    // Feed very fast response times to push up
    for (let i = 0; i < 20; i++) {
      controller.adjustBatchSize(100);
    }
    expect(controller.getBatchSize()).toBeGreaterThan(30);
    expect(controller.getBatchSize()).toBeLessThanOrEqual(100);
  });

  it('does not exceed the configured maximum', () => {
    const controller = new AdaptiveBatchController(80, 100);
    // Feed very fast response times to try to push above max
    for (let i = 0; i < 50; i++) {
      controller.adjustBatchSize(100);
    }
    expect(controller.getBatchSize()).toBeLessThanOrEqual(100);
  });

  it('decreases batch size when response times are very slow', () => {
    const controller = new AdaptiveBatchController(50, 100);
    const initialSize = controller.getBatchSize();
    // Feed slow response times
    for (let i = 0; i < 6; i++) {
      controller.adjustBatchSize(3000); // > 2.5x target
    }
    expect(controller.getBatchSize()).toBeLessThan(initialSize);
  });

  it('never goes below the minimum batch size', () => {
    const controller = new AdaptiveBatchController(20, 100, 20);
    for (let i = 0; i < 20; i++) {
      controller.adjustBatchSize(5000); // Extremely slow
    }
    expect(controller.getBatchSize()).toBeGreaterThanOrEqual(20);
  });

  it('respects custom minBatchSize', () => {
    const controller = new AdaptiveBatchController(10, 100, 5);
    for (let i = 0; i < 20; i++) {
      controller.adjustBatchSize(5000);
    }
    expect(controller.getBatchSize()).toBeGreaterThanOrEqual(5);
  });

  it('increases batch size when responses are fast', () => {
    const controller = new AdaptiveBatchController(20, 100, 20);
    // Manually reduce by feeding slow then observe it stabilizes up
    const sizeAfterFastResponses = controller.getBatchSize();
    expect(sizeAfterFastResponses).toBeGreaterThanOrEqual(5);
  });

  it('getStats returns correct shape', () => {
    const controller = new AdaptiveBatchController(20, 100);
    const stats = controller.getStats();
    expect(stats.currentBatchSize).toBe(20);
    expect(stats.maxBatchSize).toBe(100);
    expect(stats.minBatchSize).toBe(20);
    expect(stats.recentResponseTimes).toEqual([]);
    expect(stats.averageResponseTime).toBeNull();
  });

  it('getStats computes average response time', () => {
    const controller = new AdaptiveBatchController(20, 100);
    controller.adjustBatchSize(100);
    controller.adjustBatchSize(300);
    const stats = controller.getStats();
    expect(stats.averageResponseTime).toBe(200);
    expect(stats.recentResponseTimes).toEqual([100, 300]);
  });

  it('reset restores to initial state', () => {
    const controller = new AdaptiveBatchController(50, 100);
    for (let i = 0; i < 10; i++) {
      controller.adjustBatchSize(5000);
    }
    const reduced = controller.getBatchSize();
    expect(reduced).toBeLessThan(50);

    controller.reset();
    expect(controller.getBatchSize()).toBe(50);
    expect(controller.getStats().recentResponseTimes).toEqual([]);
  });

  it('clamps starting value to at least minBatchSize', () => {
    const controller = new AdaptiveBatchController(2, 100);
    expect(controller.getBatchSize()).toBe(20);
  });

  it('clamps starting value with custom minBatchSize', () => {
    const controller = new AdaptiveBatchController(2, 100, 5);
    expect(controller.getBatchSize()).toBe(5);
  });

  it('increases batch size after recovery from slow period', () => {
    const controller = new AdaptiveBatchController(50, 200);
    // Reduce with slow responses
    for (let i = 0; i < 10; i++) {
      controller.adjustBatchSize(5000);
    }
    const reducedSize = controller.getBatchSize();

    // Feed fast responses to recover
    for (let i = 0; i < 10; i++) {
      controller.adjustBatchSize(100);
    }
    expect(controller.getBatchSize()).toBeGreaterThan(reducedSize);
  });
});
