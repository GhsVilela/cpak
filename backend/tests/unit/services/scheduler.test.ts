import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted() so mock references are available inside vi.mock factories
const { scheduleMock, validateMock, syncProfileMock, profileFindMock, getSettingMock, backupDeleteManyMock, restoreDeleteManyMock } = vi.hoisted(() => ({
  scheduleMock: vi.fn().mockReturnValue({ stop: vi.fn(), destroy: vi.fn() }),
  validateMock: vi.fn().mockReturnValue(true),
  syncProfileMock: vi.fn().mockResolvedValue(undefined),
  profileFindMock: vi.fn().mockResolvedValue([]),
  getSettingMock: vi.fn().mockResolvedValue(undefined),
  backupDeleteManyMock: vi.fn().mockResolvedValue({ deletedCount: 0 }),
  restoreDeleteManyMock: vi.fn().mockResolvedValue({ deletedCount: 0 }),
}));

vi.mock('node-cron', () => ({
  default: { schedule: scheduleMock, validate: validateMock },
  schedule: scheduleMock,
  validate: validateMock,
}));

vi.mock('../../../src/services/syncService.js', () => ({
  syncService: { syncProfile: syncProfileMock },
}));

vi.mock('../../../src/models/profile.js', () => ({
  Profile: { find: profileFindMock },
}));

vi.mock('../../../src/models/backupJob.js', () => ({
  BackupJob: { deleteMany: backupDeleteManyMock },
}));

vi.mock('../../../src/models/restoreJob.js', () => ({
  RestoreJob: { deleteMany: restoreDeleteManyMock },
}));

