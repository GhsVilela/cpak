import { FastifyRequest, FastifyReply } from 'fastify';
import { Settings } from '../../models/settings.js';
import { logger } from '../../utils/logger.js';

interface UpdateSettingsBody {
  steamGridApiKey?: string;
}

export async function getSettings(
  req: FastifyRequest,
  reply: FastifyReply
) {
  try {
    let settings = await Settings.findById('global').lean();
    
    // Create default settings if none exist
    if (!settings) {
      settings = await Settings.create({ _id: 'global' });
    }

    reply.send(settings);
  } catch (error) {
    logger.error({ error }, 'Failed to fetch settings');
    reply.status(500).send({ error: 'Internal server error' });
  }
}

export async function updateSettings(
  req: FastifyRequest<{ Body: UpdateSettingsBody }>,
  reply: FastifyReply
) {
  try {
    const updates = req.body;

    // Ensure settings document exists
    let settings = await Settings.findById('global');
    if (!settings) {
      settings = await Settings.create({ _id: 'global', ...updates });
    } else {
      // Update fields
      if (updates.steamGridApiKey !== undefined) {
        settings.steamGridApiKey = updates.steamGridApiKey;
      }
      await settings.save();
    }

    reply.send(settings);
  } catch (error) {
    logger.error({ error }, 'Failed to update settings');
    reply.status(500).send({ error: 'Internal server error' });
  }
}
