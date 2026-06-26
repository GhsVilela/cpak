import { Profile, IProfile } from '../models/profile.js';
import { Game } from '../models/game.js';
import { Achievement } from '../models/achievement.js';
import { SyncRun } from '../models/syncRun.js';
import { SyncOperation } from '../models/syncOperation.js';
import { createSteamAdapter } from './adapters/steam.js';
import { createSteamGridDBAdapter } from './adapters/steamgriddb.js';
import { createXboxAdapter } from './adapters/xbox.js';
import { createPlayStationAdapter } from './adapters/playstation.js';
import { logger } from '../utils/logger.js';
import { configService } from './configService.js';
import { SYNC_DEFAULTS } from './syncDefaults.js';
import { performanceMonitor } from './performanceMonitor.js';
import { markSyncAsCompleted } from './syncCancellation.js';

class SyncService {
  async syncProfile(profile: IProfile): Promise<void> {
    const startTime = new Date();
    logger.info({ platform: profile.platform, profileId: profile.profileId }, 'Starting sync');

    // T030: Create SyncOperation record at sync start
    const syncOperation = await SyncOperation.create({
      profileId: profile._id,
      platform: profile.platform as 'steam' | 'xbox' | 'playstation',
      status: 'running',
      startedAt: startTime,
      totalGames: 0,
      gamesProcessed: 0,
      gamesFailed: 0,
      totalAchievements: 0,
      achievementsSynced: 0,
      iconDownloadsPending: 0,
      iconDownloadsCompleted: 0,
      iconDownloadsFailed: 0,
      errors: [],
      adaptiveParams: {
        batchSize: SYNC_DEFAULTS.BATCH_SIZE,
        concurrency: SYNC_DEFAULTS.CONCURRENCY,
        delay: SYNC_DEFAULTS.DELAY,
      },
    });

    logger.info({ syncOperationId: syncOperation._id }, 'SyncOperation created');

    try {
      if (profile.platform === 'steam') {
        await this.syncSteam(profile, syncOperation);
      } else if (profile.platform === 'xbox') {
        await this.syncXbox(profile, syncOperation);
      } else if (profile.platform === 'playstation') {
        await this.syncPlayStation(profile, syncOperation);
      }

      // Ensure progress reaches 100% and save to database for UI to display
      // This is important when icons download instantly (files already exist locally)
      if (syncOperation.iconDownloadsPending > 0) {
        syncOperation.iconDownloadsCompleted = syncOperation.iconDownloadsPending;
      }
      await syncOperation.save();
      
      logger.info({
        syncOperationId: syncOperation._id,
        totalGames: syncOperation.totalGames,
        totalAchievements: syncOperation.totalAchievements,
        iconDownloadsCompleted: syncOperation.iconDownloadsCompleted,
      }, 'Sync completed successfully - showing 100% to user');

      // Allow users to see 100% completion in UI before status changes
      await new Promise(resolve => setTimeout(resolve, 2000));

      // T033: Mark SyncOperation as completed with final statistics
      syncOperation.status = 'completed';
      syncOperation.completedAt = new Date();
      await syncOperation.save();

      // Record successful sync
      await SyncRun.create({
        profileId: profile._id,
        platform: profile.platform,
        startedAt: startTime,
        completedAt: new Date(),
        status: 'success',
      });

      logger.info({ 
        platform: profile.platform, 
        profileId: profile.profileId,
        syncOperationId: syncOperation._id,
      }, 'Sync completed');
      
      // Clean up cancellation tracking
      markSyncAsCompleted(syncOperation._id.toString());
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error({ 
        error: errorMessage,
        stack: errorStack,
        platform: profile.platform, 
        profileId: profile.profileId,
        syncOperationId: syncOperation._id,
      }, 'Sync failed');

      // T033: Mark SyncOperation as failed
      syncOperation.status = 'failed';
      syncOperation.completedAt = new Date();
      await syncOperation.save();

      // Record failed sync
      await SyncRun.create({
        profileId: profile._id,
        platform: profile.platform,
        startedAt: startTime,
        completedAt: new Date(),
        status: 'failed',
        error: errorMessage,
      });

      // Clean up cancellation tracking
      markSyncAsCompleted(syncOperation._id.toString());

      throw error;
    }
  }