vi.mock('../../../src/services/configService.js', () => ({
  configService: { getSetting: getSettingMock },
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { schedulerService } from '../../../src/services/scheduler.js';

describe('SchedulerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateMock.mockReturnValue(true);
    getSettingMock.mockResolvedValue(undefined);
    profileFindMock.mockResolvedValue([]);
    syncProfileMock.mockResolvedValue(undefined);
    schedulerService.stop();
  });

  it('can import schedulerService without throwing', () => {
    expect(schedulerService).toBeTruthy();
  });

  it('validates the cron expression during start()', async () => {
    await schedulerService.start();
    expect(validateMock).toHaveBeenCalled();
  });

  it('stop() does not throw when not started', () => {
    expect(() => schedulerService.stop()).not.toThrow();
  });

  it('starts sync task when scheduler is enabled', async () => {
    getSettingMock.mockImplementation((key: string) => {
      if (key === 'scheduler_enabled') return Promise.resolve('true');
      return Promise.resolve('0 3 * * *');
    });
    await schedulerService.start();
    expect(scheduleMock).toHaveBeenCalledTimes(2);
  });

  it('does not start sync when scheduler_enabled is undefined', async () => {
    getSettingMock.mockResolvedValue(undefined);
    await schedulerService.start();
    expect(scheduleMock).toHaveBeenCalledTimes(1);
  });

  it('does not start sync when scheduler_enabled is false', async () => {
    getSettingMock.mockImplementation((key: string) => {
      if (key === 'scheduler_enabled') return Promise.resolve('false');
      return Promise.resolve(undefined);
    });
    await schedulerService.start();
    expect(scheduleMock).toHaveBeenCalledTimes(1);
  });

  it('does not schedule when cron expression is invalid', async () => {
    validateMock.mockReturnValue(false);
    getSettingMock.mockResolvedValue('true');
    await schedulerService.start();
    expect(scheduleMock).not.toHaveBeenCalled();
  });

  it('reload stops and restarts the scheduler', async () => {
    getSettingMock.mockResolvedValue('true');
    await schedulerService.reload();
    expect(scheduleMock).toHaveBeenCalled();
  });

  it('runManualSync runs syncProfile for each profile', async () => {
    profileFindMock.mockResolvedValue([
      { platform: 'steam', profileId: 'user1' },
      { platform: 'xbox', profileId: 'user2' },
    ]);
    await schedulerService.runManualSync();
    expect(syncProfileMock).toHaveBeenCalledTimes(2);
  });

  it('runManualSync continues even when one profile fails', async () => {
    profileFindMock.mockResolvedValue([
      { platform: 'steam', profileId: 'user1' },
      { platform: 'xbox', profileId: 'user2' },
    ]);
    syncProfileMock
      .mockRejectedValueOnce(new Error('sync fail'))
      .mockResolvedValueOnce(undefined);
    await schedulerService.runManualSync();
    expect(syncProfileMock).toHaveBeenCalledTimes(2);
  });

  it('runManualSync handles empty profile list', async () => {
    profileFindMock.mockResolvedValue([]);
    await schedulerService.runManualSync();
    expect(syncProfileMock).not.toHaveBeenCalled();
  });

  // --- Cleanup scheduler ---

  it('start() triggers cleanup scheduler as well', async () => {
    getSettingMock.mockResolvedValue('true');
    await schedulerService.start();
    // Should schedule both sync and cleanup tasks
    expect(scheduleMock).toHaveBeenCalledTimes(2);
  });

  it('cleanup cron callback invokes cleanupExpiredJobs', async () => {
    getSettingMock.mockResolvedValue('true');
    await schedulerService.start();

    // Find the cleanup cron callback (second schedule call)
    const cleanupCallback = scheduleMock.mock.calls.find(
      (call: any[]) => call[0] === '0 2 * * *',
    );
    expect(cleanupCallback).toBeDefined();

    // Execute the cleanup callback
    backupDeleteManyMock.mockResolvedValue({ deletedCount: 3 });
    restoreDeleteManyMock.mockResolvedValue({ deletedCount: 1 });
    await cleanupCallback![1]();

    expect(backupDeleteManyMock).toHaveBeenCalled();
    expect(restoreDeleteManyMock).toHaveBeenCalled();
  });

  it('cleanup handles zero expired records', async () => {
    getSettingMock.mockResolvedValue('true');
    await schedulerService.start();

    const cleanupCallback = scheduleMock.mock.calls.find(
      (call: any[]) => call[0] === '0 2 * * *',
    );
    backupDeleteManyMock.mockResolvedValue({ deletedCount: 0 });
    restoreDeleteManyMock.mockResolvedValue({ deletedCount: 0 });
    await cleanupCallback![1]();

    expect(backupDeleteManyMock).toHaveBeenCalled();
    expect(restoreDeleteManyMock).toHaveBeenCalled();
  });

  it('cleanup handles BackupJob.deleteMany error gracefully', async () => {
    getSettingMock.mockResolvedValue('true');
    await schedulerService.start();

    const cleanupCallback = scheduleMock.mock.calls.find(
      (call: any[]) => call[0] === '0 2 * * *',
    );
    backupDeleteManyMock.mockRejectedValue(new Error('DB error'));
    restoreDeleteManyMock.mockResolvedValue({ deletedCount: 0 });
    // Should not throw
    await cleanupCallback![1]();
  });

  it('cleanup handles RestoreJob.deleteMany error gracefully', async () => {
    getSettingMock.mockResolvedValue('true');
    await schedulerService.start();

    const cleanupCallback = scheduleMock.mock.calls.find(
      (call: any[]) => call[0] === '0 2 * * *',
    );
    backupDeleteManyMock.mockResolvedValue({ deletedCount: 0 });
    restoreDeleteManyMock.mockRejectedValue(new Error('DB error'));
    // Should not throw
    await cleanupCallback![1]();
  });

  it('sync cron callback invokes syncAllProfiles', async () => {
    getSettingMock.mockImplementation((key: string) => {
      if (key === 'scheduler_enabled') return Promise.resolve('true');
      return Promise.resolve('0 3 * * *');
    });
    profileFindMock.mockResolvedValue([
      { platform: 'steam', profileId: 'u1' },
    ]);

    await schedulerService.start();

    const syncCallback = scheduleMock.mock.calls.find(
      (call: any[]) => call[0] !== '0 2 * * *',
    );
    expect(syncCallback).toBeDefined();
    await syncCallback![1]();
    expect(syncProfileMock).toHaveBeenCalledTimes(1);
  });

  it('loadConfiguration catch uses default when getSetting throws', async () => {
    // getSetting throws on scheduler_cron during loadConfiguration
    let callCount = 0;
    getSettingMock.mockImplementation((key: string) => {
      if (key === 'scheduler_cron') {
        callCount++;
        // loadConfiguration is called twice: once in constructor, once in start()
        // Make the one in start() throw to cover the catch block
        if (callCount >= 1) return Promise.reject(new Error('DB down'));
        return Promise.resolve('0 3 * * *');
      }
      if (key === 'scheduler_enabled') return Promise.resolve('true');
      return Promise.resolve(undefined);
    });
    // Should not throw — loadConfiguration catches the error
    await schedulerService.start();
    expect(scheduleMock).toHaveBeenCalled();
  });

  it('start() skips sync if task already running', async () => {
    getSettingMock.mockImplementation((key: string) => {
      if (key === 'scheduler_enabled') return Promise.resolve('true');
      return Promise.resolve('0 3 * * *');
    });
    await schedulerService.start();
    const firstCallCount = scheduleMock.mock.calls.length;

    // Start again without stopping — should be no-op for sync task
    await schedulerService.start();
    // cleanup scheduler also checks if already running, so no new schedule calls
    expect(scheduleMock.mock.calls.length).toBe(firstCallCount);
  });

  it('cleanup scheduler skips if cleanup task already running', async () => {
    getSettingMock.mockResolvedValue('true');
    await schedulerService.start();
    // cleanup task is now running, calling start again should not create a second cleanup
    const callsAfterFirstStart = scheduleMock.mock.calls.length;
    await schedulerService.start();
    expect(scheduleMock.mock.calls.length).toBe(callsAfterFirstStart);
  });

  it('syncAllProfiles handles Profile.find error', async () => {
    profileFindMock.mockRejectedValue(new Error('DB connection lost'));
    // runManualSync calls syncAllProfiles which catches the error
    await schedulerService.runManualSync();
    expect(syncProfileMock).not.toHaveBeenCalled();
  });
});
