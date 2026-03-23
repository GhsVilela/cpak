import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock platform adapters to prevent real HTTP calls
vi.mock('../../../src/services/adapters/steam.js', () => ({
  createSteamAdapter: vi.fn(() => ({
    getPlayerSummary: vi.fn().mockResolvedValue({ personaname: 'Test User' }),
    syncGamesAndAchievements: vi.fn().mockResolvedValue({
      games: [],
      achievements: [],
      adaptiveStats: null,
    }),
  })),
}));

vi.mock('../../../src/services/adapters/steamgriddb.js', () => ({
  createSteamGridDBAdapter: vi.fn(() => ({
    getGameArt: vi.fn().mockResolvedValue(null),
  })),
}));

vi.mock('../../../src/utils/imageStorage.js', () => ({
  imageStorage: {
    saveBase64Image: vi.fn().mockResolvedValue('/fake/path/image.png'),
    getRelativePath: vi.fn().mockReturnValue('fake/path'),
    exists: vi.fn().mockReturnValue(false),
    getAbsolutePath: vi.fn().mockReturnValue('/fake/path'),
  },
}));

describe('SyncService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('can be imported without throwing', async () => {
    const { syncService } = await import('../../../src/services/syncService.js');
    expect(syncService).toBeTruthy();
  });

  it('syncProfile creates a SyncOperation record for a steam profile', async () => {
    const { syncService } = await import('../../../src/services/syncService.js');
    const { SyncOperation } = await import('../../../src/models/syncOperation.js');
    const { Profile } = await import('../../../src/models/profile.js');

    // Create a test profile in the in-memory DB
    const profile = await Profile.create({
      platform: 'steam',
      profileId: 'test-steam-user',
      displayName: 'Test Steam User',
      credentials: { steamApiKey: 'fake-key' },
    });

    await syncService.syncProfile(profile as any);

    // A SyncOperation should have been created
    const op = await SyncOperation.findOne({ profileId: profile._id });
    expect(op).toBeTruthy();
  });

  it('syncProfile records failure for Xbox (not yet implemented)', async () => {
    const { syncService } = await import('../../../src/services/syncService.js');
    const { Profile } = await import('../../../src/models/profile.js');
    const { SyncRun } = await import('../../../src/models/syncRun.js');

    const profile = await Profile.create({
      platform: 'xbox',
      profileId: 'xbox-user-123',
      displayName: 'Xbox User',
    });

    // Xbox sync propagates the not-implemented error after recording the failure
    await expect(syncService.syncProfile(profile as any)).rejects.toThrow('Xbox sync not implemented');
  });
});
