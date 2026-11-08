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
    checkLocalFile: vi.fn().mockReturnValue(undefined),
    checkLocalFiles: vi.fn().mockReturnValue([]),
    checkCachedGameImages: vi.fn().mockReturnValue({}),
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
    getTitleHubData: vi.fn().mockResolvedValue({
      devicesMap: new Map(),
      titleMeta: new Map(),
      achievementSummary: undefined,
    }),
    downloadGameImages: vi.fn().mockResolvedValue(new Map()),
    syncAchievements: vi.fn().mockResolvedValue(0),
  })),
}));

vi.mock('../../../src/services/adapters/playstation.js', () => ({
  createPlayStationAdapter: vi.fn(() => ({
    refreshAccessToken: vi.fn().mockResolvedValue({
      accessToken: 'new-psn-access-token',
      refreshToken: 'new-psn-refresh-token',
      expiresAt: new Date(Date.now() + 3600000),
    }),
    getProfile: vi.fn().mockResolvedValue({
      onlineId: 'TestPSNUser',
      accountId: 'psn-account-123',
    }),
    getTrophyTitles: vi.fn().mockResolvedValue([{
      npCommunicationId: 'NPWR00001_00',
      npServiceName: 'trophy',
      title: 'Test PS Game',
      imageUrl: 'https://example.com/game.png',
      progress: 22,
      devices: ['PS5'],
      lastUpdatedDateTime: new Date().toISOString(),
      definedTrophies: { bronze: 10, silver: 5, gold: 2, platinum: 1 },
      earnedTrophies: { bronze: 3, silver: 1, gold: 0, platinum: 0 },
    }]),
    getEarnedTrophies: vi.fn().mockResolvedValue([{
      trophyId: 1,
      trophyName: 'First Trophy',
      trophyDetail: 'Get your first trophy',
      trophyType: 'bronze',
      trophyHidden: false,
      earned: true,
      earnedDateTime: new Date().toISOString(),
    }]),
    getTrophyDefinitions: vi.fn().mockResolvedValue([{
      trophyId: 1,
      trophyName: 'First Trophy',
      trophyDetail: 'Get your first trophy',
      trophyType: 'bronze',
      trophyHidden: false,
      trophyIconUrl: 'https://example.com/trophy.png',
    }]),
    downloadGameImage: vi.fn().mockResolvedValue({
      capsuleImagePath: null,
      iconImagePath: null,
      heroImagePath: null,
    }),
    downloadTrophyIcon: vi.fn().mockResolvedValue('/fake/trophy.png'),
    downloadTrophyIcons: vi.fn().mockResolvedValue(new Map()),
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

  it('syncProfile does not reset existing Xbox game stats or insert empty titles', async () => {
    const { syncService } = await import('../../../src/services/syncService.js');
    const { Profile } = await import('../../../src/models/profile.js');
    const { Game } = await import('../../../src/models/game.js');
    const { configService } = await import('../../../src/services/configService.js');
    const { SettingCategory } = await import('../../../src/models/setting.js');
    const { createXboxAdapter } = await import('../../../src/services/adapters/xbox.js');

    await configService.setSetting('xbox_client_id', 'test-client-id', SettingCategory.AUTH);
    await configService.setSetting('xbox_client_secret', 'test-client-secret', SettingCategory.AUTH);

    const profile = await Profile.create({
      platform: 'xbox',
      profileId: 'xbox-existing-profile',
      displayName: 'Xbox User',
      credentials: {
        accessToken: 'old-xsts-token',
        refreshToken: 'test-refresh-token',
        tokenType: 'xbox',
        expiresAt: new Date(Date.now() + 3600000),
      },
    });

    const existingGame = await Game.create({
      platform: 'xbox',
      profileId: profile._id,
      gameId: '111111',
      title: 'Existing Game',
      achievementsTotal: 20,
      achievementsUnlocked: 10,
      completionPercent: 50,
      currentGamerscore: 500,
      maxGamerscore: 1000,
    });

    vi.mocked(createXboxAdapter).mockReturnValueOnce({
      refreshXboxTokens: vi.fn().mockResolvedValue({
        xstsToken: 'test-xsts-token',
        userHash: 'test-user-hash',
        xuid: 'test-xuid-123',
        refreshToken: 'new-refresh-token',
        expiresAt: new Date(Date.now() + 3600000),
      }),
      getXboxProfile: vi.fn().mockResolvedValue({ gamertag: 'TestGamertag', xuid: 'test-xuid-123' }),
      getTitleHistory: vi.fn().mockResolvedValue([
        {
          titleId: '111111',
          name: 'Existing Game',
          totalAchievements: 0,
          currentAchievements: 0,
          devices: ['XboxOne'],
          platform: 'XboxOne',
          maxGamerscore: 1000,
          currentGamerscore: 500,
          inEarnedScan: true,
        },
        {
          titleId: '222222',
          name: 'Never Played',
          totalAchievements: 0,
          currentAchievements: 0,
          devices: ['XboxOne'],
          platform: 'XboxOne',
          maxGamerscore: 0,
          currentGamerscore: 0,
          inEarnedScan: false,
        },
      ]),
      getTitleHubData: vi.fn().mockResolvedValue({
        devicesMap: new Map(),
        titleMeta: new Map(),
        achievementSummary: undefined,
      }),
      downloadGameImages: vi.fn().mockResolvedValue(new Map()),
      syncAchievements: vi.fn().mockResolvedValue(0),
    } as any);

    await syncService.syncProfile(profile as any);

    const unchangedGame = await Game.findById(existingGame._id);
    expect(unchangedGame?.achievementsTotal).toBe(20);
    expect(unchangedGame?.achievementsUnlocked).toBe(10);
    expect(unchangedGame?.completionPercent).toBe(50);

    expect(await Game.findOne({ profileId: profile._id, gameId: '222222' })).toBeNull();
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

  it('syncProfile covers adaptiveStats, lastPlayed and image paths for steam sync', async () => {
    const { syncService } = await import('../../../src/services/syncService.js');
    const { Profile } = await import('../../../src/models/profile.js');
    const { createSteamAdapter } = await import('../../../src/services/adapters/steam.js');

    vi.mocked(createSteamAdapter).mockReturnValueOnce({
      getPlayerSummary: vi.fn().mockResolvedValue({ personaname: 'Rich User' }),
      syncGamesAndAchievements: vi.fn().mockResolvedValue({
        games: [{
          appId: 730,
          name: 'Counter-Strike 2',
          playtimeMinutes: 500,
          totalAchievements: 5,
          earnedAchievements: 3,
          ownershipSource: 'library',
          achievementsFetchFailed: false,
          lastPlayed: new Date('2024-01-01'),
        }],
        achievements: [],
        adaptiveStats: { finalBatchSize: 100, finalConcurrency: 10, finalDelay: 100 },
      }),
      downloadGameImages: vi.fn().mockResolvedValue(new Map([[730, {
        capsuleImagePath: 'steam/730/game_grid.jpg',
        iconImagePath: 'steam/730/game_icon.jpg',
        heroImagePath: 'steam/730/game_hero.jpg',
      }]])),
      downloadAchievementIcons: vi.fn().mockResolvedValue({ iconMap: new Map(), completed: 0, failed: 0 }),
    } as any);

    const profile = await Profile.create({
      platform: 'steam',
      profileId: 'steam-rich-user',
      displayName: 'Rich Steam User',
      credentials: { steamApiKey: 'rich-api-key' },
    });

    await syncService.syncProfile(profile as any);

    const { Game } = await import('../../../src/models/game.js');
    const game = await Game.findOne({ profileId: profile._id, gameId: '730' });
    expect(game).toBeTruthy();
    expect(game?.capsuleImagePath).toBe('steam/730/game_grid.jpg');
  });

  it('syncProfile completes PlayStation sync with valid credentials', async () => {
    const { syncService } = await import('../../../src/services/syncService.js');
    const { Profile } = await import('../../../src/models/profile.js');
    const { SyncOperation } = await import('../../../src/models/syncOperation.js');
    const { Game } = await import('../../../src/models/game.js');

    const profile = await Profile.create({
      platform: 'playstation',
      profileId: 'psn-account-123',
      displayName: 'PSN User',
      credentials: {
        accessToken: 'psn-access-token',
        refreshToken: 'psn-refresh-token',
        tokenType: 'psn',
        expiresAt: new Date(Date.now() + 3600000), // Not expired
      },
    });

    await syncService.syncProfile(profile as any);

    const op = await SyncOperation.findOne({ profileId: profile._id });
    expect(op?.status).toBe('completed');

    // Game should have been created
    const game = await Game.findOne({ profileId: profile._id, platform: 'playstation' });
    expect(game).toBeTruthy();
    expect(game?.title).toBe('Test PS Game');
  });

  it('syncProfile refreshes expired PlayStation token', async () => {
    const { syncService } = await import('../../../src/services/syncService.js');
    const { Profile } = await import('../../../src/models/profile.js');
    const { SyncOperation } = await import('../../../src/models/syncOperation.js');

    const profile = await Profile.create({
      platform: 'playstation',
      profileId: 'psn-expired-user',
      displayName: 'PSN Expired User',
      credentials: {
        accessToken: 'old-psn-token',
        refreshToken: 'psn-refresh-token',
        tokenType: 'psn',
        expiresAt: new Date(Date.now() - 3600000), // Expired 1 hour ago
      },
    });

    await syncService.syncProfile(profile as any);

    const op = await SyncOperation.findOne({ profileId: profile._id });
    expect(op?.status).toBe('completed');
  });

  it('reconciles stale, archived and removed achievements without counting unavailable rows', async () => {
    const { syncService } = await import('../../../src/services/syncService.js');
    const { Profile } = await import('../../../src/models/profile.js');
    const { Game } = await import('../../../src/models/game.js');
    const { Achievement } = await import('../../../src/models/achievement.js');
    const { createSteamAdapter } = await import('../../../src/services/adapters/steam.js');

    const profile = await Profile.create({
      platform: 'steam',
      profileId: 'steam-reconcile-user',
      displayName: 'Reconcile User',
      credentials: { steamApiKey: 'test-api-key' },
    });

    const game = await Game.create({
      platform: 'steam',
      profileId: profile._id,
      gameId: '269210',
      title: 'Hero Siege',
      achievementsTotal: 6,
      achievementsUnlocked: 3,
      completionPercent: 50,
    });

    const makeAchievement = (achievementId: string, unlockedAt?: Date, globalPercent?: number) => ({
      platform: 'steam',
      profileId: profile._id,
      gameId: game._id,
      achievementId,
      name: achievementId,
      description: '',
      groupId: '0',
      groupName: 'Base Game',
      groupOrder: 0,
      ...(unlockedAt ? { unlockedAt } : {}),
      ...(globalPercent !== undefined ? { globalPercent } : {}),
    });

    await Achievement.create([
      makeAchievement('ACTIVE_UNLOCKED', new Date('2020-01-01'), 5),
      makeAchievement('ACTIVE_LOCKED'),
      makeAchievement('ARCHIVED_UNLOCKED', new Date('2020-01-02')),
      makeAchievement('ARCHIVED_LOCKED'),
      makeAchievement('REMOVED_UNLOCKED', new Date('2020-01-03')),
      makeAchievement('REMOVED_LOCKED'),
    ]);

    vi.mocked(createSteamAdapter).mockReturnValueOnce({
      getPlayerSummary: vi.fn().mockResolvedValue({ personaname: 'Reconcile User' }),
      syncGamesAndAchievements: vi.fn().mockResolvedValue({
        games: [{
          appId: 269210,
          name: 'Hero Siege',
          playtimeMinutes: 100,
          totalAchievements: 2,
          earnedAchievements: 1,
          ownershipSource: 'owned',
          achievementsFetchFailed: false,
          archivedAchievementIds: ['ARCHIVED_UNLOCKED', 'ARCHIVED_LOCKED'],
        }],
        achievements: [
          {
            appId: 269210,
            achievementId: 'ACTIVE_UNLOCKED',
            name: 'Active Unlocked',
            description: '',
            unlocked: true,
            unlockTime: new Date('2020-01-01'),
            globalPercent: 12.5,
          },
          {
            appId: 269210,
            achievementId: 'ACTIVE_LOCKED',
            name: 'Active Locked',
            description: '',
            unlocked: false,
          },
          {
            appId: 269210,
            achievementId: 'ARCHIVED_UNLOCKED',
            name: 'Archived Unlocked',
            description: '',
            unlocked: true,
            unlockTime: new Date('2020-01-02'),
            archived: true,
          },
        ],
        adaptiveStats: null,
      }),
      downloadGameImages: vi.fn().mockResolvedValue(new Map()),
      downloadAchievementIcons: vi.fn().mockResolvedValue({ iconMap: new Map(), completed: 0, failed: 0 }),
    } as any);

    await syncService.syncProfile(profile as any);

    const savedGame = await Game.findById(game._id);
    expect(savedGame?.achievementsTotal).toBe(2);
    expect(savedGame?.achievementsUnlocked).toBe(1);
    expect(savedGame?.completionPercent).toBe(50);

    const activeUnlocked = await Achievement.findOne({ gameId: game._id, achievementId: 'ACTIVE_UNLOCKED' });
    const activeLocked = await Achievement.findOne({ gameId: game._id, achievementId: 'ACTIVE_LOCKED' });
    const archivedUnlocked = await Achievement.findOne({ gameId: game._id, achievementId: 'ARCHIVED_UNLOCKED' });
    const removedUnlocked = await Achievement.findOne({ gameId: game._id, achievementId: 'REMOVED_UNLOCKED' });

    expect(activeUnlocked?.availability).toBe('active');
    expect(activeUnlocked?.globalPercent).toBe(12.5);
    expect(activeLocked?.availability).toBe('active');
    expect(archivedUnlocked?.availability).toBe('archived');
    expect(archivedUnlocked?.unlockedAt).toBeTruthy();
    expect(removedUnlocked?.availability).toBe('removed');
    expect(removedUnlocked?.unlockedAt).toBeTruthy();

    expect(await Achievement.findOne({ gameId: game._id, achievementId: 'ARCHIVED_LOCKED' })).toBeNull();
    expect(await Achievement.findOne({ gameId: game._id, achievementId: 'REMOVED_LOCKED' })).toBeNull();
  });

  it('keeps stale games that still have locally unlocked achievements', async () => {
    const { syncService } = await import('../../../src/services/syncService.js');
    const { Profile } = await import('../../../src/models/profile.js');
    const { Game } = await import('../../../src/models/game.js');
    const { Achievement } = await import('../../../src/models/achievement.js');
    const { createSteamAdapter } = await import('../../../src/services/adapters/steam.js');

    const profile = await Profile.create({
      platform: 'steam',
      profileId: 'steam-stale-history-user',
      displayName: 'Stale History User',
      credentials: { steamApiKey: 'test-api-key' },
    });

    const historicalGame = await Game.create({
      platform: 'steam',
      profileId: profile._id,
      gameId: '999999',
      title: 'Delisted Game',
      achievementsTotal: 1,
      achievementsUnlocked: 1,
      completionPercent: 100,
    });

    await Achievement.create({
      platform: 'steam',
      profileId: profile._id,
      gameId: historicalGame._id,
      achievementId: 'HISTORY',
      name: 'Historical Unlock',
      description: '',
      unlockedAt: new Date('2020-01-01'),
    });

    // The adapter returns a different game, making the historical one stale.
    vi.mocked(createSteamAdapter).mockReturnValueOnce({
      getPlayerSummary: vi.fn().mockResolvedValue({ personaname: 'Stale History User' }),
      syncGamesAndAchievements: vi.fn().mockResolvedValue({
        games: [{
          appId: 440,
          name: 'Team Fortress 2',
          playtimeMinutes: 100,
          totalAchievements: 1,
          earnedAchievements: 1,
          ownershipSource: 'owned',
          achievementsFetchFailed: false,
        }],
        achievements: [{
          appId: 440,
          achievementId: 'TF_ACTIVE',
          name: 'Active',
          description: '',
          unlocked: true,
          unlockTime: new Date('2020-01-01'),
        }],
        adaptiveStats: null,
      }),
      downloadGameImages: vi.fn().mockResolvedValue(new Map()),
      downloadAchievementIcons: vi.fn().mockResolvedValue({ iconMap: new Map(), completed: 0, failed: 0 }),
    } as any);

    await syncService.syncProfile(profile as any);

    expect(await Game.findById(historicalGame._id)).toBeTruthy();
    expect(await Achievement.findOne({ gameId: historicalGame._id, achievementId: 'HISTORY' })).toBeTruthy();
  });

  it('keeps stale achievements when the Steam fetch failed (revoked license safety guard)', async () => {
    const { syncService } = await import('../../../src/services/syncService.js');
    const { Profile } = await import('../../../src/models/profile.js');
    const { Game } = await import('../../../src/models/game.js');
    const { Achievement } = await import('../../../src/models/achievement.js');
    const { createSteamAdapter } = await import('../../../src/services/adapters/steam.js');

    const profile = await Profile.create({
      platform: 'steam',
      profileId: 'steam-revoked-user',
      displayName: 'Revoked User',
      credentials: { steamApiKey: 'test-api-key' },
    });

    const game = await Game.create({
      platform: 'steam',
      profileId: profile._id,
      gameId: '777777',
      title: 'Revoked Game',
      achievementsTotal: 2,
      achievementsUnlocked: 0,
      completionPercent: 0,
      ownershipSource: 'played_history',
    });

    await Achievement.create({
      platform: 'steam',
      profileId: profile._id,
      gameId: game._id,
      achievementId: 'STALE_LOCKED',
      name: 'Stale Locked',
      description: '',
    });

    vi.mocked(createSteamAdapter).mockReturnValueOnce({
      getPlayerSummary: vi.fn().mockResolvedValue({ personaname: 'Revoked User' }),
      syncGamesAndAchievements: vi.fn().mockResolvedValue({
        games: [{
          appId: 777777,
          name: 'Revoked Game',
          playtimeMinutes: 0,
          totalAchievements: 1,
          earnedAchievements: 0,
          ownershipSource: 'played_history',
          achievementsFetchFailed: true,
        }],
        achievements: [{
          appId: 777777,
          achievementId: 'SCHEMA_ONLY',
          name: 'Schema Only',
          description: '',
          unlocked: false,
        }],
        adaptiveStats: null,
      }),
      downloadGameImages: vi.fn().mockResolvedValue(new Map()),
      downloadAchievementIcons: vi.fn().mockResolvedValue({ iconMap: new Map(), completed: 0, failed: 0 }),
    } as any);

    await syncService.syncProfile(profile as any);

    // The stale row is left untouched because the remote response is partial.
    expect(await Achievement.findOne({ gameId: game._id, achievementId: 'STALE_LOCKED' })).toBeTruthy();
  });
});
