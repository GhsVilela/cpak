import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SteamAdapter, createSteamAdapter } from '../../../../src/services/adapters/steam.js';

describe('SteamAdapter', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // --- getPlayerSummary ---

  it('getPlayerSummary returns player data on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: {
          players: [{ personaname: 'TestUser', profileurl: 'https://steam/id/test', avatar: 'https://avatar.png' }],
        },
      }),
    }));

    const adapter = new SteamAdapter('fake-api-key');
    const summary = await adapter.getPlayerSummary('76561197960287930');
    expect(summary).not.toBeNull();
    expect(summary!.personaname).toBe('TestUser');
  });

  it('getPlayerSummary returns null when no players in response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: { players: [] } }),
    }));

    const adapter = new SteamAdapter('fake-api-key');
    const summary = await adapter.getPlayerSummary('76561197960287930');
    expect(summary).toBeNull();
  });

  it('getPlayerSummary returns null on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    const adapter = new SteamAdapter('fake-api-key');
    const summary = await adapter.getPlayerSummary('76561197960287930');
    expect(summary).toBeNull();
  });

  // --- getOwnedGames ---

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

  it('getPlayerAchievements returns empty when playerstats.success is false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ playerstats: { success: false } }),
    }));

    const adapter = new SteamAdapter('fake-api-key');
    const achievements = await adapter.getPlayerAchievements('76561197960287930', 10);
    expect(achievements).toEqual([]);
  });

  // --- getGameSchema ---

  it('getGameSchema returns schema on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        game: {
          availableGameStats: {
            achievements: [
              { name: 'ACH_1', defaultvalue: 0, displayName: 'First Win', description: 'Win once', icon: 'icon.png', icongray: 'gray.png' },
            ],
          },
        },
      }),
    }));

    const adapter = new SteamAdapter('fake-api-key');
    const schema = await adapter.getGameSchema(10);
    expect(schema).not.toBeNull();
    expect(schema!.availableGameStats!.achievements).toHaveLength(1);
  });

  it('getGameSchema returns null on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    const adapter = new SteamAdapter('fake-api-key');
    const schema = await adapter.getGameSchema(10);
    expect(schema).toBeNull();
  });

  it('getGameSchema returns null when response has no game field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }));
    const adapter = new SteamAdapter('fake-api-key');
    const schema = await adapter.getGameSchema(10);
    expect(schema).toBeNull();
  });

  // --- getOwnedGames error handling ---

  it('getOwnedGames returns empty array on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    const adapter = new SteamAdapter('fake-api-key');
    const games = await adapter.getOwnedGames('76561197960287930');
    expect(games).toEqual([]);
  });

  // --- getGameDetails ---

  it('getGameDetails returns images on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        440: {
          success: true,
          data: {
            header_image: 'https://cdn.steam/header.jpg',
            library_assets: { library_hero: 'https://cdn.steam/hero.jpg' },
            capsule_image: 'https://cdn.steam/capsule.jpg',
            screenshots: [{ path_full: 'https://cdn.steam/ss1.jpg' }, { path_full: 'https://cdn.steam/ss2.jpg' }],
          },
        },
      }),
    }));
    const adapter = new SteamAdapter('fake-api-key');
    const details = await adapter.getGameDetails(440);
    expect(details).not.toBeNull();
    expect(details!.headerImage).toBe('https://cdn.steam/header.jpg');
    expect(details!.capsuleImage).toBe('https://cdn.steam/capsule.jpg');
    expect(details!.screenshots).toHaveLength(2);
  });

  it('getGameDetails returns null when game not found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ 99999: { success: false } }),
    }));
    const adapter = new SteamAdapter('fake-api-key');
    const details = await adapter.getGameDetails(99999);
    expect(details).toBeNull();
  });

  it('getGameDetails returns null on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    const adapter = new SteamAdapter('fake-api-key');
    const details = await adapter.getGameDetails(440);
    expect(details).toBeNull();
  });

  it('getGameDetails handles missing screenshots gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        440: {
          success: true,
          data: {
            header_image: 'https://cdn.steam/header.jpg',
          },
        },
      }),
    }));
    const adapter = new SteamAdapter('fake-api-key');
    const details = await adapter.getGameDetails(440);
    expect(details!.screenshots).toEqual([]);
    expect(details!.libraryAsset).toBeUndefined();
  });

  // --- createSteamAdapter ---

  it('createSteamAdapter throws when no API key provided', async () => {
    await expect(createSteamAdapter()).rejects.toThrow(/Steam API key/);
  });

  it('createSteamAdapter returns adapter when key provided', async () => {
    const adapter = await createSteamAdapter('my-key');
    expect(adapter).toBeInstanceOf(SteamAdapter);
  });
});
