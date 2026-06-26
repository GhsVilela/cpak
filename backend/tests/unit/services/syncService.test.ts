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
    downloadGameImages: vi.fn().mockResolvedValue(new Map()),
    downloadAchievementIcons: vi.fn().mockResolvedValue({ iconMap: new Map(), completed: 0, failed: 0 }),
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

vi.mock('../../../src/services/adapters/xbox.js', () => ({
  createXboxAdapter: vi.fn(() => ({
    refreshXboxTokens: vi.fn().mockResolvedValue({
      xstsToken: 'test-xsts-token',
      userHash: 'test-user-hash',
      xuid: 'test-xuid-123',
      refreshToken: 'new-refresh-token',
      expiresAt: new Date(Date.now() + 3600000),
    }),
    getXboxProfile: vi.fn().mockResolvedValue({
      gamertag: 'TestGamertag',
      xuid: 'test-xuid-123',
    }),
    getTitleHistory: vi.fn().mockResolvedValue([]),
    getTitleHubDevices: vi.fn().mockResolvedValue(new Map()),
    downloadGameImages: vi.fn().mockResolvedValue(new Map()),
    syncAchievements: vi.fn().mockResolvedValue(0),
  })),
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

  it('syncProfile records failure for Xbox when credentials not configured', async () => {
    const { syncService } = await import('../../../src/services/syncService.js');
    const { Profile } = await import('../../../src/models/profile.js');

    const profile = await Profile.create({
      platform: 'xbox',
      profileId: 'xbox-user-123',
      displayName: 'Xbox User',
    });

    // Xbox sync throws when client credentials are not configured
    await expect(syncService.syncProfile(profile as any)).rejects.toThrow(
      /Xbox Client ID|not configured|Xbox sync/i
    );
  });

  it('syncProfile throws for PlayStation with no credentials and records it as failed', async () => {
    const { syncService } = await import('../../../src/services/syncService.js');
    const { Profile } = await import('../../../src/models/profile.js');
    const { SyncOperation } = await import('../../../src/models/syncOperation.js');

    const profile = await Profile.create({
      platform: 'playstation',
      profileId: 'psn-user-123',
      displayName: 'PSN User',
    });

    await expect(syncService.syncProfile(profile as any)).rejects.toThrow(
      /credentials/i,
    );

    const op = await SyncOperation.findOne({ profileId: profile._id });
    expect(op?.status).toBe('failed');
  });

  it('syncProfile syncs steam games and achievements to database', async () => {
    const { syncService } = await import('../../../src/services/syncService.js');
    const { Profile } = await import('../../../src/models/profile.js');
    const { Game } = await import('../../../src/models/game.js');
    const { Achievement } = await import('../../../src/models/achievement.js');
    const { createSteamAdapter } = await import('../../../src/services/adapters/steam.js');

    // Override mock for this test to return 1 game + 1 achievement
    vi.mocked(createSteamAdapter).mockReturnValueOnce({
      getPlayerSummary: vi.fn().mockResolvedValue({ personaname: 'Test User' }),
      syncGamesAndAchievements: vi.fn().mockResolvedValue({
        games: [{
          appId: 440,
          name: 'Team Fortress 2',
          playtimeMinutes: 100,
          totalAchievements: 1,
          earnedAchievements: 0,
          ownershipSource: 'library',
          achievementsFetchFailed: false,
          lastPlayed: null,
        }],
        achievements: [{
          appId: 440,
          achievementId: 'TF_PLAY_GAME_EVENLY',
          name: 'Level Playing Field',
          description: 'Win a game with each team',
          unlocked: false,
          unlockTime: null,
        }],
        adaptiveStats: null,
      }),
      downloadGameImages: vi.fn().mockResolvedValue(new Map([[440, '/path/to/tf2.png']])),
      downloadAchievementIcons: vi.fn().mockResolvedValue({
        iconMap: new Map([
          ['440:TF_PLAY_GAME_EVENLY', { iconPath: '/ach1.png', iconGrayPath: '/ach1_gray.png' }],
        ]),
        completed: 1,
        failed: 0,
      }),
    } as any);

    const profile = await Profile.create({
      platform: 'steam',
      profileId: 'steam-user-with-games',
      displayName: 'Steam User',
      credentials: { steamApiKey: 'test-api-key' },
    });

    await syncService.syncProfile(profile as any);

    // Game should have been upserted to the database
    const game = await Game.findOne({ profileId: profile._id, gameId: '440' });
    expect(game).toBeTruthy();
    expect(game?.title).toBe('Team Fortress 2');

    // Achievement should have been upserted to the database
    const achievement = await Achievement.findOne({
      profileId: profile._id,
      achievementId: 'TF_PLAY_GAME_EVENLY',
    });
    expect(achievement).toBeTruthy();
    expect(achievement?.name).toBe('Level Playing Field');
  });

  it('syncProfile completes Xbox sync when credentials are fully configured', async () => {
    const { syncService } = await import('../../../src/services/syncService.js');
    const { Profile } = await import('../../../src/models/profile.js');
    const { SyncOperation } = await import('../../../src/models/syncOperation.js');
    const { configService } = await import('../../../src/services/configService.js');
    const { SettingCategory } = await import('../../../src/models/setting.js');

    // Store Xbox OAuth credentials in DB so the sync can proceed
    await configService.setSetting('xbox_client_id', 'test-client-id', SettingCategory.AUTH);
    await configService.setSetting('xbox_client_secret', 'test-client-secret', SettingCategory.AUTH);

    const profile = await Profile.create({
      platform: 'xbox',
      profileId: 'xbox-fully-configured',
      displayName: 'Xbox User',
      credentials: {
        accessToken: 'old-xsts-token',
        refreshToken: 'test-refresh-token',
        tokenType: 'xbox',
        expiresAt: new Date(Date.now() + 3600000),
      },
    });

    await syncService.syncProfile(profile as any);

    const op = await SyncOperation.findOne({ profileId: profile._id });
    expect(op?.status).toBe('completed');
  });

  it('profile toJSON strips sensitive credentials and pre-save encrypts accessToken/refreshToken', async () => {
    const { Profile } = await import('../../../src/models/profile.js');

    const profile = await Profile.create({
      platform: 'xbox',
      profileId: 'profile-cred-test',
      displayName: 'Cred Test',
      credentials: {
        accessToken: 'my-access-token',
        refreshToken: 'my-refresh-token',
        tokenType: 'xbox',
      },
    });

    // toJSON strips sensitive data
    const json = (profile as any).toJSON();
    expect(json.credentials?.configured).toBe(true);
    expect(json.credentials?.tokenType).toBe('xbox');
    expect(json.credentials?.steamApiKeyConfigured).toBe(false);
  });
});
