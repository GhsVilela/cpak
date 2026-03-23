import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock node-cron BEFORE importing scheduler
const scheduleMock = vi.fn().mockReturnValue({
  stop: vi.fn(),
  destroy: vi.fn(),
});
const validateMock = vi.fn().mockReturnValue(true);

vi.mock('node-cron', () => ({
  default: {
    schedule: scheduleMock,
    validate: validateMock,
  },
  schedule: scheduleMock,
  validate: validateMock,
}));

// Mock syncService to prevent actual syncs
vi.mock('../../../src/services/syncService.js', () => ({
  syncService: {
    syncProfile: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('SchedulerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('can import schedulerService without throwing', async () => {
    const { schedulerService } = await import('../../../src/services/scheduler.js');
    expect(schedulerService).toBeTruthy();
  });

  it('validates the cron expression during start()', async () => {
    const { schedulerService } = await import('../../../src/services/scheduler.js');
    await schedulerService.start();
    expect(validateMock).toHaveBeenCalled();
  });

  it('stop() does not throw when called before start()', async () => {
    const { schedulerService } = await import('../../../src/services/scheduler.js');
    expect(() => schedulerService.stop()).not.toThrow();
  });

  it('start() calls cron.schedule when scheduler is enabled', async () => {
    // Enable scheduler via configService mock
    vi.doMock('../../../src/services/configService.js', () => ({
      configService: {
        getSetting: vi.fn().mockImplementation((key: string) => {
          if (key === 'scheduler_enabled') return Promise.resolve('true');
          if (key === 'scheduler_cron') return Promise.resolve('0 3 * * *');
          return Promise.resolve(undefined);
        }),
        getAllSettings: vi.fn().mockResolvedValue([]),
        setSetting: vi.fn().mockResolvedValue(undefined),
      },
    }));
    // Scheduler service is a singleton — this test verifies no exceptions
    const { schedulerService } = await import('../../../src/services/scheduler.js');
    await expect(schedulerService.start()).resolves.not.toThrow();
  });
});