  private async syncSteam(profile: IProfile, syncOperation: any): Promise<void> {
    // Get decrypted credentials
    const credentials = profile.getDecryptedCredentials();
    
    // Use profile-specific Steam API key if available, otherwise fall back to config
    const apiKey = credentials?.steamApiKey || undefined;
    const steamAdapter = await createSteamAdapter(apiKey);
    
    // Fetch and update display name from Steam API (source of truth)
    try {
      const playerSummary = await performanceMonitor.measureApiCall(
        'steam.getPlayerSummary',
        async () => steamAdapter.getPlayerSummary(profile.profileId)
      );
      if (playerSummary?.personaname && playerSummary.personaname !== profile.displayName) {
        profile.displayName = playerSummary.personaname;
        await Profile.findByIdAndUpdate(profile._id, { displayName: playerSummary.personaname });
        logger.info({ profileId: profile.profileId, displayName: playerSummary.personaname }, 'Updated profile display name from Steam');
      }
    } catch (error) {
      logger.warn({ error, profileId: profile.profileId }, 'Failed to fetch Steam display name');
    }

    // Scrape achievement showcase count from Steam community profile page
    try {
      const showcaseCount = await steamAdapter.getProfileShowcaseAchievements(profile.profileId);
      await Profile.findByIdAndUpdate(profile._id, { steamShowcaseAchievements: showcaseCount });
      if (showcaseCount != null) {
        logger.info({ profileId: profile.profileId, showcaseCount }, 'Updated Steam showcase achievement count');
      }
    } catch (error) {
      logger.warn({ error, profileId: profile.profileId }, 'Failed to scrape Steam achievement showcase');
    }

    // Fetch previously-synced game IDs so family-shared / removed games aren't lost
    const previousGames = await Game.find(
      { profileId: profile._id, platform: 'steam' },
      { gameId: 1 }
    ).lean();
    const knownGameIds = previousGames.map((g) => parseInt(g.gameId, 10)).filter((id) => !isNaN(id));

    const result = await steamAdapter.syncGamesAndAchievements(profile.profileId, syncOperation, knownGameIds);

    // T031: Update SyncOperation with final counts
    syncOperation.totalGames = result.games.length;
    syncOperation.totalAchievements = result.achievements.length;
    syncOperation.iconDownloadsPending = result.achievements.length * 2; // icon + iconGray
    
    // T032: Update adaptive parameters from steam adapter
    if (result.adaptiveStats) {
      syncOperation.adaptiveParams = {
        batchSize: result.adaptiveStats.finalBatchSize,
        concurrency: result.adaptiveStats.finalConcurrency,
        delay: result.adaptiveStats.finalDelay,
      };
    }
    await syncOperation.save();

    logger.info({
      syncOperationId: syncOperation._id,
      totalGames: result.games.length,
      totalAchievements: result.achievements.length,
      adaptiveParams: syncOperation.adaptiveParams,
    }, 'Sync data fetched, beginning database updates');

    // Download game images (adaptive concurrency inside steam adapter)
    const steamGridDBAdapter = await createSteamGridDBAdapter();
    const gameImageMap = await steamAdapter.downloadGameImages(result.games, syncOperation, steamGridDBAdapter);

    // Upsert games with downloaded images (with performance monitoring)
    await performanceMonitor.measureDbQuery(
      'syncService.upsertGames',
      async () => {
        return Promise.all(
          result.games.map((game) => {
            const updateData: any = {
              platform: 'steam',
              title: game.name,
              achievementsTotal: game.totalAchievements,
              achievementsUnlocked: game.earnedAchievements,
              completionPercent:
                game.totalAchievements > 0
                  ? Math.round((game.earnedAchievements / game.totalAchievements) * 100)
                  : 0,
              playTimeMinutes: game.playtimeMinutes,
              ownershipSource: game.ownershipSource,
              achievementsFetchFailed: game.achievementsFetchFailed || false,
              lastSyncedAt: new Date(),
            };

            if (game.lastPlayed) {
              updateData.lastPlayed = game.lastPlayed;
            }

            // Only update imagePath if we successfully downloaded an image
            const imagePath = gameImageMap.get(game.appId);
            if (imagePath) {
              updateData.imagePath = imagePath;
            }

            return Game.findOneAndUpdate(
              { profileId: profile._id, gameId: game.appId.toString() },
              { $set: updateData },
              { upsert: true, new: true }
            ).catch((error) => {
              // T034: Capture game-level errors
              const errorMessage = error instanceof Error ? error.message : String(error);
              syncOperation.syncErrors.push({
                gameId: game.appId.toString(),
                message: `Failed to upsert game: ${errorMessage}`,
                timestamp: new Date(),
              });
              syncOperation.gamesFailed++;
              logger.error({ error, gameId: game.appId }, 'Failed to upsert game');
              return null;
            });
          })
        );
      }
    );

    logger.info({
      syncOperationId: syncOperation._id,
      gamesProcessed: result.games.length,
    }, 'Games upserted to database');

    // Download achievement icons (adaptive concurrency inside steam adapter)
    const { iconMap: achievementIconMap, completed, failed } = await steamAdapter.downloadAchievementIcons(
      result.achievements, syncOperation,
    );
    syncOperation.iconDownloadsCompleted = completed;
    syncOperation.iconDownloadsFailed = failed;
    await syncOperation.save();

    // PERFORMANCE FIX: Pre-fetch all games into a Map to avoid 26k+ sequential queries
    logger.info({ syncOperationId: syncOperation._id }, 'Pre-fetching all games for achievement upsert');
    
    let gameIdToMongoId: Map<string, any>;
    try {
      const allGames = await performanceMonitor.measureDbQuery(
        'syncService.fetchAllGames',
        async () => Game.find({ profileId: profile._id }).select('_id gameId').lean()
      );
      
      // Create gameId -> _id mapping
      gameIdToMongoId = new Map<string, any>();
      for (const game of allGames) {
        gameIdToMongoId.set(game.gameId, game._id);
      }
      
      logger.info({ 
        gamesLoaded: allGames.length,
        syncOperationId: syncOperation._id,
      }, 'Games pre-fetched successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ 
        error: errorMessage,
        syncOperationId: syncOperation._id,
      }, 'Failed to pre-fetch games for achievement upsert');
      
      syncOperation.syncErrors.push({
        gameId: 'prefetch',
        message: `Failed to pre-fetch games: ${errorMessage}`,
        timestamp: new Date(),
      });
      syncOperation.status = 'failed';
      await syncOperation.save();
      throw error;
    }

