import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mocks for modules used by syncGamesAndAchievements
const {
  measureApiCallMock,
  measureBatchOperationMock,
  getSettingMock,
  findByIdMock,
  findByIdAndUpdateMock,
  executeWithRetryMock,
} = vi.hoisted(() => ({
  measureApiCallMock: vi.fn(),
  measureBatchOperationMock: vi.fn(),
  getSettingMock: vi.fn(),
  findByIdMock: vi.fn(),
  findByIdAndUpdateMock: vi.fn(),
  executeWithRetryMock: vi.fn(),
}));

vi.mock('../../../../src/services/performanceMonitor.js', () => ({
  performanceMonitor: {
    measureApiCall: measureApiCallMock,
    measureBatchOperation: measureBatchOperationMock,
  },
}));

vi.mock('../../../../src/services/configService.js', () => ({
  configService: { getSetting: getSettingMock },
}));

vi.mock('../../../../src/models/syncOperation.js', () => ({
  SyncOperation: {
    findById: findByIdMock,
    findByIdAndUpdate: findByIdAndUpdateMock,
  },
}));

vi.mock('../../../../src/services/rateLimiter.js', () => ({
  rateLimiter: { executeWithRetry: executeWithRetryMock },
}));

vi.mock('../../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { SteamAdapter } from '../../../../src/services/adapters/steam.js';

describe('SteamAdapter.syncGamesAndAchievements', () => {
  let adapter: SteamAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new SteamAdapter('fake-api-key');

    // measureApiCall: call through to the fn
    measureApiCallMock.mockImplementation((_name: string, fn: () => any) => fn());

    // measureBatchOperation: call through and wrap result
    measureBatchOperationMock.mockImplementation(
      async (_name: string, _size: number, fn: () => any) => {
        const result = await fn();
        return { result, duration: 100, throughput: _size / 0.1 };
      },
    );

    // Default config: small batch size and concurrency for predictable tests
    getSettingMock.mockResolvedValue(null);

    // SyncOperation: not cancelled
    findByIdMock.mockResolvedValue({ status: 'in_progress' });
    findByIdAndUpdateMock.mockResolvedValue({});

    // rateLimiter: just call the fn directly
    executeWithRetryMock.mockImplementation(
      (_platform: string, fn: () => any) => fn(),
    );
  });

  function stubFetch(responses: Record<string, any>) {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => ({
        ok: true,
        json: async () => {
          for (const [pattern, data] of Object.entries(responses)) {
            if (url.includes(pattern)) return data;
          }
          return {};
        },
      })),
    );
  }

  it('returns empty when player owns no games', async () => {
    stubFetch({
      GetOwnedGames: { response: { games: [] } },
    });

    const result = await adapter.syncGamesAndAchievements('steamid123');
    expect(result.games).toEqual([]);
    expect(result.achievements).toEqual([]);
    expect(result.adaptiveStats).toBeDefined();
  });

  it('filters out games with no achievements', async () => {
    stubFetch({
      GetOwnedGames: {
        response: {
          games: [{ appid: 10, name: 'NoAch', playtime_forever: 50 }],
        },
      },
      GetPlayerAchievements: { playerstats: { success: true, achievements: [] } },
      GetSchemaForGame: { game: { availableGameStats: { achievements: [] } } },
    });

    const result = await adapter.syncGamesAndAchievements('steamid123');
    expect(result.games).toHaveLength(0);
  });

  it('filters out games where no achievements are earned', async () => {
    stubFetch({
      GetOwnedGames: {
        response: {
          games: [{ appid: 10, name: 'Unearned', playtime_forever: 100 }],
        },
      },
      GetPlayerAchievements: {
        playerstats: {
          success: true,
          achievements: [{ apiname: 'ACH1', achieved: 0, unlocktime: 0 }],
        },
      },
      GetSchemaForGame: {
        game: {
          availableGameStats: {
            achievements: [
              { name: 'ACH1', defaultvalue: 0, displayName: 'First', description: 'Do it', icon: 'i.png', icongray: 'g.png' },
            ],
          },
        },
      },
    });

    const result = await adapter.syncGamesAndAchievements('steamid123');
    expect(result.games).toHaveLength(0);
  });

  it('includes games with earned achievements and maps schema metadata', async () => {
    stubFetch({
      GetOwnedGames: {
        response: {
          games: [
            { appid: 440, name: 'TF2', playtime_forever: 500, img_icon_url: 'icon_hash' },
          ],
        },
      },
      GetPlayerAchievements: {
        playerstats: {
          success: true,
          achievements: [
            { apiname: 'ACH_WIN', achieved: 1, unlocktime: 1700000000, name: 'Old Name', description: 'Old Desc' },
            { apiname: 'ACH_LOSE', achieved: 0, unlocktime: 0 },
          ],
        },
      },
      GetSchemaForGame: {
        game: {
          availableGameStats: {
            achievements: [
              { name: 'ACH_WIN', defaultvalue: 0, displayName: 'Winner', description: 'Win match', icon: 'win.png', icongray: 'win_gray.png' },
              { name: 'ACH_LOSE', defaultvalue: 0, displayName: 'Loser', description: 'Lose match', icon: 'lose.png', icongray: 'lose_gray.png' },
            ],
          },
        },
      },
    });

    const result = await adapter.syncGamesAndAchievements('steamid123');

    expect(result.games).toHaveLength(1);
    expect(result.games[0]).toMatchObject({
      appId: 440,
      name: 'TF2',
      playtimeMinutes: 500,
      totalAchievements: 2,
      earnedAchievements: 1,
      iconHash: 'icon_hash',
    });

    expect(result.achievements).toHaveLength(2);
    // Schema metadata should override achievement data
    const winAch = result.achievements.find((a) => a.achievementId === 'ACH_WIN');
    expect(winAch).toMatchObject({
      appId: 440,
      name: 'Winner',
      description: 'Win match',
      unlocked: true,
      icon: 'win.png',
      iconGray: 'win_gray.png',
    });
    expect(winAch!.unlockTime).toEqual(new Date(1700000000 * 1000));

    // Unearned achievement should still be included (all achievements mapped)
    const loseAch = result.achievements.find((a) => a.achievementId === 'ACH_LOSE');
    expect(loseAch!.unlocked).toBe(false);
  });

  it('returns adaptive stats with final batch, concurrency, and delay', async () => {
    stubFetch({
      GetOwnedGames: {
        response: {
          games: [{ appid: 1, name: 'Game1', playtime_forever: 10 }],
        },
      },
      GetPlayerAchievements: {
        playerstats: {
          success: true,
          achievements: [{ apiname: 'A', achieved: 1, unlocktime: 1000 }],
        },
      },
      GetSchemaForGame: {
        game: {
          availableGameStats: {
            achievements: [
              { name: 'A', defaultvalue: 0, displayName: 'A', description: '', icon: '', icongray: '' },
            ],
          },
        },
      },
    });

    const result = await adapter.syncGamesAndAchievements('steamid123');
    expect(result.adaptiveStats).toBeDefined();
    expect(typeof result.adaptiveStats!.finalBatchSize).toBe('number');
    expect(typeof result.adaptiveStats!.finalConcurrency).toBe('number');
    expect(typeof result.adaptiveStats!.finalDelay).toBe('number');
  });

  it('updates syncOperation progress and checks cancellation', async () => {
    stubFetch({
      GetOwnedGames: {
        response: {
          games: [{ appid: 1, name: 'G', playtime_forever: 0 }],
        },
      },
      GetPlayerAchievements: {
        playerstats: {
          success: true,
          achievements: [{ apiname: 'A', achieved: 1, unlocktime: 100 }],
        },
      },
      GetSchemaForGame: {
        game: {
          availableGameStats: {
            achievements: [
              { name: 'A', defaultvalue: 0, displayName: 'A', description: '', icon: '', icongray: '' },
            ],
          },
        },
      },
    });

    const syncOp = { _id: 'op123', totalGames: 0, gamesCompleted: 0, save: vi.fn() };
    await adapter.syncGamesAndAchievements('steamid123', syncOp);

    expect(syncOp.save).toHaveBeenCalled();
    expect(syncOp.totalGames).toBeGreaterThanOrEqual(1);
    expect(findByIdMock).toHaveBeenCalledWith('op123');
    expect(findByIdAndUpdateMock).toHaveBeenCalledWith('op123', { gamesProcessed: 1 });
  });

  it('throws when sync is cancelled mid-operation', async () => {
    stubFetch({
      GetOwnedGames: {
        response: {
          games: [{ appid: 1, name: 'G', playtime_forever: 0 }],
        },
      },
      GetPlayerAchievements: {
        playerstats: {
          success: true,
          achievements: [{ apiname: 'A', achieved: 1, unlocktime: 100 }],
        },
      },
      GetSchemaForGame: {
        game: {
          availableGameStats: {
            achievements: [
              { name: 'A', defaultvalue: 0, displayName: 'A', description: '', icon: '', icongray: '' },
            ],
          },
        },
      },
    });

    findByIdMock.mockResolvedValue({ status: 'cancelled' });
    const syncOp = { _id: 'op123', totalGames: 0, gamesCompleted: 0, save: vi.fn() };

    await expect(adapter.syncGamesAndAchievements('steamid123', syncOp)).rejects.toThrow(
      'Sync cancelled by user',
    );
  });

  it('handles game processing errors gracefully (returns null for failed games)', async () => {
    // Make getOwnedGames succeed but individual game calls throw
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('GetOwnedGames')) {
          return {
            ok: true,
            json: async () => ({
              response: {
                games: [{ appid: 999, name: 'Broken', playtime_forever: 10 }],
              },
            }),
          };
        }
        throw new Error('API failure');
      }),
    );

    const result = await adapter.syncGamesAndAchievements('steamid123');
    // Game processing error is caught and game returned as null, so no games in result
    expect(result.games).toHaveLength(0);
  });

  it('processes games using adaptive defaults (no configService lookup)', async () => {
    stubFetch({
      GetOwnedGames: { response: { games: [] } },
    });

    const result = await adapter.syncGamesAndAchievements('steamid123');
    expect(result.games).toEqual([]);
    expect(result.adaptiveStats).toBeDefined();
  });
});
