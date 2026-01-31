import { Profile, IProfile } from '../models/profile.js';
import { Game } from '../models/game.js';
import { Achievement } from '../models/achievement.js';
import { SyncRun } from '../models/syncRun.js';
import { createSteamAdapter } from './adapters/steam.js';
import { createSteamGridDBAdapter } from './adapters/steamgriddb.js';
import { logger } from '../utils/logger.js';
import { imageStorage } from '../utils/imageStorage.js';
import pLimit from 'p-limit';

class SyncService {
  async syncProfile(profile: IProfile): Promise<void> {
    const startTime = new Date();
    logger.info({ platform: profile.platform, profileId: profile.profileId }, 'Starting sync');

    try {
      if (profile.platform === 'steam') {
        await this.syncSteam(profile);
      } else if (profile.platform === 'xbox') {
        logger.warn({ profileId: profile.profileId }, 'Xbox sync not yet implemented');
        throw new Error('Xbox sync not implemented');
      } else if (profile.platform === 'playstation') {
        logger.warn({ profileId: profile.profileId }, 'PlayStation sync not yet implemented');
        throw new Error('PlayStation sync not implemented');
      }

      // Record successful sync
      await SyncRun.create({
        profileId: profile._id,
        platform: profile.platform,
        startedAt: startTime,
        completedAt: new Date(),
        status: 'success',
      });

      logger.info({ platform: profile.platform, profileId: profile.profileId }, 'Sync completed');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error({ 
        error: errorMessage,
        stack: errorStack,
        platform: profile.platform, 
        profileId: profile.profileId 
      }, 'Sync failed');

      // Record failed sync
      await SyncRun.create({
        profileId: profile._id,
        platform: profile.platform,
        startedAt: startTime,
        completedAt: new Date(),
        status: 'failed',
        error: errorMessage,
      });

      throw error;
    }
  }

  private async syncSteam(profile: IProfile): Promise<void> {
    // Use profile-specific Steam API key if available, otherwise fall back to config
    const apiKey = (profile.credentials as any)?.steamApiKey || undefined;
    const steamAdapter = createSteamAdapter(apiKey);
    
    // Fetch and update display name from Steam API (source of truth)
    try {
      const playerSummary = await steamAdapter.getPlayerSummary(profile.profileId);
      if (playerSummary?.personaname && playerSummary.personaname !== profile.displayName) {
        profile.displayName = playerSummary.personaname;
        await Profile.findByIdAndUpdate(profile._id, { displayName: playerSummary.personaname });
        logger.info({ profileId: profile.profileId, displayName: playerSummary.personaname }, 'Updated profile display name from Steam');
      }
    } catch (error) {
      logger.warn({ error, profileId: profile.profileId }, 'Failed to fetch Steam display name');
    }

    const result = await steamAdapter.syncGamesAndAchievements(profile.profileId);

    // Check if SteamGridDB API key is configured
    const steamGridDBAdapter = await createSteamGridDBAdapter();
    const hasSteamGridDB = steamGridDBAdapter !== null;
    const iconConcurrency = parseInt(process.env.ICON_DOWNLOAD_CONCURRENCY || '5', 10);

    // Download game images in parallel batches
    const gameImagePromises: Promise<{ appId: number; imagePath?: string }>[] = [];

    for (const game of result.games) {
      const promise = (async () => {
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
      })();

      gameImagePromises.push(promise);
    }

    // Wait for ALL game image downloads to complete
    const gameImageResults = await Promise.all(gameImagePromises);
    const gameImageMap = new Map(gameImageResults.map((r) => [r.appId, r.imagePath]));

    // Upsert games with downloaded images
    await Promise.all(
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

        // Only update iconPath if we successfully downloaded an image
        const imagePath = gameImageMap.get(game.appId);
        if (imagePath) {
          updateData.iconPath = imagePath;
        }

        return Game.findOneAndUpdate(
          { profileId: profile._id, gameId: game.appId.toString() },
          { $set: updateData },
          { upsert: true, new: true }
        );
      })
    );

    // Group achievements by game and download icons in parallel
    const achievementsByGame = new Map<string, typeof result.achievements>();
    for (const achievement of result.achievements) {
      const gameId = achievement.appId.toString();
      if (!achievementsByGame.has(gameId)) {
        achievementsByGame.set(gameId, []);
      }
      achievementsByGame.get(gameId)!.push(achievement);
    }

    // Download achievement icons with concurrency limit
    const limit = pLimit(iconConcurrency);
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
    logger.info({ total: achievementIconPromises.length }, 'Starting achievement icon downloads');
    
    let completed = 0;
    const progressPromises = achievementIconPromises.map(async (promise) => {
      const result = await promise;
      completed++;
      if (completed % 1000 === 0) {
        logger.info({ completed, total: achievementIconPromises.length, progress: `${Math.round((completed / achievementIconPromises.length) * 100)}%` }, 'Achievement icon download progress');
      }
      return result;
    });
    
    const achievementIconResults = await Promise.all(progressPromises);
    const achievementIconMap = new Map(
      achievementIconResults.map((r) => [`${r.appId}:${r.achievementId}`, { iconPath: r.iconPath, iconGrayPath: r.iconGrayPath }])
    );

    logger.info(
      { 
        totalAchievements: result.achievements.length,
        iconMapSize: achievementIconMap.size,
        sampleIcons: Array.from(achievementIconMap.entries()).slice(0, 3)
      }, 
      'Achievement icon download completed'
    );

    // Upsert achievements with downloaded icons
    const achievementUpserts: Promise<any>[] = [];

    for (const achievement of result.achievements) {
      const game = await Game.findOne({
        profileId: profile._id,
        gameId: achievement.appId.toString(),
      });
      if (!game) continue;

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

      achievementUpserts.push(
        Achievement.findOneAndUpdate(
          { gameId: game._id, achievementId: achievement.achievementId },
          {
            $set: updateFields,
          },
          { upsert: true, new: true }
        )
      );
    }

    await Promise.all(achievementUpserts);
  }
}

export const syncService = new SyncService();
