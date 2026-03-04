import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { Profile } from '../../models/profile.js';
import { createXboxAdapter } from '../../services/adapters/xbox.js';
import { configService } from '../../services/configService.js';
import { syncService } from '../../services/syncService.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const refreshBodySchema = z.object({
  profileId: z.string().min(1, 'profileId is required'),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the state parameter: base64-encoded JSON with CSRF token + redirectTo.
 */
function buildState(redirectTo: string): string {
  const payload = { redirectTo, csrf: Math.random().toString(36).slice(2) };
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

/**
 * Parse and validate the state parameter.
 * Returns { redirectTo, csrf } or throws.
 */
function parseState(state: string): { redirectTo: string; csrf: string } {
  try {
    const decoded = Buffer.from(state, 'base64').toString('utf-8');
    const parsed = JSON.parse(decoded);
    return {
      redirectTo: parsed.redirectTo || '/setup',
      csrf: parsed.csrf || '',
    };
  } catch {
    return { redirectTo: '/setup', csrf: '' };
  }
}

/**
 * Fetch required Xbox OAuth settings from the database.
 * Returns null if any required setting is missing.
 */
async function getXboxOAuthSettings(): Promise<{
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} | null> {
  const [clientId, clientSecret, redirectUri] = await Promise.all([
    configService.getSetting('xbox_client_id'),
    configService.getSetting('xbox_client_secret'),
    configService.getSetting('xbox_redirect_uri'),
  ]);

  if (!clientId || !clientSecret || !redirectUri) {
    return null;
  }

  return { clientId, clientSecret, redirectUri };
}

// ---------------------------------------------------------------------------
// Xbox OAuth Authentication Routes
// Registered at /api/auth/xbox/ by routes/index.ts
// ---------------------------------------------------------------------------

export async function xboxAuthRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/auth/xbox/url
   * Returns the Microsoft OAuth authorization URL.
   */
  fastify.get('/url', async (
    req: FastifyRequest<{ Querystring: { redirectTo?: string } }>,
    reply: FastifyReply,
  ) => {
    const settings = await getXboxOAuthSettings();
    if (!settings) {
      return reply.status(400).send({
        error: 'Xbox OAuth not configured. Please set xbox_client_id and xbox_client_secret in Settings.',
      });
    }

    const redirectTo = req.query.redirectTo || '/setup';
    const state = buildState(redirectTo);

    const adapter = createXboxAdapter();
    const url = adapter.getAuthorizeUrl(settings.clientId, settings.redirectUri, state);

    return reply.send({ url });
  });

  /**
   * GET /api/auth/xbox/callback
   * Microsoft redirects here after user authentication.
   * Exchanges the code for tokens, creates/updates the Xbox profile, and redirects.
   */
  fastify.get('/callback', async (
    req: FastifyRequest<{
      Querystring: {
        code?: string;
        state?: string;
        error?: string;
        error_description?: string;
      };
    }>,
    reply: FastifyReply,
  ) => {
    const { code, state, error, error_description } = req.query;
    const { redirectTo } = parseState(state || '');

    // Handle OAuth errors from Microsoft
    if (error) {
      logger.warn({ error, error_description }, 'Xbox OAuth callback received error');
      const redirectUrl = `${redirectTo}?error=xbox_auth_failed&message=${encodeURIComponent(error_description || error)}`;
      return reply.redirect(redirectUrl, 302);
    }

    if (!code) {
      return reply.redirect(`${redirectTo}?error=xbox_auth_failed&message=${encodeURIComponent('No authorization code received')}`, 302);
    }

    try {
      const settings = await getXboxOAuthSettings();
      if (!settings) {
        return reply.redirect(`${redirectTo}?error=xbox_auth_failed&message=${encodeURIComponent('Xbox OAuth not configured')}`, 302);
      }

      const adapter = createXboxAdapter();

      // Exchange authorization code for token bundle
      const tokenBundle = await adapter.exchangeCodeForTokens(
        code,
        settings.clientId,
        settings.clientSecret,
        settings.redirectUri,
      );

      // Fetch Xbox profile (gamertag, avatar)
      const xboxProfile = await adapter.getXboxProfile(
        tokenBundle.xuid,
        tokenBundle.xstsToken,
        tokenBundle.userHash,
      );

      // Create or update Profile document (upsert by XUID)
      const credentials = {
        refreshToken: tokenBundle.refreshToken || undefined,
        accessToken: tokenBundle.xstsToken, // Store XSTS token as accessToken
        tokenType: 'xbox',
        expiresAt: tokenBundle.expiresAt,
        scopes: ['XboxLive.signin', 'XboxLive.offline_access'],
      };

      let profile = await Profile.findOne({ platform: 'xbox', profileId: xboxProfile.xuid });
      let isNewProfile = false;
      if (profile) {
        // Update existing profile
        profile.displayName = xboxProfile.gamertag;
        profile.credentials = { ...profile.credentials, ...credentials };
        await profile.save();
        logger.info({ profileId: xboxProfile.xuid, gamertag: xboxProfile.gamertag }, 'Updated existing Xbox profile');
      } else {
        // Create new profile
        profile = new Profile({
          platform: 'xbox',
          profileId: xboxProfile.xuid,
          displayName: xboxProfile.gamertag,
          credentials,
        });
        await profile.save();
        isNewProfile = true;
        logger.info({ profileId: xboxProfile.xuid, gamertag: xboxProfile.gamertag }, 'Created new Xbox profile');
      }

      // Auto-start sync for new profiles (fire-and-forget)
      if (isNewProfile) {
        syncService.syncProfile(profile).catch((err) => {
          logger.warn({ err, profileId: xboxProfile.xuid }, 'Auto-sync after new Xbox profile add failed');
        });
      }

      const redirectUrl = `${redirectTo}?profileId=${profile._id}&success=true`;
      return reply.redirect(redirectUrl, 302);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      logger.error({ error: err }, 'Xbox OAuth callback failed');
      return reply.redirect(`${redirectTo}?error=xbox_auth_failed&message=${encodeURIComponent(message)}`, 302);
    }
  });

  /**
   * POST /api/auth/xbox/refresh
   * Manually trigger token refresh for an Xbox profile.
   * Returns 401 with authUrl when re-authentication is required.
   */
  fastify.post('/refresh', async (
    req: FastifyRequest,
    reply: FastifyReply,
  ) => {
    let body: z.infer<typeof refreshBodySchema>;
    try {
      body = refreshBodySchema.parse(req.body);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.status(400).send({ error: 'profileId is required', details: err.errors });
      }
      return reply.status(400).send({ error: 'Invalid request body' });
    }

    const { profileId } = body;

    // Find the profile
    const profile = await Profile.findById(profileId);
    if (!profile) {
      return reply.status(404).send({ error: 'Profile not found' });
    }

    if (profile.platform !== 'xbox') {
      return reply.status(400).send({ error: 'Profile is not an Xbox profile' });
    }

    const creds = profile.getDecryptedCredentials();
    if (!creds.refreshToken) {
      // Re-auth required — generate new auth URL
      const settings = await getXboxOAuthSettings();
      const authUrl = settings
        ? createXboxAdapter().getAuthorizeUrl(settings.clientId, settings.redirectUri)
        : null;
      return reply.status(401).send({
        error: 'Xbox re-authentication required',
        ...(authUrl ? { authUrl } : {}),
      });
    }

    try {
      const settings = await getXboxOAuthSettings();
      if (!settings) {
        return reply.status(500).send({ error: 'Xbox OAuth not configured' });
      }

      const adapter = createXboxAdapter();
      const tokenBundle = await adapter.refreshXboxTokens(
        creds.refreshToken,
        settings.clientId,
        settings.clientSecret,
      );

      // Update stored credentials with new tokens
      profile.credentials = {
        ...profile.credentials,
        refreshToken: tokenBundle.refreshToken || creds.refreshToken, // Keep old refresh if new one not provided
        accessToken: tokenBundle.xstsToken,
        tokenType: 'xbox',
        expiresAt: tokenBundle.expiresAt,
      };
      await profile.save();

      logger.info({ profileId: profile.profileId }, 'Xbox tokens refreshed successfully');
      return reply.send({ success: true, expiresAt: tokenBundle.expiresAt.toISOString() });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Token refresh failed';
      logger.warn({ error: err, profileId }, 'Xbox token refresh failed — re-auth may be required');

      // If refresh fails due to expired/revoked token, return 401 with re-auth URL
      const settings = await getXboxOAuthSettings();
      const authUrl = settings
        ? createXboxAdapter().getAuthorizeUrl(settings.clientId, settings.redirectUri)
        : null;

      return reply.status(401).send({
        error: 'Xbox re-authentication required',
        ...(authUrl ? { authUrl } : {}),
      });
    }
  });
}
