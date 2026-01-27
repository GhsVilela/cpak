import { Profile, IProfile } from '../models/profile.js';
import { Game } from '../models/game.js';
import { Achievement } from '../models/achievement.js';
import { SyncRun } from '../models/syncRun.js';
import { createSteamAdapter } from './adapters/steam.js';
import { createSteamGridDBAdapter } from './adapters/steamgriddb.js';
import { logger } from '../utils/logger.js';
import { iconStorage } from '../utils/iconStorage.js';

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
    const result = await steamAdapter.syncGamesAndAchievements(profile.profileId);

    // Try to use SteamGridDB for game images, fallback to Steam icons
    const steamGridDBAdapter = await createSteamGridDBAdapter();
    const iconConcurrency = parseInt(process.env.ICON_DOWNLOAD_CONCURRENCY || '5', 10);

    // Download game images in parallel batches
    const gameImagePromises: Promise<{ appId: number; imagePath?: string }>[] = [];

    for (const game of result.games) {
      const promise = (async () => {
        let imagePath: string | undefined;

        // Try SteamGridDB first if available
        if (steamGridDBAdapter) {
          try {
            imagePath = await steamGridDBAdapter.downloadGameImage(game.appId) || undefined;
          } catch (error) {
            logger.warn({ error, appId: game.appId }, 'SteamGridDB download failed, will try Steam icon');
          }
        }

        // Fallback to Steam icon if SteamGridDB failed or unavailable
        if (!imagePath && game.iconHash) {
          try {
            const iconUrl = `https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/${game.appId}/${game.iconHash}.jpg`;
            imagePath = await iconStorage.downloadAndStore(
              iconUrl,
              'steam',
              game.appId.toString(),
              'game',
              'icon'
            );
          } catch (error) {
            logger.warn({ error, appId: game.appId }, 'Failed to download game icon');
          }
        }

        return { appId: game.appId, imagePath };
      })();

      gameImagePromises.push(promise);

      // Process in batches
      if (gameImagePromises.length >= iconConcurrency) {
        await Promise.all(gameImagePromises.splice(0, iconConcurrency));
      }
    }

    // Wait for remaining image downloads
    const gameImageResults = await Promise.all(gameImagePromises);
    const gameImageMap = new Map(gameImageResults.map((r) => [r.appId, r.imagePath]));

    // Upsert games with downloaded images
    await Promise.all(
      result.games.map((game) =>
        Game.findOneAndUpdate(
          { profileId: profile._id, gameId: game.appId.toString() },
          {
            $set: {
              platform: 'steam',
              title: game.name,
              achievementsTotal: game.totalAchievements,
              achievementsUnlocked: game.earnedAchievements,
              completionPercent:
                game.totalAchievements > 0
                  ? Math.round((game.earnedAchievements / game.totalAchievements) * 100)
                  : 0,
              iconPath: gameImageMap.get(game.appId),
              lastSyncedAt: new Date(),
            },
          },
          { upsert: true, new: true }
        )
      )
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

    // Download achievement icons in parallel batches
    const achievementIconPromises: Promise<{
      appId: number;
      achievementId: string;
      iconPath?: string;
      iconGrayPath?: string;
    }>[] = [];

    for (const achievement of result.achievements) {
      const promise = (async () => {
        const downloads: Promise<string | undefined>[] = [];

        if (achievement.icon) {
          downloads.push(
            iconStorage
              .downloadAndStore(
                achievement.icon,
                'steam',
                achievement.appId.toString(),
                achievement.achievementId,
                'icon'
              )
              .catch((error) => {
                logger.warn({ error, achievementId: achievement.achievementId }, 'Failed to download icon');
                return undefined;
              })
          );
        } else {
          downloads.push(Promise.resolve(undefined));
        }

        if (achievement.iconGray) {
          downloads.push(
            iconStorage
              .downloadAndStore(
                achievement.iconGray,
                'steam',
                achievement.appId.toString(),
                achievement.achievementId,
                'iconGray'
              )
              .catch((error) => {
                logger.warn({ error, achievementId: achievement.achievementId }, 'Failed to download iconGray');
                return undefined;
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
      })();

      achievementIconPromises.push(promise);

      // Process in batches
      if (achievementIconPromises.length >= iconConcurrency) {
        await Promise.all(achievementIconPromises.splice(0, iconConcurrency));
      }
    }

    // Wait for remaining icon downloads
    const achievementIconResults = await Promise.all(achievementIconPromises);
    const achievementIconMap = new Map(
      achievementIconResults.map((r) => [`${r.appId}:${r.achievementId}`, { iconPath: r.iconPath, iconGrayPath: r.iconGrayPath }])
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

      achievementUpserts.push(
        Achievement.findOneAndUpdate(
          { gameId: game._id, achievementId: achievement.achievementId },
          {
            $set: {
              platform: 'steam',
              profileId: profile._id,
              name: achievement.name,
              description: achievement.description,
              unlockedAt: achievement.unlocked ? achievement.unlockTime : undefined,
              iconPath: icons?.iconPath,
              iconGrayPath: icons?.iconGrayPath,
            },
          },
          { upsert: true, new: true }
        )
      );
    }

    await Promise.all(achievementUpserts);
  }
}

export const syncService = new SyncService();