    // Upsert achievements in batches using bulkWrite for better performance
    logger.info({ 
      totalAchievements: result.achievements.length,
      syncOperationId: syncOperation._id,
    }, 'Starting achievement upsert with batched operations');
    
    let achievementsUpserted = 0;
    let achievementsSkipped = 0;
    let achievementErrors = 0;
    const batchSize = syncOperation.adaptiveParams.batchSize;
    
    try {
      for (let i = 0; i < result.achievements.length; i += batchSize) {
        const batch = result.achievements.slice(i, i + batchSize);
        
        // Build bulk write operations
        const bulkOps: any[] = [];
        
        for (const achievement of batch) {
          const gameMongoId = gameIdToMongoId.get(achievement.appId.toString());
          
          if (!gameMongoId) {
            achievementsSkipped++;
            logger.debug({ 
              appId: achievement.appId, 
              achievementId: achievement.achievementId 
            }, 'Skipping achievement - game not found');
            continue;
          }

          const icons = achievementIconMap.get(`${achievement.appId}:${achievement.achievementId}`);

          // Build update object, only including iconPath fields if they have values
          const updateFields: any = {
            platform: 'steam',
            profileId: profile._id,
            name: achievement.name,
            description: achievement.description,
            unlockedAt: achievement.unlocked ? achievement.unlockTime : undefined,
          };

          if (icons?.iconPath) {
            updateFields.iconPath = icons.iconPath;
          }

          if (icons?.iconGrayPath) {
            updateFields.iconGrayPath = icons.iconGrayPath;
          }

          bulkOps.push({
            updateOne: {
              filter: { 
                profileId: profile._id,
                gameId: gameMongoId, 
                achievementId: achievement.achievementId 
              },
              update: { $set: updateFields },
              upsert: true,
            },
          });
        }
        
        // Execute batch if we have operations
        if (bulkOps.length > 0) {
          try {
            await performanceMonitor.measureDbQuery(
              `syncService.bulkUpsertAchievements.batch${Math.floor(i / batchSize)}`,
              async () => Achievement.bulkWrite(bulkOps, { ordered: false })
            );
            
            achievementsUpserted += bulkOps.length;
            
            // T031: Update achievements synced count after each batch with atomic updates
            await SyncOperation.findByIdAndUpdate(syncOperation._id, {
              achievementsSynced: achievementsUpserted
            });
            
            // Update in-memory copy
            syncOperation.achievementsSynced = achievementsUpserted;
            
            logger.info({
              achievementsUpserted,
              achievementsSkipped,
              total: result.achievements.length,
              progress: `${Math.round((achievementsUpserted / result.achievements.length) * 100)}%`,
              syncOperationId: syncOperation._id,
            }, 'Achievement upsert progress');
          } catch (error) {
            achievementErrors++;
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error({ 
              error: errorMessage, 
              batchStart: i,
              batchSize: bulkOps.length,
              syncOperationId: syncOperation._id,
            }, 'Failed to upsert achievement batch');
            
            // T034: Track batch errors (avoid bloating syncOperation document)
            if (syncOperation.syncErrors.length < 100) { // Limit error array size
              syncOperation.syncErrors.push({
                gameId: 'batch',
                message: `Batch upsert failed at index ${i}: ${errorMessage}`,
                timestamp: new Date(),
              });
            }
          }
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ 
        error: errorMessage,
        achievementsUpserted,
        achievementsSkipped,
        achievementErrors,
        syncOperationId: syncOperation._id,
      }, 'Critical error during achievement upsert');
      
      syncOperation.syncErrors.push({
        gameId: 'upsert-phase',
        message: `Achievement upsert phase failed: ${errorMessage}`,
        timestamp: new Date(),
      });
      syncOperation.status = 'failed';
      await syncOperation.save();
      
      throw error;
    }

