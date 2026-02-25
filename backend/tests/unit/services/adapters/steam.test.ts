import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SteamAdapter } from '../../../../src/services/adapters/steam.js';

describe('SteamAdapter', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('getOwnedGames returns mapped game array on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: {
          games: [
            { appid: 10, name: 'Counter-Strike', playtime_forever: 100 },
            { appid: 20, name: 'Team Fortress 2', playtime_forever: 200 },
          ],
        },
      }),
    }));

    const adapter = new SteamAdapter('fake-api-key');
    const games = await adapter.getOwnedGames('76561197960287930');
    expect(games).toHaveLength(2);
    expect(games[0].name).toBe('Counter-Strike');
  });

  it('getOwnedGames returns empty array when response has no games', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: {} }),
    }));

    const adapter = new SteamAdapter('fake-api-key');
    const games = await adapter.getOwnedGames('76561197960287930');
    expect(games).toEqual([]);
  });

  it('getPlayerAchievements returns achievement list on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        playerstats: {
          success: true,
          achievements: [
            { apiname: 'ACH_WIN_ONE', achieved: 1, unlocktime: 1700000000 },
          ],
        },
      }),
    }));

    const adapter = new SteamAdapter('fake-api-key');
    const achievements = await adapter.getPlayerAchievements('76561197960287930', 10);
    expect(achievements.length).toBeGreaterThanOrEqual(1);
  });

  it('getPlayerAchievements returns empty array on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const adapter = new SteamAdapter('fake-api-key');
    const achievements = await adapter.getPlayerAchievements('76561197960287930', 10);
    expect(achievements).toEqual([]);
  });
});
