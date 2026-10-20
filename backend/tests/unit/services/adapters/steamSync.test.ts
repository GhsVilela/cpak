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

  it('uses the group-aware IPlayerService endpoints and maps achievement sets', async () => {
    stubFetch({
      GetOwnedGames: {
        response: {
          games: [{ appid: 500, name: 'Grouped Game', playtime_forever: 100 }],
        },
      },
      GetGameAchievements: {
        response: {
          schema_version: 1,
          achievements: [
            { internal_name: 'ACH_BASE', internal_key: 1, localized_name: 'Base Ach', localized_desc: 'base', icon: 'b.png', icon_gray: 'bg.png', groupid: 0 },
            { internal_name: 'ACH_DLC', internal_key: 2, localized_name: 'DLC Ach', localized_desc: 'dlc', icon: 'd.png', icon_gray: 'dg.png', groupid: 1 },
            { internal_name: 'ACH_ARCHIVED', internal_key: 3, localized_name: 'Old', groupid: 0, archived: true },
          ],
          groups: [
            { groupid: 0, localized_name: 'Base Game', dlcappid: 0, order: 0 },
            { groupid: 1, localized_name: 'Update 1', dlcappid: 1234, order: 1 },
          ],
        },
      },
      GetUserAchievements: {
        response: {
          achievements: [
            { internal_key: 1, unlocked: true, unlock_time: 1700000000 },
            { internal_key: 2, unlocked: false },
          ],
          groups: [],
        },
      },
    });

    const result = await adapter.syncGamesAndAchievements('steamid123');

    expect(result.games).toHaveLength(1);
    expect(result.games[0]).toMatchObject({
      appId: 500,
      name: 'Grouped Game',
      totalAchievements: 2,
      earnedAchievements: 1,
      hasAchievementGroups: true,
    });

    // Archived achievements are excluded from the totals/list
    expect(result.achievements).toHaveLength(2);

    const base = result.achievements.find((a) => a.achievementId === 'ACH_BASE');
    expect(base).toMatchObject({
      groupId: '0',
      groupName: 'Base Game',
      groupOrder: 0,
      unlocked: true,
      icon: 'https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/500/b.png',
      iconGray: 'https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/500/bg.png',
    });
    expect(base!.unlockTime).toEqual(new Date(1700000000 * 1000));

    const dlc = result.achievements.find((a) => a.achievementId === 'ACH_DLC');
    expect(dlc).toMatchObject({
      groupId: '1',
      groupName: 'Update 1',
      groupOrder: 1,
      unlocked: false,
    });
  });

  it('treats a valid empty GetGameAchievements response as definitive (no legacy fallback)', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => {
        if (url.includes('GetOwnedGames')) {
          return { response: { games: [{ appid: 42, name: 'NoAch', playtime_forever: 30 }] } };
        }
        if (url.includes('GetGameAchievements')) {
          return { response: { schema_version: 1, achievements: [], groups: [] } };
        }
        if (url.includes('GetPlayerAchievements')) {
          return { playerstats: { success: true, achievements: [] } };
        }
        if (url.includes('GetSchemaForGame')) {
          return { game: { availableGameStats: { achievements: [] } } };
        }
        return {};
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.syncGamesAndAchievements('steamid123');

    expect(result.games).toHaveLength(0);
    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls.some((u) => u.includes('GetGameAchievements'))).toBe(true);
    expect(urls.some((u) => u.includes('GetPlayerAchievements'))).toBe(false);
    expect(urls.some((u) => u.includes('GetSchemaForGame'))).toBe(false);
  });

  it('filters out owned games with a valid response but no unlocked achievements', async () => {
    stubFetch({
      GetOwnedGames: {
        response: {
          games: [{ appid: 777, name: 'Unplayed', playtime_forever: 60 }],
        },
      },
      GetGameAchievements: {
        response: {
          achievements: [
            { internal_name: 'A1', internal_key: 1, localized_name: 'One', groupid: 0 },
          ],
          groups: [{ groupid: 0, localized_name: 'Base Game', order: 0 }],
        },
      },
      // Valid response, but the player has unlocked nothing (no achievements array).
      GetUserAchievements: { response: { groups: [{ groupid: 0, completed_achievements: 0 }] } },
    });

    const result = await adapter.syncGamesAndAchievements('steamid123');

    expect(result.games).toHaveLength(0);
    expect(result.achievements).toHaveLength(0);
  });

  it('surfaces play-history games with no unlocked achievements as fetch-failed (revoked license)', async () => {
    stubFetch({
      GetOwnedGames: { response: { games: [] } },
      // Game appears in play history but is not owned.
      ClientGetLastPlayedTimes: {
        response: { games: [{ appid: 777, playtime_forever: 60 }] },
      },
      GetGameAchievements: {
        response: {
          achievements: [
            { internal_name: 'A1', internal_key: 1, localized_name: 'One', groupid: 0 },
          ],
          groups: [{ groupid: 0, localized_name: 'Base Game', order: 0 }],
        },
      },
      GetUserAchievements: { response: { groups: [{ groupid: 0, completed_achievements: 0 }] } },
    });

    const result = await adapter.syncGamesAndAchievements('steamid123');

    expect(result.games).toHaveLength(1);
    expect(result.games[0]).toMatchObject({
      appId: 777,
      totalAchievements: 1,
      earnedAchievements: 0,
      achievementsFetchFailed: true,
      ownershipSource: 'played_history',
    });
    expect(result.achievements).toHaveLength(1);
    expect(result.achievements[0].unlocked).toBe(false);
  });
});