    // T031: Final update of achievements synced
    await syncOperation.save();

    logger.info({
      syncOperationId: syncOperation._id,
      achievementsSynced: achievementsUpserted,
      achievementsSkipped,
      achievementErrors,
      totalExpected: result.achievements.length,
      errors: syncOperation.syncErrors.length,
    }, 'Achievement upserts completed');
    
    // Clear large data structures to free memory
    achievementIconMap.clear();
    gameIdToMongoId.clear();
  }

  // -------------------------------------------------------------------------
  // Xbox sync (T014 / T016)
  // -------------------------------------------------------------------------

  private async syncXbox(profile: IProfile, syncOperation: any): Promise<void> {
    // -----------------------------------------------------------------------
    // Phase 1: Token refresh
    // Xbox XSTS tokens expire in ~24 h and we need userHash from the bundle.
    // Always refresh at the start of sync using the stored MSO refresh token.
    // -----------------------------------------------------------------------

    const clientId = await configService.getSetting('xbox_client_id');
    const clientSecret = await configService.getSetting('xbox_client_secret');

    if (!clientId || !clientSecret) {
      throw new Error('Xbox Client ID and Secret not configured. Please add them in Settings → Xbox.');
    }

    const credentials = profile.getDecryptedCredentials();
    if (!credentials?.refreshToken || credentials.tokenType !== 'xbox') {
      throw new Error('Profile is missing Xbox refresh token. Please re-authenticate in Settings.');
    }

    const adapter = createXboxAdapter(syncOperation.adaptiveParams.concurrency);

    logger.info({ profileId: profile.profileId }, 'Refreshing Xbox XSTS token before sync');

    const tokenBundle = await adapter.refreshXboxTokens(
      credentials.refreshToken,
      clientId,
      clientSecret,
    );

    // Persist refreshed token (encrypted by pre-save hook)
    await Profile.findByIdAndUpdate(profile._id, {
      'credentials.accessToken': tokenBundle.xstsToken,
      'credentials.refreshToken': tokenBundle.refreshToken ?? credentials.refreshToken,
      'credentials.expiresAt': tokenBundle.expiresAt,
    });

    const { xstsToken, userHash, xuid } = tokenBundle;

    // -----------------------------------------------------------------------
    // Phase 2: Update profile display name (gamertag)
    // -----------------------------------------------------------------------

    try {
      const xboxProfile = await adapter.getXboxProfile(xuid, xstsToken, userHash);
      if (xboxProfile.gamertag && xboxProfile.gamertag !== profile.displayName) {
        await Profile.findByIdAndUpdate(profile._id, { displayName: xboxProfile.gamertag });
        logger.info({ xuid, gamertag: xboxProfile.gamertag }, 'Updated Xbox profile display name');
      }
    } catch (error) {
      logger.warn({ error, xuid }, 'Failed to update Xbox profile display name');
    }

    // -----------------------------------------------------------------------
    // Phase 3: Game discovery
    // -----------------------------------------------------------------------

    const titles = await adapter.getTitleHistory(xuid, xstsToken, userHash);

    // Enrich devices from TitleHub — the only source that returns the full devices array,
    // which correctly classifies Play Anywhere games as both PC and XboxSeries.
    const titleHubDevicesMap = await adapter.getTitleHubDevices(xuid, xstsToken, userHash);
    for (const title of titles) {
      const hubDevices = titleHubDevicesMap.get(title.titleId);
      if (hubDevices && hubDevices.length > 0) {
        title.devices = hubDevices;
      }
    }

    const totalAchievements = titles.reduce((sum, t) => sum + t.totalAchievements, 0);

    const gamesWithAchievements = titles.filter((t) => t.inEarnedScan || t.currentAchievements > 0).length;

    syncOperation.totalGames = gamesWithAchievements;
    syncOperation.totalAchievements = totalAchievements;
    syncOperation.iconDownloadsPending = totalAchievements; // one icon per achievement
    await syncOperation.save();

    logger.info(
      { syncOperationId: syncOperation._id, totalGames: gamesWithAchievements, totalTitles: titles.length, totalAchievements },
      'Xbox title history fetched',
    );

    // -----------------------------------------------------------------------
    // Phase 4: Game image downloads (adaptive concurrency inside xbox adapter)
    // -----------------------------------------------------------------------

    const steamGridDBAdapter = await createSteamGridDBAdapter();
    const gameImageMap = await adapter.downloadGameImages(titles, syncOperation, steamGridDBAdapter);

    // Upsert games
    await performanceMonitor.measureDbQuery(
      'syncService.upsertXboxGames',
      async () => Promise.all(
      titles.map((title) => {
        const completionPercent =
          title.totalAchievements > 0
            ? Math.round((title.currentAchievements / title.totalAchievements) * 100)
            : 0;

        // Strip C0/C1 control characters (e.g. U+009E in "Rush: A Disney\u009EPixar Adventure")
        // while preserving all printable characters including ™ (U+2122).
        const cleanTitle = title.name
          .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, '')
          .replace(/\s{2,}/g, ' ')
          .trim();

        const updateData: any = {
          platform: 'xbox',
          title: cleanTitle,
          achievementsTotal: title.totalAchievements,
          achievementsUnlocked: title.currentAchievements,
          completionPercent,
          devices: title.devices,
          currentGamerscore: title.currentGamerscore ?? 0,
          maxGamerscore: title.maxGamerscore ?? 0,
          ...(title.lastPlayed !== undefined && { lastPlayed: new Date(title.lastPlayed) }),
          lastSyncedAt: new Date(),
        };

        const imagePath = gameImageMap.get(title.titleId);
        if (imagePath) updateData.imagePath = imagePath;

        return Game.findOneAndUpdate(
          { profileId: profile._id, platform: 'xbox', gameId: title.titleId },
          { $set: updateData },
          { upsert: true, new: true },
        ).catch((error) => {
          logger.error({ error, titleId: title.titleId }, 'Failed to upsert Xbox game');
          syncOperation.gamesFailed++;
        });
      }),
    ));

    syncOperation.gamesProcessed = titles.length;
    await syncOperation.save();

    logger.info({ syncOperationId: syncOperation._id, gamesUpserted: titles.length, gamesWithAchievements }, 'Xbox games upserted');

    // -----------------------------------------------------------------------
    // Phase 5: Achievement sync (adaptive batch/throttle/concurrency inside xbox adapter)
    // -----------------------------------------------------------------------

    const allGames = await Game.find({ profileId: profile._id, platform: 'xbox' })
      .select('_id gameId')
      .lean();
    const gameIdToMongoId = new Map(allGames.map((g) => [g.gameId, g._id]));

    const achievementsSynced = await adapter.syncAchievements(
      titles, xuid, xstsToken, userHash, syncOperation, gameIdToMongoId,
    );

    syncOperation.achievementsSynced = achievementsSynced;
    await syncOperation.save();
  }

  // -------------------------------------------------------------------------
  // PlayStation sync
  // -------------------------------------------------------------------------

  private async syncPlayStation(profile: IProfile, syncOperation: any): Promise<void> {
    const adapter = createPlayStationAdapter();
    const creds = profile.getDecryptedCredentials();

    // -----------------------------------------------------------------------
    // Phase 1: Token management — refresh access token if expired
    // -----------------------------------------------------------------------
    let accessToken = creds.accessToken;
    const accountId = profile.profileId;

    if (!accessToken || !creds.refreshToken) {
      throw new Error('PlayStation profile missing credentials — re-authentication required');
    }

    const expiresAt = creds.expiresAt ? new Date(creds.expiresAt) : null;
    if (!expiresAt || expiresAt <= new Date()) {
      logger.info({ profileId: profile.profileId }, 'PSN access token expired, refreshing');
      try {
        const newTokens = await adapter.refreshAccessToken(creds.refreshToken);
        accessToken = newTokens.accessToken;
        // Update stored credentials
        await Profile.findByIdAndUpdate(profile._id, {
          $set: {
            'credentials.accessToken': newTokens.accessToken,
            'credentials.refreshToken': newTokens.refreshToken,
            'credentials.expiresAt': newTokens.expiresAt,
          },
        });
        logger.info({ profileId: profile.profileId }, 'PSN access token refreshed');
      } catch (err) {
        logger.error({ err, profileId: profile.profileId }, 'PSN token refresh failed — re-auth required');
        throw new Error('PlayStation authentication expired. Please re-authenticate by providing a new NPSSO token.');
      }
    }

    // -----------------------------------------------------------------------
    // Phase 2: Fetch trophy titles (games with ≥1 earned trophy)
    // -----------------------------------------------------------------------
    logger.info({ profileId: accountId }, 'Fetching PlayStation trophy titles');
    const titles = await adapter.getTrophyTitles(accessToken, 'me');

    syncOperation.totalGames = titles.length;
    syncOperation.iconDownloadsPending = 0;
    await syncOperation.save();

    logger.info({ profileId: accountId, totalGames: titles.length }, 'PlayStation trophy titles fetched');

    // -----------------------------------------------------------------------
    // Phase 3: Per-game trophy definitions + earned status + image download
    // -----------------------------------------------------------------------
    const steamGridDB = await createSteamGridDBAdapter();
    let totalAchievements = 0;
    let achievementsSynced = 0;

    for (const title of titles) {
      try {
        // Download game cover art (PlayStation CDN → SteamGridDB → PCGamingWiki → Wikipedia)
        const imagePath = await adapter.downloadGameImage(
          title.title,
          title.npCommunicationId,
          title.imageUrl,
          steamGridDB || undefined,
        );

        // Upsert game record
        const game = await Game.findOneAndUpdate(
          { profileId: profile._id, gameId: title.npCommunicationId, platform: 'playstation' },
          {
            $set: {
              platform: 'playstation',
              profileId: profile._id,
              gameId: title.npCommunicationId,
              title: title.title,
              achievementsTotal: title.definedTrophies.bronze + title.definedTrophies.silver + title.definedTrophies.gold + title.definedTrophies.platinum,
              achievementsUnlocked: title.earnedTrophies.bronze + title.earnedTrophies.silver + title.earnedTrophies.gold + title.earnedTrophies.platinum,
              completionPercent: title.progress,
              devices: title.devices,
              trophyBronze: title.earnedTrophies.bronze,
              trophySilver: title.earnedTrophies.silver,
              trophyGold: title.earnedTrophies.gold,
              trophyPlatinum: title.earnedTrophies.platinum,
              lastPlayed: title.lastUpdatedDateTime ? new Date(title.lastUpdatedDateTime) : undefined,
              ...(imagePath && { imagePath }),
              lastSyncedAt: new Date(),
            },
          },
          { upsert: true, new: true }
        );

        // Fetch trophy definitions and earned status
        const [definitions, earned] = await Promise.all([
          adapter.getTrophyDefinitions(accessToken, title.npCommunicationId, title.npServiceName),
          adapter.getEarnedTrophies(accessToken, 'me', title.npCommunicationId, title.npServiceName),
        ]);

        const earnedMap = new Map(earned.map((e) => [e.trophyId, e]));
        totalAchievements += definitions.length;
        syncOperation.iconDownloadsPending += definitions.length;

        // Upsert achievements (trophies)
        const bulkOps = await Promise.all(
          definitions.map(async (def) => {
            const earnStatus = earnedMap.get(def.trophyId);
            const iconPath = await adapter.downloadTrophyIcon(title.npCommunicationId, def.trophyId, def.iconUrl);

            return {
              updateOne: {
                filter: {
                  platform: 'playstation',
                  profileId: profile._id,
                  gameId: game._id,
                  achievementId: def.trophyId,
                },
                update: {
                  $set: {
                    platform: 'playstation' as const,
                    profileId: profile._id,
                    gameId: game._id,
                    achievementId: def.trophyId,
                    name: def.name,
                    description: def.description,
                    unlockedAt: earnStatus?.earned ? earnStatus.earnedDateTime : undefined,
                    iconPath: iconPath,
                    iconGrayPath: iconPath, // Same icon, frontend applies CSS grayscale for locked
                    trophyGrade: def.type,
                    isHidden: def.isHidden,
                  },
                },
                upsert: true,
              },
            };
          })
        );

        if (bulkOps.length > 0) {
          await Achievement.bulkWrite(bulkOps);
          achievementsSynced += bulkOps.length;
        }

        syncOperation.gamesProcessed++;
        syncOperation.achievementsSynced = achievementsSynced;
        syncOperation.iconDownloadsCompleted += definitions.length;
        await syncOperation.save();

        logger.debug({
          game: title.title,
          trophies: definitions.length,
        }, 'PlayStation game synced');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn({ err: message, game: title.title }, 'Failed to sync PlayStation game, skipping');
        syncOperation.gamesProcessed++;
        await syncOperation.save();
      }
    }

    syncOperation.totalAchievements = totalAchievements;
    syncOperation.achievementsSynced = achievementsSynced;
    await syncOperation.save();

    logger.info({
      profileId: accountId,
      totalGames: titles.length,
      totalAchievements,
      achievementsSynced,
    }, 'PlayStation sync completed');
  }
}

export const syncService = new SyncService();
