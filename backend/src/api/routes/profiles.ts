import { FastifyRequest, FastifyReply } from 'fastify';
import { Profile } from '../../models/profile.js';
import { Game } from '../../models/game.js';
import { Achievement } from '../../models/achievement.js';
import { SyncRun } from '../../models/syncRun.js';
import { logger } from '../../utils/logger.js';
import { z } from 'zod';
import { createPlayStationAdapter } from '../../services/adapters/playstation.js';

const profileSchema = z.object({
  platform: z.enum(['steam', 'xbox', 'playstation']),
  profileId: z.string().min(1).optional(),
  displayName: z.string().optional(),
  /** PlayStation only: NPSSO token to exchange for OAuth credentials */
  npssoToken: z.string().optional(),
  credentials: z.object({
    steamApiKey: z.string().optional(),
    xboxRefreshToken: z.string().optional(),
    psnRefreshToken: z.string().optional(),
    // OAuth generic credential fields (used by Xbox OAuth flow)
    refreshToken: z.string().optional(),
    tokenType: z.string().optional(),
    expiresAt: z.coerce.date().optional(),
    scopes: z.array(z.string()).optional(),
  }).optional(),
});

const updateProfileSchema = z.object({
  displayName: z.string().optional(),
  npssoToken: z.string().optional(),
  credentials: z.object({
    steamApiKey: z.string().optional(),
    xboxRefreshToken: z.string().optional(),
    psnRefreshToken: z.string().optional(),
    refreshToken: z.string().optional(),
    tokenType: z.string().optional(),
    expiresAt: z.coerce.date().optional(),
    scopes: z.array(z.string()).optional(),
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
    logger.info({ platform: body.platform }, 'Creating/updating profile');

    // PlayStation: if npssoToken is provided, exchange it for OAuth tokens
    if (body.platform === 'playstation' && (body as any).npssoToken) {
      const npssoToken = (body as any).npssoToken as string;
      const adapter = createPlayStationAdapter();

      let psnTokens: Awaited<ReturnType<typeof adapter.exchangeNpssoForTokens>>;
      let psnProfile: Awaited<ReturnType<typeof adapter.getProfile>>;

      try {
        psnTokens = await adapter.exchangeNpssoForTokens(npssoToken);
        psnProfile = await adapter.getProfile(psnTokens.accessToken, 'me');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Token exchange failed';
        logger.warn({ error: message }, 'PlayStation NPSSO token exchange failed during profile creation');
        return reply.status(400).send({
          error: 'Invalid NPSSO token. Please obtain a new token from https://ca.account.sony.com/api/v1/ssocookie',
        });
      }

      // Check for existing profile with this PSN account ID
      const existingProfile = await Profile.findOne({
        platform: 'playstation',
        profileId: psnProfile.accountId,
      });

      if (existingProfile) {
        return reply.status(409).send({
          error: 'Profile already exists for this PlayStation account',
        });
      }

      const profile = new Profile({
        platform: 'playstation',
        profileId: psnProfile.accountId,
        displayName: psnProfile.onlineId,
        credentials: {
          accessToken: psnTokens.accessToken,
          refreshToken: psnTokens.refreshToken,
          expiresAt: psnTokens.expiresAt,
          tokenType: psnTokens.tokenType,
        },
      });

      await profile.save();
      logger.info({ onlineId: psnProfile.onlineId, accountId: psnProfile.accountId }, 'PlayStation profile created');
      return reply.status(201).send(profile);
    }

    // Non-PlayStation (or PlayStation with raw credentials directly)
    if (!body.profileId) {
      return reply.status(400).send({ error: 'profileId is required' });
    }

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
        profile.markModified('credentials');
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

    // PlayStation: if npssoToken is provided, exchange it for fresh OAuth tokens
    if (body.npssoToken && profile.platform === 'playstation') {
      const adapter = createPlayStationAdapter();
      try {
        const psnTokens = await adapter.exchangeNpssoForTokens(body.npssoToken);
        const psnProfile = await adapter.getProfile(psnTokens.accessToken, 'me');
        profile.credentials = {
          ...profile.credentials,
          accessToken: psnTokens.accessToken,
          refreshToken: psnTokens.refreshToken,
          expiresAt: psnTokens.expiresAt,
          tokenType: psnTokens.tokenType,
        } as any;
        // Update profileId and displayName in case they changed
        profile.profileId = psnProfile.accountId;
        profile.displayName = body.displayName ?? psnProfile.onlineId;
        logger.info({ accountId: psnProfile.accountId }, 'PlayStation profile re-authenticated via NPSSO');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn({ error: message }, 'NPSSO token exchange failed during profile update');
        return reply.status(400).send({
          error: `NPSSO token is invalid or expired. Obtain a new one from https://ca.account.sony.com/api/v1/ssocookie`,
        });
      }
    }

    // Update credentials - merge with existing to preserve other fields
    if (body.credentials) {
      profile.credentials = {
        ...profile.credentials,
        ...body.credentials,
      };
    }

    // Ensure Mongoose detects Mixed type changes for encryption hook
    profile.markModified('credentials');

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
