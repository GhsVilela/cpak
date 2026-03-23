import { describe, it, expect, vi, beforeEach } from 'vitest';

const { connectDBMock, migrateAchievementIndexesMock, migrateGameIndexesMock, initializeDefaultsMock, schedulerStartMock } = vi.hoisted(() => ({
  connectDBMock: vi.fn().mockResolvedValue(undefined),
  migrateAchievementIndexesMock: vi.fn().mockResolvedValue(undefined),
  migrateGameIndexesMock: vi.fn().mockResolvedValue(undefined),
  initializeDefaultsMock: vi.fn().mockResolvedValue(undefined),
  schedulerStartMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/utils/db.js', () => ({
  connectDB: connectDBMock,
}));

vi.mock('../../src/migrations/add-achievement-indexes.js', () => ({
  migrateAchievementIndexes: migrateAchievementIndexesMock,
}));

vi.mock('../../src/migrations/add-game-indexes.js', () => ({
  migrateGameIndexes: migrateGameIndexesMock,
}));

vi.mock('../../src/services/configService.js', () => ({
  configService: { initializeDefaults: initializeDefaultsMock, getSetting: vi.fn() },
}));

vi.mock('../../src/services/scheduler.js', () => ({
  schedulerService: { start: schedulerStartMock, stop: vi.fn(), reload: vi.fn() },
}));

// Mock all route registrations to avoid complex dependencies
vi.mock('../../src/api/routes/index.js', () => ({
  registerRoutes: async () => {},
}));

vi.mock('../../src/utils/config.js', () => ({
  config: { API_BASE_PATH: '/api' },
  getApiPort: () => 3000,
  getAllowedOrigins: () => ['http://localhost:3000'],
}));

import { buildServer } from '../../src/api/server.js';

describe('buildServer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a Fastify instance with all options skipped', async () => {
    const app = await buildServer({
      skipDB: true,
      skipMigrations: true,
      skipScheduler: true,
      skipInit: true,
      logger: false,
    });
    expect(app).toBeDefined();
    expect(connectDBMock).not.toHaveBeenCalled();
    expect(schedulerStartMock).not.toHaveBeenCalled();
    await app.close();
  });

  it('connects to DB when skipDB is false', async () => {
    const app = await buildServer({
      skipDB: false,
      skipMigrations: true,
      skipScheduler: true,
      skipInit: true,
      logger: false,
    });
    expect(connectDBMock).toHaveBeenCalled();
    await app.close();
  });

  it('runs migrations when skipMigrations is false', async () => {
    const app = await buildServer({
      skipDB: false,
      skipMigrations: false,
      skipScheduler: true,
      skipInit: true,
      logger: false,
    });
    expect(migrateAchievementIndexesMock).toHaveBeenCalled();
    expect(migrateGameIndexesMock).toHaveBeenCalled();
    await app.close();
  });

  it('throws when migration fails', async () => {
    migrateAchievementIndexesMock.mockRejectedValue(new Error('migration error'));
    await expect(buildServer({
      skipDB: false,
      skipMigrations: false,
      skipScheduler: true,
      skipInit: true,
      logger: false,
    })).rejects.toThrow('migration error');
  });

  it('initializes config defaults when skipInit is false', async () => {
    const app = await buildServer({
      skipDB: false,
      skipMigrations: true,
      skipScheduler: true,
      skipInit: false,
      logger: false,
    });
    expect(initializeDefaultsMock).toHaveBeenCalled();
    await app.close();
  });

  it('starts scheduler when skipScheduler is false', async () => {
    const app = await buildServer({
      skipDB: true,
      skipScheduler: false,
      logger: false,
    });
    expect(schedulerStartMock).toHaveBeenCalled();
    await app.close();
  });

  it('uses default logger config when none provided', async () => {
    const app = await buildServer({
      skipDB: true,
      skipScheduler: true,
    });
    expect(app).toBeDefined();
    await app.close();
  });
});
