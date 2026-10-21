import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Demo mode API', () => {
  let apiClient: any;

  beforeEach(async () => {
    vi.resetModules();
    delete (window as any).__DEMO_MOCK_INSTALLED__;
    delete (window as any).__DEMO_MODE__;
    (window as any).__DEMO_MODE__ = true;
    const mod = await import('../../services/apiClient');
    apiClient = new mod.ApiClient();
  });

  afterEach(() => {
    delete (window as any).__DEMO_MOCK_INSTALLED__;
    delete (window as any).__DEMO_MODE__;
  });

  it('serves profiles without hitting the network', async () => {
    const profiles = await apiClient.get('/profiles');
    expect(Array.isArray(profiles)).toBe(true);
    expect(profiles.length).toBeGreaterThan(0);
    expect(profiles[0]).toHaveProperty('platform');
    expect(profiles[0]).toHaveProperty('profileId');
    expect(profiles[0]).toHaveProperty('displayName');
  });

  it('returns games in the shape the frontend expects', async () => {
    const response = await apiClient.get(
      '/games?platform=steam&profileId=demo_steam_1&limit=100&offset=0'
    );
    expect(response.data).toBeInstanceOf(Array);
    expect(response.data.length).toBeGreaterThan(0);
    expect(response.pagination).toMatchObject({
      total: expect.any(Number),
      limit: 100,
      offset: 0,
      hasMore: expect.any(Boolean),
    });
    expect(response.pagination.total).toBe(response.data.length);
    expect(response.pagination.totalAchievementsUnlocked).toBeGreaterThan(0);
  });

  it('exposes the game fields the UI renders', async () => {
    const response = await apiClient.get('/games?platform=steam&profileId=demo_steam_1');
    const game = response.data[0];
    expect(game).toHaveProperty('achievementsTotal');
    expect(game).toHaveProperty('achievementsUnlocked');
    expect(game).toHaveProperty('completionPercent');
    expect(game).toHaveProperty('capsuleImagePath');
    expect(game).toHaveProperty('iconImagePath');
    expect(game).toHaveProperty('heroImagePath');
    expect(game).toHaveProperty('profileId');
    expect(game).toHaveProperty('gameId');
    expect(game).toHaveProperty('title');
  });

  it('paginates games', async () => {
    const first = await apiClient.get(
      '/games?platform=steam&profileId=demo_steam_1&limit=3&offset=0'
    );
    const second = await apiClient.get(
      '/games?platform=steam&profileId=demo_steam_1&limit=3&offset=3'
    );
    expect(first.data).toHaveLength(3);
    expect(first.pagination.hasMore).toBe(true);
    expect(second.data).toHaveLength(3);
    expect(second.pagination.offset).toBe(3);
    expect(first.data[0]._id).not.toBe(second.data[0]._id);
  });

  it('filters games by platform and search term', async () => {
    const xbox = await apiClient.get('/games?platform=xbox&profileId=demo_xbox_1');
    expect(xbox.data.every((g: any) => g.platform === 'xbox')).toBe(true);

    const search = await apiClient.get(
      '/games?platform=steam&profileId=demo_steam_1&search=celestial'
    );
    expect(search.data).toHaveLength(1);
    expect(search.data[0].title).toBe('Celestial Odyssey');
  });

  it('returns achievements as a plain array', async () => {
    const games = await apiClient.get('/games?platform=steam&profileId=demo_steam_1');
    const game = games.data[0];
    const achievements = await apiClient.get(`/achievements?gameId=${game._id}`);
    expect(Array.isArray(achievements)).toBe(true);
    expect(achievements.length).toBe(game.achievementsTotal);
    expect(achievements[0]).toHaveProperty('achievementId');
    expect(achievements[0]).toHaveProperty('name');
    expect(achievements[0]).toHaveProperty('unlockedAt');
    expect(achievements[0]).toHaveProperty('iconPath');
  });

  it('returns a single game by id', async () => {
    const games = await apiClient.get('/games?platform=steam&profileId=demo_steam_1');
    const game = await apiClient.get(`/games/${games.data[0]._id}`);
    expect(game._id).toBe(games.data[0]._id);
    expect(game.title).toBe(games.data[0].title);
  });

  it('returns 404 for an unknown game', async () => {
    await expect(apiClient.get('/games/does-not-exist')).rejects.toThrow('API error');
  });

  it('returns the sync status for a profile', async () => {
    const status = await apiClient.get('/sync/status?profileId=demo_steam_1');
    expect(status.current).toBeDefined();
    expect(status.current.status).toBe('completed');
    expect(status.current.progress).toBe(100);
  });

  it('returns the backup status', async () => {
    const status = await apiClient.get('/backup/status');
    expect(status.backup).toBeDefined();
    expect(status.restore).toBeDefined();
  });

  it('returns settings', async () => {
    const { settings } = await apiClient.getAllSettings();
    expect(Array.isArray(settings)).toBe(true);
  });

  it('simulates mutations instead of failing', async () => {
    await expect(apiClient.post('/sync/steam?profileId=demo_steam_1', {})).resolves.toBeDefined();
    await expect(apiClient.delete('/profiles/demo_steam_1')).resolves.toBeUndefined();
  });
});
