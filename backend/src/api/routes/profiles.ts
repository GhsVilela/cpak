import { FastifyRequest, FastifyReply } from 'fastify';
import { Profile } from '../../models/profile.js';
import { Game } from '../../models/game.js';
import { Achievement } from '../../models/achievement.js';
import { SyncRun } from '../../models/syncRun.js';
import { logger } from '../../utils/logger.js';
import { z } from 'zod';

const profileSchema = z.object({
  platform: z.enum(['steam', 'xbox', 'playstation']),
  profileId: z.string().min(1),
  displayName: z.string().optional(),
  credentials: z.object({
    steamApiKey: z.string().optional(),
    xboxRefreshToken: z.string().optional(),
    psnRefreshToken: z.string().optional(),
  }).optional(),
});

const updateProfileSchema = z.object({
  displayName: z.string().optional(),
  credentials: z.object({
    steamApiKey: z.string().optional(),
    xboxRefreshToken: z.string().optional(),
    psnRefreshToken: z.string().optional(),
  }).optional(),
});

export async function getProfiles(req: FastifyRequest, reply: FastifyReply) {
  try {
    const profiles = await Profile.find().select('-credentials').lean();
    reply.send(profiles);
  } catch (error) {
    logger.error({ error }, 'Failed to fetch profiles');
    reply.status(500).send({ error: 'Internal server error' });
  }
}

export async function getProfileById(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const { id } = req.params;
    const profile = await Profile.findById(id);
    if (!profile) {
      return reply.status(404).send({ error: 'Profile not found' });
    }

    // toJSON is called automatically by reply.send
    reply.send(profile);
  } catch (error) {
    logger.error({ error }, 'Failed to fetch profile');
    reply.status(500).send({ error: 'Internal server error' });
  }
}

export async function createProfile(req: FastifyRequest, reply: FastifyReply) {
  try {
    const body = profileSchema.parse(req.body);
    logger.info({ body }, 'Creating/updating profile');
    
    // Check if profile already exists
    let profile = await Profile.findOne({
      platform: body.platform,
      profileId: body.profileId,
    });

    if (profile) {
      // Update existing profile
      profile.displayName = body.displayName || profile.displayName;
      if (body.credentials) {
        profile.credentials = {
          ...profile.credentials,
          ...body.credentials,
        };
      }
    } else {
      // Create new profile
      profile = new Profile({
        platform: body.platform,
        profileId: body.profileId,
        displayName: body.displayName || `${body.platform} User ${body.profileId}`,
        credentials: body.credentials || {},
      });
    }

    // Save triggers pre-save hook for encryption
    await profile.save();

    // Return without credentials (toJSON is called automatically)
    reply.status(201).send(profile);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ error: 'Invalid request body', details: error.errors });
    }
    logger.error({ error }, 'Failed to create profile');
    reply.status(500).send({ error: 'Internal server error' });
  }
}

export async function updateProfile(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const { id } = req.params;
    const body = updateProfileSchema.parse(req.body);

    // Find profile first to trigger pre-save hooks
    const profile = await Profile.findById(id);
    if (!profile) {
      return reply.status(404).send({ error: 'Profile not found' });
    }

    // Update fields
    if (body.displayName !== undefined) {
      profile.displayName = body.displayName;
    }

    // Update credentials - merge with existing to preserve other fields
    if (body.credentials) {
      profile.credentials = {
        ...profile.credentials,
        ...body.credentials,
      };
    }

    // Save triggers pre-save hook for encryption
    await profile.save();

    // Return without credentials
    const profileObj = profile.toJSON();
    reply.send(profileObj);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ error: 'Invalid request body', details: error.errors });
    }
    logger.error({ error }, 'Failed to update profile');
    reply.status(500).send({ error: 'Internal server error' });
  }
}

export async function deleteProfile(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  try {
    const { id } = req.params;
    const profile = await Profile.findById(id);
    if (!profile) {
      return reply.status(404).send({ error: 'Profile not found' });
    }

    // Cascade delete: Remove all related data
    const [gamesDeleted, achievementsDeleted, syncRunsDeleted] = await Promise.all([
      Game.deleteMany({ profileId: id }),
      Achievement.deleteMany({ profileId: id }),
      SyncRun.deleteMany({ profileId: id }),
    ]);

    // Delete the profile itself
    await Profile.findByIdAndDelete(id);

    logger.info(
      { 
        profileId: id, 
        gamesDeleted: gamesDeleted.deletedCount,
        achievementsDeleted: achievementsDeleted.deletedCount,
        syncRunsDeleted: syncRunsDeleted.deletedCount 
      }, 
      'Profile and related data deleted'
    );

    reply.status(204).send();
  } catch (error) {
    logger.error({ error }, 'Failed to delete profile');
    reply.status(500).send({ error: 'Internal server error' });
  }
}
