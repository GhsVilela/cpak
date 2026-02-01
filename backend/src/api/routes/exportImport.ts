import { FastifyRequest, FastifyReply } from 'fastify';
import { Profile } from '../../models/profile.js';
import { Game } from '../../models/game.js';
import { Achievement } from '../../models/achievement.js';
import { Settings } from '../../models/settings.js';
import { logger } from '../../utils/logger.js';

interface ExportData {
  version: string;
  exportedAt: string;
  profiles: any[];
  games: any[];
  achievements: any[];
  settings: any | null;
}

/**
 * Export all data as JSON backup
 */
export async function exportData(
  req: FastifyRequest,
  reply: FastifyReply
) {
  try {
    logger.info('[Export] Starting data export');

    const [profiles, games, achievements, settings] = await Promise.all([
      Profile.find().lean(),
      Game.find().lean(),
      Achievement.find().lean(),
      Settings.findOne().lean()
    ]);

    const exportData: ExportData = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      profiles,
      games,
      achievements,
      settings
    };

    logger.info(`[Export] Exported ${profiles.length} profiles, ${games.length} games, ${achievements.length} achievements`);

    reply
      .header('Content-Type', 'application/json')
      .header('Content-Disposition', `attachment; filename="cpak-backup-${Date.now()}.json"`)
      .send(exportData);
  } catch (error) {
    logger.error({ error }, '[Export] Failed to export data');
    reply.status(500).send({ error: 'Failed to export data' });
  }
}

/**
 * Import data from JSON backup
 */
export async function importData(
  req: FastifyRequest<{ Body: ExportData }>,
  reply: FastifyReply
) {
  try {
    const data = req.body;

    if (!data || !data.version) {
      return reply.status(400).send({ error: 'Invalid import data format' });
    }

    logger.info('[Import] Starting data import');
    logger.info(`[Import] Version: ${data.version}, Exported at: ${data.exportedAt}`);

    let imported = {
      profiles: 0,
      games: 0,
      achievements: 0,
      settings: false
    };

    // Import profiles
    if (data.profiles && Array.isArray(data.profiles)) {
      for (const profile of data.profiles) {
        await Profile.findOneAndUpdate(
          { platform: profile.platform, profileId: profile.profileId },
          profile,
          { upsert: true, new: true }
        );
        imported.profiles++;
      }
    }

    // Import games
    if (data.games && Array.isArray(data.games)) {
      for (const game of data.games) {
        await Game.findOneAndUpdate(
          { platform: game.platform, profileId: game.profileId, gameId: game.gameId },
          game,
          { upsert: true, new: true }
        );
        imported.games++;
      }
    }

    // Import achievements
    if (data.achievements && Array.isArray(data.achievements)) {
      for (const achievement of data.achievements) {
        await Achievement.findOneAndUpdate(
          { 
            platform: achievement.platform, 
            profileId: achievement.profileId, 
            gameId: achievement.gameId,
            achievementId: achievement.achievementId
          },
          achievement,
          { upsert: true, new: true }
        );
        imported.achievements++;
      }
    }

    // Import settings (overwrite existing)
    if (data.settings) {
      await Settings.findOneAndUpdate(
        {},
        data.settings,
        { upsert: true, new: true }
      );
      imported.settings = true;
    }

    logger.info(`[Import] Imported ${imported.profiles} profiles, ${imported.games} games, ${imported.achievements} achievements`);

    reply.send({
      success: true,
      imported
    });
  } catch (error) {
    logger.error({ error }, '[Import] Failed to import data');
    reply.status(500).send({ error: 'Failed to import data' });
  }
}
