import { FastifyRequest, FastifyReply } from 'fastify';
import { Profile } from '../../models/profile.js';
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

export async function createProfile(req: FastifyRequest, reply: FastifyReply) {
  try {
    const body = profileSchema.parse(req.body);
    logger.info({ body }, 'Creating/updating profile');
    
    // Use findOneAndUpdate with upsert to handle both create and update
    const profile = await Profile.findOneAndUpdate(
      {
        platform: body.platform,
        profileId: body.profileId,
      },
      {
        $set: {
          platform: body.platform,
          profileId: body.profileId,
          displayName: body.displayName || `${body.platform} User ${body.profileId}`,
          credentials: body.credentials || {},
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    );

    const response = profile.toObject() as any;
    delete response.credentials;
    reply.status(201).send(response);
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

    const profile = await Profile.findByIdAndUpdate(id, body, { new: true }).select('-credentials');
    if (!profile) {
      return reply.status(404).send({ error: 'Profile not found' });
    }

    reply.send(profile);
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
    const profile = await Profile.findByIdAndDelete(id);
    if (!profile) {
      return reply.status(404).send({ error: 'Profile not found' });
    }

    reply.status(204).send();
  } catch (error) {
    logger.error({ error }, 'Failed to delete profile');
    reply.status(500).send({ error: 'Internal server error' });
  }
}
