import { Profile, IProfile } from '../models/profile.js';
import { Game } from '../models/game.js';
import { Achievement } from '../models/achievement.js';
import { SyncRun } from '../models/syncRun.js';
import { SyncOperation } from '../models/syncOperation.js';
import { createSteamAdapter } from './adapters/steam.js';
import { createSteamGridDBAdapter } from './adapters/steamgriddb.js';
import { createXboxAdapter } from './adapters/xbox.js';
import { logger } from '../utils/logger.js';
import { imageStorage } from '../utils/imageStorage.js';
import pLimit from 'p-limit';
import { configService } from './configService.js';
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
      gamesCompleted: 0,
      gamesFailed: 0,
      totalAchievements: 0,
      achievementsSynced: 0,
      iconDownloadsPending: 0,
      iconDownloadsCompleted: 0,
      iconDownloadsFailed: 0,
      errors: [],
      adaptiveParams: {
        batchSize: parseInt(await configService.getSetting('sync_batch_size') || '30', 30),
        concurrency: parseInt(await configService.getSetting('sync_concurrency') || '15', 15),
        delay: 250, // Initial throttle delay
      },
    });

    logger.info({ syncOperationId: syncOperation._id }, 'SyncOperation created');

    try {
      if (profile.platform === 'steam') {
        await this.syncSteam(profile, syncOperation);
      } else if (profile.platform === 'xbox') {
        await this.syncXbox(profile, syncOperation);
      } else if (profile.platform === 'playstation') {
        logger.warn({ profileId: profile.profileId }, 'PlayStation sync not yet implemented');
        throw new Error('PlayStation sync not implemented');
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

    const result = await steamAdapter.syncGamesAndAchievements(profile.profileId, syncOperation);

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

    // Check if SteamGridDB API key is configured
    const steamGridDBAdapter = await createSteamGridDBAdapter();
    const hasSteamGridDB = steamGridDBAdapter !== null;
    
    // Get image download concurrency from settings (database > env > default)
    let imageConcurrency = 5; // default
    const concurrencySetting = await configService.getSetting('sync_concurrency');
    imageConcurrency = concurrencySetting ? parseInt(concurrencySetting, 10) : 5;

    // Create concurrency limiter for all image downloads (game covers and achievement icons)
    const limit = pLimit(imageConcurrency);

    // Download game images in parallel batches
    const gameImagePromises: Promise<{ appId: number; imagePath?: string }>[] = [];

    for (const game of result.games) {
      const promise = limit(async () => {
        let imagePath: string | undefined;

        // Priority 1: Check for existing local grid files first (avoid unnecessary downloads)
        imagePath = imageStorage.checkLocalFile('steam', game.appId.toString(), 'game', 'grid');
        if (imagePath) {
          logger.info({ appId: game.appId, imagePath }, 'Using existing local grid file');
          return { appId: game.appId, imagePath };
        }

        // Priority 2: Try direct Steam CDN library grid URL
        if (!imagePath) {
          try {
            const steamCdnUrl = `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appId}/library_600x900.jpg`;
            imagePath = await imageStorage.downloadAndStore(
              steamCdnUrl,
              'steam',
              game.appId.toString(),
              'game',
              'grid'
            );
            logger.info({ appId: game.appId }, 'Downloaded image from Steam CDN (library grid)');
          } catch (error) {
            logger.debug({ error, appId: game.appId }, 'Steam CDN library grid not available');
            // Check if file exists locally with different extension
            imagePath = imageStorage.checkLocalFile('steam', game.appId.toString(), 'game', 'grid');
            if (imagePath) {
              logger.debug({ appId: game.appId }, 'Using existing local file (grid)');
            }
          }
        }

        // Fallback 1: SteamGridDB (if API key configured)
        if (!imagePath && hasSteamGridDB) {
          try {
            imagePath = await steamGridDBAdapter.downloadGameImage(game.appId) || undefined;
            if (imagePath) {
              logger.info({ appId: game.appId }, 'Downloaded image from SteamGridDB');
            }
          } catch (error) {
            logger.warn({ error, appId: game.appId }, 'SteamGridDB download failed');
          }
        }

        // Fallback 2: Try Steam Store API for header or capsule image (only if no grid was found)
        if (!imagePath) {
          // Double-check if grid was downloaded before trying header/capsule fallbacks
          const gridExists = imageStorage.checkLocalFile('steam', game.appId.toString(), 'game', 'grid');
          if (gridExists) {
            logger.debug({ appId: game.appId }, 'Grid file found locally, skipping header/capsule fallback');
            imagePath = gridExists;
          } else {
            try {
              const gameDetails = await steamAdapter.getGameDetails(game.appId);
              
              // Try header image first
              if (gameDetails?.headerImage) {
                try {
                  imagePath = await imageStorage.downloadAndStore(
                    gameDetails.headerImage,
                    'steam',
                    game.appId.toString(),
                    'game',
                    'header'
                  );
                  logger.info({ appId: game.appId }, 'Downloaded header image from Steam Store API');
                } catch (error) {
                  logger.debug({ error, appId: game.appId }, 'Failed to download header image');
                }
              }
              
              // Try capsule image if header failed
              if (!imagePath && gameDetails?.capsuleImage) {
                try {
                  imagePath = await imageStorage.downloadAndStore(
                    gameDetails.capsuleImage,
                    'steam',
                    game.appId.toString(),
                    'game',
                    'capsule'
                  );
                  logger.info({ appId: game.appId }, 'Downloaded capsule image from Steam Store API');
                } catch (error) {
                  logger.debug({ error, appId: game.appId }, 'Failed to download capsule image');
                }
              }
            } catch (error) {
              logger.warn({ error, appId: game.appId }, 'Steam Store API failed');
            }
          }
        }

        // Fallback 3: Check for any other existing local files (header or capsule)
        if (!imagePath) {
          imagePath = imageStorage.checkLocalFile('steam', game.appId.toString(), 'game', 'header');
          if (imagePath) {
            logger.debug({ appId: game.appId }, 'Using existing local file (header)');
          } else {
            imagePath = imageStorage.checkLocalFile('steam', game.appId.toString(), 'game', 'capsule');
            if (imagePath) {
              logger.debug({ appId: game.appId }, 'Using existing local file (capsule)');
            }
          }
        }

        return { appId: game.appId, imagePath };
      });

      gameImagePromises.push(promise);
    }

    // Wait for ALL game image downloads to complete
    logger.info({ total: gameImagePromises.length, syncOperationId: syncOperation._id }, 'Starting game image downloads');
    
    const gameImageResults = await Promise.all(gameImagePromises);
    const gameImageMap = new Map(gameImageResults.map((r) => [r.appId, r.imagePath]));
    
    logger.info({ 
      total: gameImagePromises.length,
      syncOperationId: syncOperation._id,
    }, 'All game images downloaded');

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
              lastSyncedAt: new Date(),
            };

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

    // Group achievements by game and download icons in parallel
    const achievementsByGame = new Map<string, typeof result.achievements>();
    for (const achievement of result.achievements) {
      const gameId = achievement.appId.toString();
      if (!achievementsByGame.has(gameId)) {
        achievementsByGame.set(gameId, []);
      }
      achievementsByGame.get(gameId)!.push(achievement);
    }

    // Download achievement icons with concurrency limit (uses same limit as game images)
    const achievementIconPromises: Promise<{
      appId: number;
      achievementId: string;
      iconPath?: string;
      iconGrayPath?: string;
    }>[] = [];

    for (const achievement of result.achievements) {
      const promise = limit(async () => {
        const downloads: Promise<string | undefined>[] = [];

        if (achievement.icon) {
          downloads.push(
            imageStorage
              .downloadAndStore(
                achievement.icon,
                'steam',
                achievement.appId.toString(),
                achievement.achievementId,
                'icon'
              )
              .catch((error) => {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger.warn({ error: errorMessage, appId: achievement.appId, achievementId: achievement.achievementId }, 'Failed to download icon');
                // Check if file exists locally even if download failed
                const localPath = imageStorage.checkLocalFile('steam', achievement.appId.toString(), achievement.achievementId, 'icon');
                if (localPath) {
                  logger.debug({ achievementId: achievement.achievementId }, 'Using existing local file (icon)');
                }
                return localPath;
              })
          );
        } else {
          downloads.push(Promise.resolve(undefined));
        }

        if (achievement.iconGray) {
          downloads.push(
            imageStorage
              .downloadAndStore(
                achievement.iconGray,
                'steam',
                achievement.appId.toString(),
                achievement.achievementId,
                'iconGray'
              )
              .catch((error) => {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger.warn({ error: errorMessage, appId: achievement.appId, achievementId: achievement.achievementId }, 'Failed to download iconGray');
                // Check if file exists locally even if download failed
                const localPath = imageStorage.checkLocalFile('steam', achievement.appId.toString(), achievement.achievementId, 'iconGray');
                if (localPath) {
                  logger.debug({ achievementId: achievement.achievementId }, 'Using existing local file (iconGray)');
                }
                return localPath;
              })
          );
        } else {
          downloads.push(Promise.resolve(undefined));
        }

        const [iconPath, iconGrayPath] = await Promise.all(downloads);
        return {
          appId: achievement.appId,
          achievementId: achievement.achievementId,
          iconPath,
          iconGrayPath,
        };
      });

      achievementIconPromises.push(promise);
    }

    // Process all achievement icon downloads with progress logging
    logger.info({ total: achievementIconPromises.length, syncOperationId: syncOperation._id }, 'Starting achievement icon downloads');
    
    let completed = 0;
    let failed = 0;
    const progressPromises = achievementIconPromises.map(async (promise) => {
      try {
        const result = await promise;
        completed++;
        
        // T031: Update icon download progress - save every 50 icons for responsive UI feedback
        if (completed % 50 === 0 || completed === achievementIconPromises.length) {
          await SyncOperation.findByIdAndUpdate(syncOperation._id, {
            iconDownloadsCompleted: completed,
            iconDownloadsFailed: failed
          });
          logger.info({ 
            completed, 
            total: achievementIconPromises.length, 
            progress: `${Math.round((completed / achievementIconPromises.length) * 100)}%`,
            syncOperationId: syncOperation._id,
          }, 'Achievement icon download progress');
        }
        
        // Update in-memory copy for final stats
        syncOperation.iconDownloadsCompleted++;
        
        return result;
      } catch (error) {
        failed++;
        syncOperation.iconDownloadsFailed++;
        logger.warn({ error }, 'Achievement icon download failed');
        throw error;
      }
    });
    
    const achievementIconResults = await Promise.all(progressPromises.map(p => p.catch(e => null)));
    const achievementIconMap = new Map(
      achievementIconResults
        .filter((r): r is NonNullable<typeof r> => r !== null)
        .map((r) => [`${r.appId}:${r.achievementId}`, { iconPath: r.iconPath, iconGrayPath: r.iconGrayPath }])
    );

    // Final save of icon download stats (already saved via atomic updates above)
    syncOperation.iconDownloadsCompleted = completed;
    syncOperation.iconDownloadsFailed = failed;
    await syncOperation.save();

    logger.info(
      { 
        totalAchievements: result.achievements.length,
        iconMapSize: achievementIconMap.size,
        iconsCompleted: completed,
        iconsFailed: failed,
        syncOperationId: syncOperation._id
      }, 
      'Achievement icon download completed'
    );

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
    const batchSize = 500; // Process 500 achievements at a time (reduced for memory safety)
    
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
    const { isSyncCancelled } = await import('./syncCancellation.js');

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

    const adapter = createXboxAdapter();

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

    const totalAchievements = titles.reduce((sum, t) => sum + t.totalAchievements, 0);

    syncOperation.totalGames = titles.length;
    syncOperation.totalAchievements = totalAchievements;
    syncOperation.iconDownloadsPending = totalAchievements; // one icon per achievement
    await syncOperation.save();

    logger.info(
      { syncOperationId: syncOperation._id, totalGames: titles.length, totalAchievements },
      'Xbox title history fetched',
    );

    // -----------------------------------------------------------------------
    // Phase 4: Game image downloads
    // -----------------------------------------------------------------------

    const steamGridDBAdapter = await createSteamGridDBAdapter();
    const hasSteamGridDB = steamGridDBAdapter !== null;

    const concurrencySetting = await configService.getSetting('sync_concurrency');
    const imageConcurrency = concurrencySetting ? parseInt(concurrencySetting, 10) : 5;
    const limit = pLimit(imageConcurrency);

    const gameImagePromises = titles.map((title) =>
      limit(async () => {
        let imagePath: string | undefined;

        // Priority 1: Existing local cache
        imagePath = imageStorage.checkLocalFile('xbox', title.titleId, 'game', 'grid') || undefined;
        if (imagePath) return { titleId: title.titleId, imagePath };

        // Priority 2: Xbox CDN displayImage
        if (title.titleImageUrl) {
          try {
            imagePath = await imageStorage.downloadAndStore(
              title.titleImageUrl, 'xbox', title.titleId, 'game', 'grid',
            );
          } catch (error) {
            logger.debug({ error, titleId: title.titleId }, 'Xbox CDN image download failed');
          }
        }

        // Priority 3: SteamGridDB by name
        if (!imagePath && hasSteamGridDB) {
          try {
            imagePath = await steamGridDBAdapter!.downloadGameImageByName(
              title.name, 'xbox', title.titleId,
            ) || undefined;
          } catch (error) {
            logger.warn({ error, titleId: title.titleId }, 'SteamGridDB name lookup failed');
          }
        }

        return { titleId: title.titleId, imagePath };
      }),
    );

    const gameImageResults = await Promise.all(gameImagePromises);
    const gameImageMap = new Map(gameImageResults.map((r) => [r.titleId, r.imagePath]));

    // Upsert games
    await Promise.all(
      titles.map((title) => {
        const completionPercent =
          title.totalAchievements > 0
            ? Math.round((title.currentAchievements / title.totalAchievements) * 100)
            : 0;

        const updateData: any = {
          platform: 'xbox',
          title: title.name,
          achievementsTotal: title.totalAchievements,
          achievementsUnlocked: title.currentAchievements,
          completionPercent,
          devices: title.devices,
          lastSyncedAt: new Date(),
        };

        const imagePath = gameImageMap.get(title.titleId);
        if (imagePath) updateData.imagePath = imagePath;

        return Game.findOneAndUpdate(
          { profileId: profile._id, gameId: title.titleId },
          { $set: updateData },
          { upsert: true, new: true },
        ).catch((error) => {
          logger.error({ error, titleId: title.titleId }, 'Failed to upsert Xbox game');
          syncOperation.gamesFailed++;
        });
      }),
    );

    syncOperation.gamesCompleted = titles.length;
    await syncOperation.save();

    logger.info({ syncOperationId: syncOperation._id, gamesUpserted: titles.length }, 'Xbox games upserted');

    // -----------------------------------------------------------------------
    // Phase 5: Achievement sync
    // -----------------------------------------------------------------------

    // Pre-fetch all game IDs for achievement linking
    const allGames = await Game.find({ profileId: profile._id, platform: 'xbox' })
      .select('_id gameId')
      .lean();
    const gameIdToMongoId = new Map(allGames.map((g) => [g.gameId, g._id]));

    let achievementsSynced = 0;
    const iconLimit = pLimit(imageConcurrency);

    for (const title of titles) {
      // Cancellation check
      if (isSyncCancelled(syncOperation._id.toString())) {
        logger.info({ syncOperationId: syncOperation._id }, 'Xbox sync cancelled');
        break;
      }

      let achievements: Awaited<ReturnType<typeof adapter.getAchievements>>;
      try {
        achievements = await adapter.getAchievements(xuid, title.titleId, xstsToken, userHash);
      } catch (error) {
        logger.warn({ error, titleId: title.titleId }, 'Failed to fetch Xbox achievements, skipping game');
        continue;
      }

      if (achievements.length === 0) continue;

      const gameMongoId = gameIdToMongoId.get(title.titleId);
      if (!gameMongoId) {
        logger.warn({ titleId: title.titleId }, 'Xbox game not found after upsert, skipping achievements');
        continue;
      }

      // The title history API doesn't return totalAchievements, so we now know
      // the real total from getAchievements(). Patch the game record accordingly.
      const realTotal = achievements.length;
      const unlockedCount = achievements.filter((a) => a.unlockedAt != null).length;
      const realCompletionPercent = Math.round((unlockedCount / realTotal) * 100);
      await Game.findByIdAndUpdate(gameMongoId, {
        $set: {
          achievementsTotal: realTotal,
          achievementsUnlocked: unlockedCount,
          completionPercent: realCompletionPercent,
        },
      });

      // Accumulate into the sync operation for accurate progress display
      syncOperation.totalAchievements += realTotal;
      syncOperation.iconDownloadsPending += realTotal;
      await SyncOperation.findByIdAndUpdate(syncOperation._id, {
        totalAchievements: syncOperation.totalAchievements,
        iconDownloadsPending: syncOperation.iconDownloadsPending,
      });

      // Download achievement icons
      // Xbox provides one icon URL — same path used for both iconPath and iconGrayPath;
      // the UI applies CSS grayscale filter to render locked achievements in gray.
      const iconPromises = achievements.map((ach) =>
        iconLimit(async () => {
          let iconPath: string | undefined;
          if (ach.iconUrl) {
            try {
              iconPath = await imageStorage.downloadAndStore(
                ach.iconUrl, 'xbox', title.titleId, ach.achievementId, 'icon',
              );
            } catch {
              iconPath =
                imageStorage.checkLocalFile('xbox', title.titleId, ach.achievementId, 'icon') || undefined;
            }
          }

          syncOperation.iconDownloadsCompleted++;
          if (syncOperation.iconDownloadsCompleted % 50 === 0) {
            await SyncOperation.findByIdAndUpdate(syncOperation._id, {
              iconDownloadsCompleted: syncOperation.iconDownloadsCompleted,
            });
          }
          return { achievementId: ach.achievementId, iconPath };
        }),
      );

      const iconResults = await Promise.all(iconPromises.map((p) => p.catch(() => null)));
      const iconMap = new Map(
        iconResults.filter(Boolean).map((r) => [r!.achievementId, r!.iconPath]),
      );

      // Bulk upsert achievements for this title
      const bulkOps = achievements.map((ach) => {
        const iconPath = iconMap.get(ach.achievementId);
        const updateFields: any = {
          platform: 'xbox',
          profileId: profile._id,
          name: ach.name,
          description: ach.description,
          unlockedAt: ach.unlockedAt,
          isSecret: ach.isSecret,
        };
        if (iconPath) {
          updateFields.iconPath = iconPath;
          updateFields.iconGrayPath = iconPath; // same image, CSS grayscale handles locked state
        }
        return {
          updateOne: {
            filter: { profileId: profile._id, gameId: gameMongoId, achievementId: ach.achievementId },
            update: { $set: updateFields },
            upsert: true,
          },
        };
      });

      if (bulkOps.length > 0) {
        try {
          await Achievement.bulkWrite(bulkOps, { ordered: false });
          achievementsSynced += bulkOps.length;
          await SyncOperation.findByIdAndUpdate(syncOperation._id, { achievementsSynced });
          syncOperation.achievementsSynced = achievementsSynced;
        } catch (error) {
          logger.error({ error, titleId: title.titleId }, 'Failed to upsert Xbox achievements');
        }
      }
    }

    syncOperation.achievementsSynced = achievementsSynced;
    await syncOperation.save();

    logger.info(
      {
        syncOperationId: syncOperation._id,
        totalGames: titles.length,
        totalAchievements: syncOperation.totalAchievements,
        achievementsSynced,
      },
      'Xbox sync completed successfully',
    );
  }
}

export const syncService = new SyncService();
