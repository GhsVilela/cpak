import { Profile, IProfile } from '../models/profile.js';
import { Game } from '../models/game.js';
import { Achievement } from '../models/achievement.js';
import { SyncRun } from '../models/syncRun.js';
import { createSteamAdapter } from './adapters/steam.js';
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

    // Upsert games
    for (const game of result.games) {
      // Download and store game icon if available
      let iconPath: string | undefined;
      if (game.iconHash) {
        try {
          const iconUrl = `https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/${game.appId}/${game.iconHash}.jpg`;
          iconPath = await iconStorage.downloadAndStore(
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

      await Game.findOneAndUpdate(
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
            iconPath,
            lastSyncedAt: new Date(),
          },
        },
        { upsert: true, new: true }
      );
    }

    // Upsert achievements
    for (const achievement of result.achievements) {
      const game = await Game.findOne({
        profileId: profile._id,
        gameId: achievement.appId.toString(),
      });
      if (!game) continue;

      // Download and store icons if available
      let iconPath: string | undefined;
      let iconGrayPath: string | undefined;

      if (achievement.icon) {
        try {
          iconPath = await iconStorage.downloadAndStore(
            achievement.icon,
            'steam',
            achievement.appId.toString(),
            achievement.achievementId,
            'icon'
          );
        } catch (error) {
          logger.warn({ error, achievementId: achievement.achievementId }, 'Failed to download icon');
        }
      }

      if (achievement.iconGray) {
        try {
          iconGrayPath = await iconStorage.downloadAndStore(
            achievement.iconGray,
            'steam',
            achievement.appId.toString(),
            achievement.achievementId,
            'iconGray'
          );
        } catch (error) {
          logger.warn({ error, achievementId: achievement.achievementId }, 'Failed to download iconGray');
        }
      }

      await Achievement.findOneAndUpdate(
        { gameId: game._id, achievementId: achievement.achievementId },
        {
          $set: {
            platform: 'steam',
            profileId: profile._id,
            name: achievement.name,
            description: achievement.description,
            unlockedAt: achievement.unlocked ? achievement.unlockTime : undefined,
            iconPath,
            iconGrayPath,
          },
        },
        { upsert: true, new: true }
      );
    }
  }
}

export const syncService = new SyncService();
