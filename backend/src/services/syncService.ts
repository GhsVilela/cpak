import { Profile, IProfile } from '../models/profile.js';
import { Game } from '../models/game.js';
import { Achievement } from '../models/achievement.js';
import { SyncRun } from '../models/syncRun.js';
import { SyncOperation } from '../models/syncOperation.js';
import { createSteamAdapter } from './adapters/steam.js';
import { createSteamGridDBAdapter } from './adapters/steamgriddb.js';
import { createXboxAdapter } from './adapters/xbox.js';
import { createPlayStationAdapter } from './adapters/playstation.js';
import type { PSNTrophyTitle, PSNTrophyDetail, PSNTrophyGroup, PSNEarnedTrophy } from './adapters/playstation.js';
import { backfillPlayStationGameImages } from './playstationImageBackfill.js';
import { logger } from '../utils/logger.js';
import { configService } from './configService.js';
import { SYNC_DEFAULTS } from './syncDefaults.js';
import { performanceMonitor } from './performanceMonitor.js';
import { markSyncAsCompleted, isSyncCancelled } from './syncCancellation.js';
import { SyncProgressTracker } from './syncProgress.js';
import { imageStorage } from '../utils/imageStorage.js';
import { isUnknownGameTitle, selectGameTitle } from '../utils/gameTitle.js';
import pLimit from 'p-limit';

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

    const progress = new SyncProgressTracker(syncOperation);
    await progress.begin('preparing', 1, 'Preparing sync...');

    try {
      if (profile.platform === 'steam') {
        await this.syncSteam(profile, syncOperation, progress);
      } else if (profile.platform === 'xbox') {
        await this.syncXbox(profile, syncOperation, progress);
      } else if (profile.platform === 'playstation') {
        await this.syncPlayStation(profile, syncOperation, progress);
      }

      // Ensure progress reaches 100% and save to database for UI to display
      // This is important when icons download instantly (files already exist locally)
      if (syncOperation.iconDownloadsPending > 0) {
        syncOperation.iconDownloadsCompleted = syncOperation.iconDownloadsPending;
      }
      await syncOperation.save();

      await progress.begin('finalizing', 1, 'Finalizing sync...');
      await progress.finish('Sync complete');
      
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

  private async syncSteam(profile: IProfile, syncOperation: any, progress: SyncProgressTracker): Promise<void> {
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
      if (playerSummary?.personaname && playerSummary.personaname !== profile.displayName && !profile.displayNameEdited) {
        profile.displayName = playerSummary.personaname;
        await Profile.findByIdAndUpdate(profile._id, { displayName: playerSummary.personaname });
        logger.info({ profileId: profile.profileId, displayName: playerSummary.personaname }, 'Updated profile display name from Steam');
      }
    } catch (error) {
      logger.warn({ error, profileId: profile.profileId }, 'Failed to fetch Steam display name');
    }

    // Fetch previously-synced game IDs so family-shared / removed games aren't lost
    const previousGames = await Game.find(
      { profileId: profile._id, platform: 'steam' },
      { gameId: 1, title: 1 }
    ).lean();
    const knownGameIds = previousGames.map((g) => parseInt(g.gameId, 10)).filter((id) => !isNaN(id));
    const previousTitles = new Map(previousGames.map((g) => [g.gameId, g.title]));

    // Games with any locally unlocked achievement must keep being fetched even
    // when Steam currently reports zero unlocks. This preserves historical
    // progress when a developer removes/archives achievements.
    const unlockedGameObjectIds = await Achievement.distinct('gameId', {
      profileId: profile._id,
      platform: 'steam',
      unlockedAt: { $exists: true, $ne: null },
    });
    const historicalGames = unlockedGameObjectIds.length > 0
      ? await Game.find({ _id: { $in: unlockedGameObjectIds } }, { gameId: 1 }).lean()
      : [];
    const historicalGameIds = historicalGames
      .map((g) => parseInt(g.gameId, 10))
      .filter((id) => !isNaN(id));

    await progress.begin('discovering', null, 'Fetching your Steam library...');
    const result = await steamAdapter.syncGamesAndAchievements(
      profile.profileId,
      syncOperation,
      knownGameIds,
      progress,
      historicalGameIds,
      previousTitles,
    );

    // T031: Update SyncOperation with final counts
    syncOperation.totalGames = result.games.length;
    syncOperation.totalAchievements = result.achievements.length;
    syncOperation.iconDownloadsPending = result.achievements.length;
    
    // T032: Update adaptive parameters from steam adapter
    if (result.adaptiveStats) {
      syncOperation.adaptiveParams = {
        batchSize: result.adaptiveStats.finalBatchSize,
        concurrency: result.adaptiveStats.finalConcurrency,
        delay: result.adaptiveStats.finalDelay,
      };
    }
    await syncOperation.save();

    await progress.complete('Achievement data fetched', {
      totalGames: result.games.length,
      totalAchievements: result.achievements.length,
      iconDownloadsPending: result.achievements.length,
      gamesProcessed: result.games.length,
    });

    logger.info({
      syncOperationId: syncOperation._id,
      totalGames: result.games.length,
      totalAchievements: result.achievements.length,
      adaptiveParams: syncOperation.adaptiveParams,
    }, 'Sync data fetched, beginning database updates');

    // Download game images (adaptive concurrency inside steam adapter).
    // The adapter pre-checks the local cache and only reports downloads that
    // are actually missing.
    const steamGridDBAdapter = await createSteamGridDBAdapter();
    const gameImageMap = await steamAdapter.downloadGameImages(
      result.games,
      syncOperation,
      steamGridDBAdapter,
      progress,
    );

    // Download achievement icons (adaptive concurrency inside steam adapter)
    const { iconMap: achievementIconMap, completed, failed } = await steamAdapter.downloadAchievementIcons(
      result.achievements, syncOperation, progress,
    );
    syncOperation.iconDownloadsCompleted = completed;
    syncOperation.iconDownloadsFailed = failed;

    // All network work is done. Save games and achievements to the database.
    const savingTotal = result.games.length + result.achievements.length;
    await progress.begin('saving', savingTotal, `Saving games... (0/${result.games.length})`);

    let savedGames = 0;
    await performanceMonitor.measureDbQuery(
      'syncService.upsertGames',
      async () => {
        return Promise.all(
          result.games.map(async (game) => {
            const updateData: any = {
              platform: 'steam',
              title: selectGameTitle(game.appId, game.name, previousTitles.get(game.appId.toString())),
              achievementsTotal: game.totalAchievements,
              achievementsUnlocked: game.earnedAchievements,
              completionPercent:
                game.totalAchievements > 0
                  ? Math.round((game.earnedAchievements / game.totalAchievements) * 100)
                  : 0,
              playTimeMinutes: game.playtimeMinutes,
              ownershipSource: game.ownershipSource,
              achievementsFetchFailed: game.achievementsFetchFailed || false,
              hasAchievementGroups: game.hasAchievementGroups || false,
              lastSyncedAt: new Date(),
            };

            if (game.lastPlayed) {
              updateData.lastPlayed = game.lastPlayed;
            }

            // Only update image paths if we successfully downloaded images
            const imagePaths = gameImageMap.get(game.appId);
            if (imagePaths?.capsuleImagePath) {
              updateData.capsuleImagePath = imagePaths.capsuleImagePath;
            }
            if (imagePaths?.iconImagePath) {
              updateData.iconImagePath = imagePaths.iconImagePath;
            }
            if (imagePaths?.heroImagePath) {
              updateData.heroImagePath = imagePaths.heroImagePath;
            }

            const saved = await Game.findOneAndUpdate(
              { profileId: profile._id, platform: 'steam', gameId: game.appId.toString() },
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

            savedGames++;
            if (savedGames % 50 === 0 || savedGames === result.games.length) {
              await progress.update(
                savedGames,
                `Saving games... (${savedGames}/${result.games.length})`,
                { gamesProcessed: savedGames },
              );
            }
            return saved;
          })
        );
      }
    );

    logger.info({
      syncOperationId: syncOperation._id,
      gamesProcessed: result.games.length,
    }, 'Games upserted to database');

    // Remove Steam games the adapter no longer reports (e.g. games removed from
    // the account) so the library stays in sync. Games with locally unlocked
    // achievements are preserved: they may have been deleted from Steam's
    // achievement schema, but the user's earned history is still valuable.
    // Guarded on a non-empty result set to avoid wiping the library if the sync
    // produced nothing.
    if (result.games.length > 0) {
      const syncedGameIds = result.games.map((g) => g.appId.toString());
      const staleGames = await Game.find(
        { profileId: profile._id, platform: 'steam', gameId: { $nin: syncedGameIds } },
        { _id: 1, gameId: 1, title: 1 }
      ).lean();

      if (staleGames.length > 0) {
        const staleIds = staleGames.map((g) => g._id);
        const gamesWithUnlocks = await Achievement.distinct('gameId', {
          profileId: profile._id,
          platform: 'steam',
          gameId: { $in: staleIds },
          unlockedAt: { $exists: true, $ne: null },
        });
        const gamesWithUnlocksSet = new Set(gamesWithUnlocks.map((id) => id.toString()));
        const deletableIds = staleIds.filter((id) => !gamesWithUnlocksSet.has(id.toString()));

        if (deletableIds.length > 0) {
          await Achievement.deleteMany({ profileId: profile._id, gameId: { $in: deletableIds } });
          await Game.deleteMany({ _id: { $in: deletableIds } });
        }

        if (deletableIds.length > 0 || gamesWithUnlocksSet.size > 0) {
          logger.info({
            profileId: profile.profileId,
            removed: deletableIds.length,
            keptWithHistory: gamesWithUnlocksSet.size,
          }, 'Reconciled stale Steam games');
        }
      }
    }

    // Backfill missing/placeholder titles. Unowned play-history games often
    // have no name in GetOwnedGames, and Steam Store may no longer list them.
    const unknownTitleGames = await Game.find(
      {
        profileId: profile._id,
        platform: 'steam',
        $or: [
          { title: '' },
          { title: null },
          { title: { $regex: '^Unknown \\(\\d+\\)$' } },
          { title: { $regex: '^App \\d+$' } },
        ],
      },
      { _id: 1, gameId: 1, title: 1 },
    ).lean();

    if (unknownTitleGames.length > 0) {
      let resolvedTitles = 0;
      const unresolvedTitles: string[] = [];

      for (const game of unknownTitleGames) {
        const appId = parseInt(game.gameId, 10);
        if (isNaN(appId)) {
          unresolvedTitles.push(game.gameId);
          continue;
        }

        try {
          const resolvedName = await steamAdapter.resolveGameNameByAppId(appId);
          if (resolvedName && !isUnknownGameTitle(resolvedName)) {
            await Game.updateOne({ _id: game._id }, { $set: { title: resolvedName } });
            resolvedTitles++;
          } else {
            unresolvedTitles.push(game.gameId);
          }
        } catch (error) {
          logger.warn({
            error: error instanceof Error ? error.message : String(error),
            gameId: game.gameId,
          }, 'Failed to resolve missing Steam game title');
          unresolvedTitles.push(game.gameId);
        }
      }

      logger.info({
        syncOperationId: syncOperation._id,
        candidates: unknownTitleGames.length,
        resolved: resolvedTitles,
        unresolved: unresolvedTitles.length,
        unresolvedGameIds: unresolvedTitles.slice(0, 25),
      }, 'Backfilled missing Steam game titles');
    }

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

    // Reconcile local achievements against the current Steam schema. Steam no
    // longer returns achievements that were deleted, and archived achievements
    // are hidden unless the player earned them. Delete stale locked rows, keep
    // earned historical rows, and mark them as unavailable.
    const remoteByAppId = new Map<string, typeof result.achievements>();
    for (const achievement of result.achievements) {
      const key = achievement.appId.toString();
      const list = remoteByAppId.get(key);
      if (list) {
        list.push(achievement);
      } else {
        remoteByAppId.set(key, [achievement]);
      }
    }

    const gameMongoIds = result.games
      .map((game) => gameIdToMongoId.get(game.appId.toString()))
      .filter((id): id is NonNullable<typeof id> => !!id);

    const localAchievements = gameMongoIds.length > 0
      ? await performanceMonitor.measureDbQuery(
          'syncService.fetchLocalAchievements',
          async () => Achievement.find(
            {
              profileId: profile._id,
              platform: 'steam',
              gameId: { $in: gameMongoIds },
            },
            { _id: 1, gameId: 1, achievementId: 1, unlockedAt: 1 }
          ).lean()
        )
      : [];

    const localByGameId = new Map<string, typeof localAchievements>();
    for (const achievement of localAchievements) {
      const key = achievement.gameId.toString();
      const list = localByGameId.get(key);
      if (list) {
        list.push(achievement);
      } else {
        localByGameId.set(key, [achievement]);
      }
    }

    const archivedStatusIds: any[] = [];
    const removedStatusIds: any[] = [];
    const staleAchievementIds: any[] = [];
    const gameCountUpdates: any[] = [];

    for (const game of result.games) {
      const appKey = game.appId.toString();
      const gameMongoId = gameIdToMongoId.get(appKey);
      if (!gameMongoId) continue;

      // A revoked-license game can return a partial schema. Do not delete or
      // relabel anything based on that response.
      if (game.achievementsFetchFailed) continue;

      const remote = remoteByAppId.get(appKey) ?? [];
      const local = localByGameId.get(gameMongoId.toString()) ?? [];
      const archivedIds = new Set(game.archivedAchievementIds ?? []);

      const remoteById = new Map(remote.map((achievement) => [achievement.achievementId, achievement]));
      const localById = new Map(local.map((achievement) => [achievement.achievementId, achievement]));

      const kept = new Map<string, { unlocked: boolean; availability: 'active' | 'archived' | 'removed' }>();

      for (const achievement of remote) {
        const localAchievement = localById.get(achievement.achievementId);
        kept.set(achievement.achievementId, {
          unlocked: !!achievement.unlocked || !!localAchievement?.unlockedAt,
          availability: achievement.archived ? 'archived' : 'active',
        });
      }

      for (const localAchievement of local) {
        if (remoteById.has(localAchievement.achievementId)) {
          continue;
        }

        if (!localAchievement.unlockedAt) {
          staleAchievementIds.push(localAchievement._id);
          continue;
        }

        const availability = archivedIds.has(localAchievement.achievementId) ? 'archived' : 'removed';
        kept.set(localAchievement.achievementId, { unlocked: true, availability });
        if (availability === 'archived') {
          archivedStatusIds.push(localAchievement._id);
        } else {
          removedStatusIds.push(localAchievement._id);
        }
      }

      // Unavailable achievements are shown separately in the UI and never
      // counted toward the game's current totals/completion.
      const activeKept = Array.from(kept.values()).filter((entry) => entry.availability === 'active');
      const total = activeKept.length;
      const unlocked = activeKept.filter((entry) => entry.unlocked).length;

      gameCountUpdates.push({
        updateOne: {
          filter: { _id: gameMongoId },
          update: {
            $set: {
              achievementsTotal: total,
              achievementsUnlocked: unlocked,
              completionPercent: total > 0 ? Math.round((unlocked / total) * 100) : 0,
            },
          },
        },
      });
    }

    logger.info({
      syncOperationId: syncOperation._id,
      localAchievements: localAchievements.length,
      staleLockedAchievements: staleAchievementIds.length,
      retainedArchivedAchievements: archivedStatusIds.length,
      retainedRemovedAchievements: removedStatusIds.length,
    }, 'Reconciled local Steam achievements against current schema');

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
            groupId: achievement.groupId,
            groupName: achievement.groupName,
            groupOrder: achievement.groupOrder,
            globalPercent: achievement.globalPercent,
            availability: achievement.archived ? 'archived' : 'active',
          };

          // Do not explicitly clear unlockedAt for locked achievements: Steam
          // may transiently report a previously-earned achievement as locked,
          // and the local unlock is the historical source of truth.
          if (achievement.unlocked && achievement.unlockTime) {
            updateFields.unlockedAt = achievement.unlockTime;
          }

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
            
            // Update in-memory copy
            syncOperation.achievementsSynced = achievementsUpserted;

            await progress.update(
              result.games.length + achievementsUpserted,
              `Saving achievements... (${achievementsUpserted}/${result.achievements.length})`,
              { achievementsSynced: achievementsUpserted },
            );
            
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

    // Apply retained-history markers and remove stale locked rows only after
    // the current achievements have been upserted, so a row cannot be deleted
    // and immediately re-created in the same sync.
    const statusBatchSize = 1000;
    const applyAvailability = async (ids: any[], availability: 'archived' | 'removed') => {
      for (let i = 0; i < ids.length; i += statusBatchSize) {
        await Achievement.updateMany(
          { _id: { $in: ids.slice(i, i + statusBatchSize) } },
          { $set: { availability } },
        );
      }
    };

    await applyAvailability(archivedStatusIds, 'archived');
    await applyAvailability(removedStatusIds, 'removed');

    for (let i = 0; i < staleAchievementIds.length; i += statusBatchSize) {
      await Achievement.deleteMany({ _id: { $in: staleAchievementIds.slice(i, i + statusBatchSize) } });
    }

    // Re-apply the final active-only counts. This also covers local unlocks
    // that Steam reported as locked but we intentionally preserve.
    if (gameCountUpdates.length > 0) {
      await performanceMonitor.measureDbQuery(
        'syncService.updateGameAchievementCounts',
        async () => Game.bulkWrite(gameCountUpdates, { ordered: false }),
      );
    }

    logger.info({
      syncOperationId: syncOperation._id,
      staleAchievementsRemoved: staleAchievementIds.length,
      archivedAchievementsRetained: archivedStatusIds.length,
      removedAchievementsRetained: removedStatusIds.length,
      gameCountsUpdated: gameCountUpdates.length,
    }, 'Finished reconciliation of Steam achievements');

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

    await progress.complete('Games and achievements saved', {
      gamesProcessed: result.games.length,
      achievementsSynced: achievementsUpserted,
      iconDownloadsCompleted: completed,
      iconDownloadsFailed: failed,
    });
    
    // Clear large data structures to free memory
    achievementIconMap.clear();
    gameIdToMongoId.clear();
  }

  // -------------------------------------------------------------------------
  // Xbox sync (T014 / T016)
  // -------------------------------------------------------------------------

  private async syncXbox(profile: IProfile, syncOperation: any, progress: SyncProgressTracker): Promise<void> {
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

    // Persist refreshed token — use .save() to trigger the pre-save encryption hook
    // (findByIdAndUpdate bypasses Mongoose middleware, leaving tokens unencrypted)
    const freshProfile = await Profile.findById(profile._id);
    if (freshProfile) {
      freshProfile.credentials = {
        ...freshProfile.credentials,
        accessToken: tokenBundle.xstsToken,
        refreshToken: tokenBundle.refreshToken ?? credentials.refreshToken,
        expiresAt: tokenBundle.expiresAt,
      } as any;
      freshProfile.markModified('credentials');
      await freshProfile.save();
    }

    const { xstsToken, userHash, xuid } = tokenBundle;

    // -----------------------------------------------------------------------
    // Phase 2: Update profile display name (gamertag)
    // -----------------------------------------------------------------------

    try {
      const xboxProfile = await adapter.getXboxProfile(xuid, xstsToken, userHash);
      if (xboxProfile.gamertag && xboxProfile.gamertag !== profile.displayName && !profile.displayNameEdited) {
        await Profile.findByIdAndUpdate(profile._id, { displayName: xboxProfile.gamertag });
        logger.info({ xuid, gamertag: xboxProfile.gamertag }, 'Updated Xbox profile display name');
      }
    } catch (error) {
      logger.warn({ error, xuid }, 'Failed to update Xbox profile display name');
    }

    // -----------------------------------------------------------------------
    // Phase 3: Game discovery
    // -----------------------------------------------------------------------

    await progress.begin('discovering', null, 'Fetching Xbox title history...');
    const titles = await adapter.getTitleHistory(xuid, xstsToken, userHash);
    await progress.setTotal(titles.length, `Found ${titles.length} Xbox titles — loading achievement metadata...`);

    // Enrich from TitleHub — the only source that returns the full devices array,
    // and the source of Mythic status/base-game counts and aggregate summary.
    const titleHubData = await adapter.getTitleHubData(xuid, xstsToken, userHash);
    for (const title of titles) {
      const hubDevices = titleHubData.devicesMap.get(title.titleId);
      if (hubDevices && hubDevices.length > 0) {
        title.devices = hubDevices;
      }

      const mythicMeta = titleHubData.titleMeta.get(title.titleId);
      if (mythicMeta) {
        // `baseGameCompleted` is the authoritative earned flag. `isMythic`
        // only identifies Mythic-capable titles on newer responses, so only
        // fall back to it when completion is not available.
        const mythicEarned = mythicMeta.baseGameCompleted ?? mythicMeta.isMythic;
        if (mythicEarned !== undefined) title.isMythic = mythicEarned;
        // TitleHub's `baseGameCount` is a 0/1 flag indicating that a BaseGame
        // group exists. It is NOT the number of base-game achievements; the
        // real count comes from the achievements API in Phase 5.
        if (mythicMeta.hasBaseGameGroup !== undefined) {
          title.hasBaseGameGroup = mythicMeta.hasBaseGameGroup;
          title.hasAchievementGroups = mythicMeta.hasBaseGameGroup;
        }
        if (mythicMeta.baseGameCompleted !== undefined) {
          title.baseGameCompleted = mythicMeta.baseGameCompleted;
        }
        // TitleHub reports exact catalog counts. Use them to plan achievement
        // and icon work before any per-title API calls are made.
        if (mythicMeta.currentAchievements !== undefined && mythicMeta.currentAchievements > title.currentAchievements) {
          title.currentAchievements = mythicMeta.currentAchievements;
        }
        if (mythicMeta.totalAchievements !== undefined) {
          title.totalAchievements = mythicMeta.totalAchievements;
        }
      }
    }

    if (titleHubData.achievementSummary) {
      await Profile.findByIdAndUpdate(profile._id, {
        $set: { xboxAchievementSummary: titleHubData.achievementSummary },
      });
      logger.info(
        {
          profileId: profile.profileId,
          mythicsUnlocked: titleHubData.achievementSummary.mythicsUnlocked,
          totalAchievementsUnlocked: titleHubData.achievementSummary.totalAchievementsUnlocked,
        },
        'Stored Xbox achievement summary from TitleHub',
      );
    }

    const totalAchievements = titles.reduce((sum, t) => sum + t.totalAchievements, 0);

    const gamesWithAchievements = titles.filter((t) => t.inEarnedScan || t.currentAchievements > 0).length;

    syncOperation.totalGames = gamesWithAchievements;
    syncOperation.totalAchievements = totalAchievements;
    syncOperation.iconDownloadsPending = totalAchievements; // one icon per achievement
    await syncOperation.save();

    await progress.complete('Xbox library loaded', {
      totalGames: gamesWithAchievements,
      totalAchievements,
      iconDownloadsPending: totalAchievements,
    });

    logger.info(
      { syncOperationId: syncOperation._id, totalGames: gamesWithAchievements, totalTitles: titles.length, totalAchievements },
      'Xbox title history fetched',
    );

    // -----------------------------------------------------------------------
    // Phase 4: Game image downloads (adaptive concurrency inside xbox adapter)
    // -----------------------------------------------------------------------

    const steamGridDBAdapter = await createSteamGridDBAdapter();
    const gameImageMap = await adapter.downloadGameImages(titles, syncOperation, steamGridDBAdapter, progress);

    // Games already in the library are updated with fresh metadata here.
    // New games are only created in Phase 5, after the achievements API
    // confirms they actually have achievements. Inserting every title from the
    // history API here made previously-synced libraries briefly fill with 0/0
    // entries that were deleted again at the end of the sync.
    const allGames = await Game.find({ profileId: profile._id, platform: 'xbox' })
      .select('_id gameId')
      .lean();
    const gameIdToMongoId = new Map(allGames.map((g) => [g.gameId, g._id]));

    await performanceMonitor.measureDbQuery(
      'syncService.upsertXboxGames',
      async () => Promise.all(
      titles.map((title) => {
        const gameMongoId = gameIdToMongoId.get(title.titleId);
        if (!gameMongoId) return Promise.resolve();

        // Strip C0/C1 control characters (e.g. U+009E in "Rush: A Disney\u009EPixar Adventure")
        // while preserving all printable characters including ™ (U+2122).
        const cleanTitle = title.name
          .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, '')
          .replace(/\s{2,}/g, ' ')
          .trim();

        // Achievement/gamerscore counters are intentionally not written here:
        // the title-history values are unreliable (often 0) and Phase 5 owns
        // those fields. This keeps existing totals visible during the sync.
        const updateData: any = {
          platform: 'xbox',
          title: cleanTitle,
          devices: title.devices,
          ...(title.isMythic !== undefined && { isMythic: title.isMythic }),
          ...(title.hasBaseGameGroup !== undefined && {
            hasAchievementGroups: title.hasBaseGameGroup,
          }),
          ...(title.lastPlayed !== undefined && { lastPlayed: new Date(title.lastPlayed) }),
          lastSyncedAt: new Date(),
        };

        const imagePaths = gameImageMap.get(title.titleId);
        if (imagePaths?.capsuleImagePath) updateData.capsuleImagePath = imagePaths.capsuleImagePath;
        if (imagePaths?.iconImagePath) updateData.iconImagePath = imagePaths.iconImagePath;
        if (imagePaths?.heroImagePath) updateData.heroImagePath = imagePaths.heroImagePath;

        return Game.updateOne({ _id: gameMongoId }, { $set: updateData }).catch((error) => {
          logger.error({ error, titleId: title.titleId }, 'Failed to update Xbox game');
          syncOperation.gamesFailed++;
        });
      }),
    ));

    logger.info({ syncOperationId: syncOperation._id, existingGames: allGames.length, gamesWithAchievements }, 'Xbox games updated');

    // -----------------------------------------------------------------------
    // Phase 5: Achievement sync (adaptive batch/throttle/concurrency inside xbox adapter)
    // -----------------------------------------------------------------------

    await progress.begin(
      'achievements',
      titles.length,
      `Fetching achievement data... (0/${titles.length})`,
    );

    const achievementsSynced = await adapter.syncAchievements(
      titles, xuid, xstsToken, userHash, syncOperation, gameIdToMongoId, gameImageMap, progress,
    );

    syncOperation.achievementsSynced = achievementsSynced;
    await syncOperation.save();
  }

  // -------------------------------------------------------------------------
  // PlayStation sync
  // -------------------------------------------------------------------------

  private async syncPlayStation(profile: IProfile, syncOperation: any, progress: SyncProgressTracker): Promise<void> {
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

        // Validate the refreshed token by fetching the profile
        try {
          await adapter.getProfile(accessToken, 'me');
        } catch (validationErr) {
          logger.error({ err: validationErr, profileId: profile.profileId }, 'PSN refreshed token failed validation');
          throw new Error('Refreshed PSN token is invalid');
        }

        // Use profile.save() to trigger the pre-save encryption hook
        const freshProfile = await Profile.findById(profile._id);
        if (freshProfile) {
          freshProfile.credentials = {
            ...freshProfile.credentials,
            accessToken: newTokens.accessToken,
            refreshToken: newTokens.refreshToken,
            expiresAt: newTokens.expiresAt,
            // Preserve the existing value if Sony did not return a refresh-token
            // lifetime again; otherwise store the rotated token's new expiry.
            refreshTokenExpiresAt: newTokens.refreshTokenExpiresAt ?? freshProfile.credentials.refreshTokenExpiresAt,
          } as any;
          freshProfile.markModified('credentials');
          await freshProfile.save();
        }
        logger.info({ profileId: profile.profileId }, 'PSN access token refreshed');
      } catch (err) {
        logger.error({ err, profileId: profile.profileId }, 'PSN token refresh failed — re-auth required');
        throw new Error('PlayStation authentication expired. Please re-authenticate by providing a new NPSSO token.');
      }
    }

    // -----------------------------------------------------------------------
    // Phase 2: Fetch trophy titles (games with ≥1 earned trophy)
    // -----------------------------------------------------------------------
    await progress.begin('discovering', null, 'Fetching PlayStation trophy titles...');
    logger.info({ profileId: accountId }, 'Fetching PlayStation trophy titles');
    const titles = await adapter.getTrophyTitles(accessToken, 'me');

    // Guard: if 0 games returned but the profile previously had games, the
    // token is likely invalid despite the refresh appearing to succeed.
    if (titles.length === 0) {
      const previousGameCount = await Game.countDocuments({
        profileId: profile._id,
        platform: 'playstation',
      });
      if (previousGameCount > 0) {
        logger.error(
          { profileId: accountId, previousGameCount },
          'PSN returned 0 trophy titles but profile previously had games — token likely invalid',
        );
        throw new Error(
          `PlayStation sync returned 0 games but ${previousGameCount} were previously synced. ` +
          'The authentication token is likely invalid. Please re-authenticate by providing a new NPSSO token.',
        );
      }
    }

    const plannedTrophies = titles.reduce((sum, title) => sum + (
      title.definedTrophies.bronze +
      title.definedTrophies.silver +
      title.definedTrophies.gold +
      title.definedTrophies.platinum
    ), 0);

    syncOperation.totalGames = titles.length;
    syncOperation.totalAchievements = plannedTrophies;
    syncOperation.iconDownloadsPending = plannedTrophies;
    await syncOperation.save();

    await progress.complete('PlayStation library loaded', {
      totalGames: titles.length,
      totalAchievements: plannedTrophies,
      iconDownloadsPending: plannedTrophies,
    });

    logger.info({ profileId: accountId, totalGames: titles.length, plannedTrophies }, 'PlayStation trophy titles fetched');

    const steamGridDB = await createSteamGridDBAdapter();

    // -----------------------------------------------------------------------
    // Phase 3: Game images (pre-flight cache check, then download only what
    // is missing — repeat syncs with cached art finish this phase immediately)
    // -----------------------------------------------------------------------
    const gameImageMap = new Map<string, {
      capsuleImagePath?: string;
      iconImagePath?: string;
      heroImagePath?: string;
    }>();
    const titlesNeedingImages: PSNTrophyTitle[] = [];

    logger.info(
      { total: titles.length, profileId: accountId },
      'Checking local PlayStation game image cache',
    );

    for (let index = 0; index < titles.length; index++) {
      const title = titles[index];
      const cached = imageStorage.checkCachedGameImages('playstation', title.npCommunicationId);
      if (cached.capsuleImagePath && cached.iconImagePath && cached.heroImagePath) {
        gameImageMap.set(title.npCommunicationId, cached);
      } else {
        titlesNeedingImages.push(title);
      }

      if ((index + 1) % 100 === 0 && index + 1 < titles.length) {
        logger.info(
          { checked: index + 1, total: titles.length, cached: gameImageMap.size },
          'PlayStation game image cache check progress',
        );
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    }

    logger.info(
      {
        total: titles.length,
        cached: gameImageMap.size,
        missing: titlesNeedingImages.length,
        profileId: accountId,
      },
      'PlayStation game image cache check complete',
    );

    await progress.begin(
      'game-images',
      titlesNeedingImages.length,
      titlesNeedingImages.length === 0
        ? 'Game images already up to date'
        : `Downloading game images... (0/${titlesNeedingImages.length})`,
      { imagesCompleted: gameImageMap.size },
    );

    if (titlesNeedingImages.length > 0) {
      for (let i = 0; i < titlesNeedingImages.length; i++) {
        const title = titlesNeedingImages[i];
        try {
          const imagePaths = await adapter.downloadGameImage(
            title.title,
            title.npCommunicationId,
            title.imageUrl,
            steamGridDB || undefined,
          );
          gameImageMap.set(title.npCommunicationId, imagePaths);
        } catch (err) {
          logger.warn(
            { err, game: title.title, npCommunicationId: title.npCommunicationId },
            'Failed to download PlayStation game images, will retry next sync',
          );
        }

        if (i % 5 === 0 || i === titlesNeedingImages.length - 1) {
          await progress.update(
            i + 1,
            `Downloading game images... (${i + 1}/${titlesNeedingImages.length})`,
            { imagesCompleted: gameImageMap.size },
          );
        }
      }
    }

    await progress.complete('Game images ready', { imagesCompleted: titles.length });

    // -----------------------------------------------------------------------
    // Phase 4: Fetch every title's trophy definitions and earned status
    // -----------------------------------------------------------------------
    interface FetchedTrophyTitle {
      title: PSNTrophyTitle;
      definitions: PSNTrophyDetail[];
      earned: PSNEarnedTrophy[];
      groups: PSNTrophyGroup[];
      error?: string;
    }

    const fetchedTitles: FetchedTrophyTitle[] = [];
    let actualTrophies = 0;

    await progress.begin(
      'achievements',
      titles.length,
      `Fetching trophy data... (0/${titles.length})`,
    );

    for (let i = 0; i < titles.length; i++) {
      if (isSyncCancelled(syncOperation._id.toString())) {
        logger.info({ syncOperationId: syncOperation._id }, 'PlayStation sync cancelled while fetching trophies');
        break;
      }

      const title = titles[i];
      try {
        const [definitions, earned, trophyGroups] = await Promise.all([
          adapter.getTrophyDefinitions(accessToken, title.npCommunicationId, title.npServiceName),
          adapter.getEarnedTrophies(accessToken, 'me', title.npCommunicationId, title.npServiceName),
          title.hasTrophyGroups
            ? adapter.getTrophyGroups(accessToken, title.npCommunicationId, title.npServiceName)
            : Promise.resolve([]),
        ]);

        actualTrophies += definitions.length;
        fetchedTitles.push({ title, definitions, earned, groups: trophyGroups });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn({ err: message, game: title.title }, 'Failed to fetch PlayStation trophies, skipping');
        fetchedTitles.push({ title, definitions: [], earned: [], groups: [], error: message });
      }

      if (i % 5 === 0 || i === titles.length - 1) {
        await progress.update(
          i + 1,
          `Fetching trophy data... (${i + 1}/${titles.length})`,
          {
            gamesProcessed: i + 1,
            totalAchievements: actualTrophies,
          },
        );
      }
    }

    syncOperation.totalAchievements = actualTrophies;
    await syncOperation.save();

    await progress.complete('Trophy data fetched', {
      totalAchievements: actualTrophies,
      gamesProcessed: titles.length,
      iconDownloadsPending: actualTrophies,
    });

    // -----------------------------------------------------------------------
    // Phase 5: Trophy icons (pre-flight cache check, exact total)
    // -----------------------------------------------------------------------
    interface TrophyIconWork {
      titleId: string;
      trophyId: string;
      iconUrl?: string;
    }

    const trophyIconMap = new Map<string, string | undefined>();
    const trophyIconWork: TrophyIconWork[] = [];
    const trophyIconKey = (titleId: string, trophyId: string) => `${titleId}:${trophyId}`;

    logger.info(
      {
        totalTitles: fetchedTitles.length,
        totalTrophies: fetchedTitles.reduce((sum, fetched) => sum + fetched.definitions.length, 0),
        profileId: accountId,
      },
      'Checking PlayStation trophy icon cache',
    );

    for (const fetched of fetchedTitles) {
      const cachedPaths = imageStorage.checkLocalFiles(
        'playstation',
        fetched.title.npCommunicationId,
        fetched.definitions.map((definition) => ({
          achievementId: definition.trophyId,
          imageType: 'icon' as const,
        })),
      );

      fetched.definitions.forEach((definition, index) => {
        const key = trophyIconKey(fetched.title.npCommunicationId, definition.trophyId);
        if (!definition.iconUrl) {
          trophyIconMap.set(key, undefined);
          return;
        }

        const cached = cachedPaths[index];
        if (cached) {
          trophyIconMap.set(key, cached);
        } else {
          trophyIconWork.push({
            titleId: fetched.title.npCommunicationId,
            trophyId: definition.trophyId,
            iconUrl: definition.iconUrl,
          });
        }
      });
    }

    const plannedIcons = trophyIconMap.size + trophyIconWork.length;
    syncOperation.iconDownloadsPending = plannedIcons;
    syncOperation.iconDownloadsCompleted = trophyIconMap.size;

    logger.info(
      {
        totalTitles: fetchedTitles.length,
        cachedIcons: trophyIconMap.size,
        missingIcons: trophyIconWork.length,
        profileId: accountId,
      },
      'PlayStation trophy icon cache check complete',
    );

    await progress.begin(
      'icons',
      trophyIconWork.length,
      trophyIconWork.length === 0
        ? 'Trophy icons already up to date'
        : `Downloading trophy icons... (0/${trophyIconWork.length})`,
      {
        iconDownloadsPending: plannedIcons,
        iconDownloadsCompleted: trophyIconMap.size,
        iconDownloadsFailed: 0,
      },
    );

    if (trophyIconWork.length > 0) {
      const trophyIconLimit = pLimit(Math.min(SYNC_DEFAULTS.CONCURRENCY, 10));
      let iconsCompleted = 0;
      let iconsFailed = 0;

      await Promise.all(trophyIconWork.map((work) => trophyIconLimit(async () => {
        const iconPath = await adapter.downloadTrophyIcon(
          work.titleId,
          work.trophyId,
          work.iconUrl,
        );
        trophyIconMap.set(trophyIconKey(work.titleId, work.trophyId), iconPath);
        if (!iconPath) iconsFailed++;

        iconsCompleted++;
        if (iconsCompleted % 50 === 0 || iconsCompleted === trophyIconWork.length) {
          await progress.update(
            iconsCompleted,
            `Downloading trophy icons... (${iconsCompleted}/${trophyIconWork.length})`,
            {
              iconDownloadsCompleted: trophyIconMap.size,
              iconDownloadsFailed: iconsFailed,
            },
          );
        }
      })));

      await progress.complete('Trophy icons ready', {
        iconDownloadsPending: plannedIcons,
        iconDownloadsCompleted: plannedIcons,
        iconDownloadsFailed: iconsFailed,
      });
    } else {
      await progress.complete('Trophy icons already up to date', {
        iconDownloadsPending: plannedIcons,
        iconDownloadsCompleted: plannedIcons,
        iconDownloadsFailed: 0,
      });
    }

    // -----------------------------------------------------------------------
    // Phase 6: Save games and trophies
    // -----------------------------------------------------------------------
    let achievementsSynced = 0;

    await progress.begin(
      'saving',
      fetchedTitles.length,
      `Saving games and trophies... (0/${fetchedTitles.length})`,
      {
        iconDownloadsPending: plannedIcons,
        iconDownloadsCompleted: plannedIcons,
      },
    );

    for (let i = 0; i < fetchedTitles.length; i++) {
      if (isSyncCancelled(syncOperation._id.toString())) {
        logger.info({ syncOperationId: syncOperation._id }, 'PlayStation sync cancelled before saving');
        break;
      }

      const { title, definitions, earned, groups, error } = fetchedTitles[i];
      try {
        const imagePaths = gameImageMap.get(title.npCommunicationId) ?? {};

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
              hasPlatinum: title.definedTrophies.platinum > 0,
              hasAchievementGroups: title.hasTrophyGroups || false,
              lastPlayed: title.lastUpdatedDateTime ? new Date(title.lastUpdatedDateTime) : undefined,
              ...(imagePaths.capsuleImagePath && { capsuleImagePath: imagePaths.capsuleImagePath }),
              ...(imagePaths.iconImagePath && { iconImagePath: imagePaths.iconImagePath }),
              ...(imagePaths.heroImagePath && { heroImagePath: imagePaths.heroImagePath }),
              lastSyncedAt: new Date(),
            },
          },
          { upsert: true, new: true }
        );

        if (!error) {
          const groupMap = new Map(groups.map((g) => [g.groupId, g]));
          const earnedMap = new Map(earned.map((e) => [e.trophyId, e]));

          // Upsert achievements (trophies)
          const bulkOps = definitions.map((def) => {
            const earnStatus = earnedMap.get(def.trophyId);
            const iconPath = trophyIconMap.get(
              trophyIconKey(title.npCommunicationId, def.trophyId),
            );
            const group = def.groupId ? groupMap.get(def.groupId) : undefined;

            const updateFields: any = {
              platform: 'playstation',
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
              groupId: def.groupId,
              groupName: group?.groupName,
              groupOrder: group?.order,
            };

            if (earnStatus?.globalPercent !== undefined) {
              updateFields.globalPercent = earnStatus.globalPercent;
            }
            if (earnStatus?.rarityCategory) {
              updateFields.rarityCategory = earnStatus.rarityCategory;
            }

            return {
              updateOne: {
                filter: {
                  platform: 'playstation',
                  profileId: profile._id,
                  gameId: game._id,
                  achievementId: def.trophyId,
                },
                update: { $set: updateFields },
                upsert: true,
              },
            };
          });

          if (bulkOps.length > 0) {
            await Achievement.bulkWrite(bulkOps);
            achievementsSynced += bulkOps.length;
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn({ err: message, game: title.title }, 'Failed to save PlayStation game, skipping');
      }

      if (i % 5 === 0 || i === fetchedTitles.length - 1) {
        await progress.update(
          i + 1,
          `Saving games and trophies... (${i + 1}/${fetchedTitles.length})`,
          {
            gamesProcessed: i + 1,
            achievementsSynced,
          },
        );
      }
    }

    syncOperation.achievementsSynced = achievementsSynced;
    await syncOperation.save();

    await progress.complete('Games and trophies saved', {
      gamesProcessed: fetchedTitles.length,
      achievementsSynced,
      iconDownloadsPending: plannedIcons,
      iconDownloadsCompleted: plannedIcons,
    });

    // -----------------------------------------------------------------------
    // Phase 7: Image backfill for games missing from the PSN response
    // -----------------------------------------------------------------------
    // Games imported from a trophy backup are never returned by the PSN API,
    // so the loop above never visits them and they stay without cover art.
    // Run the same provider chain for those games so they look like synced
    // ones (SteamGridDB → IGDB → PlayStation CDN).
    const syncedGameIds = titles.map((t) => t.npCommunicationId);

    await progress.begin('finalizing', null, 'Checking remaining game images...');
    const backfilled = await backfillPlayStationGameImages(profile._id, {
      excludeGameIds: syncedGameIds,
      onPlan: async (total) => {
        await progress.setTotal(
          total,
          total === 0
            ? 'No remaining game images'
            : `Updating remaining game images... (0/${total})`,
        );
      },
      onProgress: async (completed, total) => {
        await progress.update(
          completed,
          `Updating remaining game images... (${completed}/${total})`,
        );
      },
    });
    if (backfilled > 0) {
      logger.info(
        { profileId: accountId, backfilled },
        'PlayStation images backfilled for games not returned by PSN',
      );
    }

    logger.info({
      profileId: accountId,
      totalGames: titles.length,
      totalAchievements: actualTrophies,
      achievementsSynced,
    }, 'PlayStation sync completed');
  }
}

export const syncService = new SyncService();
