import { describe, it, expect, vi, beforeEach } from 'vitest';

const { findByIdAndUpdateMock } = vi.hoisted(() => ({
  findByIdAndUpdateMock: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../../src/models/syncOperation.js', () => ({
  SyncOperation: { findByIdAndUpdate: findByIdAndUpdateMock },
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { SyncProgressTracker } from '../../../src/services/syncProgress.js';

function createTracker(platform: 'steam' | 'xbox' | 'playstation' = 'steam') {
  return new SyncProgressTracker(
    { _id: { toString: () => 'op1' } as any, platform },
  );
}

describe('SyncProgressTracker', () => {
  beforeEach(() => {
    findByIdAndUpdateMock.mockClear();
  });

  it('advances through phases and never decreases', async () => {
    const tracker = createTracker('steam');

    await tracker.begin('preparing', 1, 'Preparing sync...');
    await tracker.complete('Prepared');

    await tracker.begin('discovering', null, 'Fetching library...');
    await tracker.setTotal(10, 'Found 10 games');
    await tracker.begin('achievements', 10, 'Fetching achievement data... (0/10)');
    await tracker.update(5, 'Fetching achievement data... (5/10)');

    // Steam achievement fetch is 38% of the bar; 5/10 must add ~19%.
    const writesAfterHalf = findByIdAndUpdateMock.mock.calls.at(-1)?.[1]?.$set;
    expect(writesAfterHalf.progress).toBeGreaterThan(20);
    expect(writesAfterHalf.progress).toBeLessThan(30);

    await tracker.update(4, 'Fetching achievement data... (4/10)');
    const afterOutOfOrder = findByIdAndUpdateMock.mock.calls.at(-1)?.[1]?.$set;
    expect(afterOutOfOrder.progress).toBe(writesAfterHalf.progress);

    await tracker.update(10, 'Fetching achievement data... (10/10)');
    await tracker.complete('Achievements fetched');

    await tracker.begin('game-images', 0, 'Game images already up to date');
    await tracker.begin('icons', 0, 'Achievement icons already up to date');
    await tracker.begin('saving', 2, 'Saving... (0/2)');
    await tracker.update(1, 'Saving... (1/2)');

    await tracker.finish('Sync complete');
    const finalWrite = findByIdAndUpdateMock.mock.calls.at(-1)?.[1]?.$set;
    expect(finalWrite.progress).toBe(100);
    expect(finalWrite.message).toBe('Sync complete');
  });

  it('keeps progress monotonic when a phase total unexpectedly grows', async () => {
    const tracker = createTracker('xbox');
    await tracker.begin('preparing', 1, 'Preparing sync...');
    await tracker.complete('Prepared');
    await tracker.begin('discovering', 0, 'Library loaded');
    await tracker.begin('game-images', 0, 'Game images already up to date');
    await tracker.begin('achievements', 10, 'Fetching achievements... (0/10)');
    await tracker.update(5, 'Fetching achievements... (5/10)');

    const before = findByIdAndUpdateMock.mock.calls.at(-1)?.[1]?.$set.progress;
    await tracker.setTotal(20, 'Fetching achievements... (5/20)');
    const after = findByIdAndUpdateMock.mock.calls.at(-1)?.[1]?.$set.progress;

    expect(after).toBeGreaterThanOrEqual(before);
  });

  it('caps running progress at 99 until finish', async () => {
    const tracker = createTracker('playstation');
    await tracker.begin('preparing', 1, 'Preparing sync...');
    await tracker.complete('Prepared');
    await tracker.begin('discovering', 0, 'Library loaded');
    await tracker.begin('game-images', 0, 'Game images already up to date');
    await tracker.begin('achievements', 0, 'Trophy data fetched');
    await tracker.begin('icons', 0, 'Trophy icons already up to date');
    await tracker.begin('saving', 0, 'Saved');
    await tracker.complete('Saved');

    const write = findByIdAndUpdateMock.mock.calls.at(-1)?.[1]?.$set;
    expect(write.progress).toBe(99);

    await tracker.finish('Sync complete');
    expect(findByIdAndUpdateMock.mock.calls.at(-1)?.[1]?.$set.progress).toBe(100);
  });
});
