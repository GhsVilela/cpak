import { FastifyRequest, FastifyReply } from 'fastify';
import { Profile, IProfile } from '../../models/profile.js';
import { syncService } from '../../services/syncService.js';
import { logger } from '../../utils/logger.js';

interface SyncParams {
  platform: 'steam' | 'xbox' | 'playstation';
}

export async function triggerSync(
  req: FastifyRequest<{ Params: SyncParams; Querystring: { profileId?: string } }>,
  reply: FastifyReply
) {
  try {
    const { platform } = req.params;
    const { profileId } = req.query;

    // Validate platform
    if (!['steam', 'xbox', 'playstation'].includes(platform)) {
      return reply.status(400).send({ error: 'Invalid platform' });
    }

    // If profileId specified, sync only that profile (profileId is the MongoDB _id)
    if (profileId) {
      const profile = await Profile.findById(profileId);
      if (!profile) {
        return reply.status(404).send({ error: 'Profile not found' });
      }

      // Verify platform matches
      if (profile.platform !== platform) {
        return reply.status(400).send({ error: 'Platform mismatch' });
      }

      logger.info({ platform, profileId: profile.profileId, _id: profileId }, 'Starting sync for profile');
      syncService.syncProfile(profile).catch((error) => {
        logger.error({ error, platform, profileId: profile.profileId }, 'Sync failed');
      });

      return reply.send({ message: 'Sync started', platform, profileId: profile.profileId });
    }

    // Otherwise, sync all profiles for the platform
    const profiles = await Profile.find({ platform });
    if (profiles.length === 0) {
      return reply.status(404).send({ error: 'No profiles found for platform' });
    }

    logger.info({ platform, count: profiles.length }, 'Starting sync for all profiles');
    profiles.forEach((profile) => {
      syncService.syncProfile(profile).catch((error) => {
        logger.error({ error, platform, profileId: profile._id }, 'Sync failed');
      });
    });

    reply.send({ message: 'Sync started', platform, count: profiles.length });
  } catch (error) {
    logger.error({ error }, 'Failed to trigger sync');
    reply.status(500).send({ error: 'Internal server error' });
  }
}
