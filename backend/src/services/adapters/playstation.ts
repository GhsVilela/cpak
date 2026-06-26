/**
 * PlayStation Network (PSN) Adapter
 *
 * Handles authentication (NPSSO → OAuth token exchange), profile fetching,
 * trophy title listing, trophy definitions, earned status, image downloading,
 * and platform generation mapping.
 *
 * Uses the `psn-api` npm package for all PSN API calls.
 */

import {
  exchangeNpssoForAccessCode,
  exchangeAccessCodeForAuthTokens,
  exchangeRefreshTokenForAuthTokens,
  getProfileFromAccountId,
  getUserTrophyProfileSummary,
  getUserTitles,
  getTitleTrophies,
  getUserTrophiesEarnedForTitle,
  type AuthTokensResponse,
  type TrophyTitle,
  type Trophy,
} from 'psn-api';
import { logger } from '../../utils/logger.js';
import { imageStorage } from '../../utils/imageStorage.js';
import type { SteamGridDBAdapter } from './steamgriddb.js';
import { createIGDBAdapter } from './igdb.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PSNAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  tokenType: string;
}

export interface PSNProfile {
  accountId: string;
  onlineId: string;
  avatarUrl?: string;
}

export interface PSNTrophyTitle {
  npCommunicationId: string;
  npServiceName: 'trophy' | 'trophy2';
  title: string;
  imageUrl?: string;
  platform: string;
  /** Normalized array for `devices` field */
  devices: string[];
  definedTrophies: { bronze: number; silver: number; gold: number; platinum: number };
  earnedTrophies: { bronze: number; silver: number; gold: number; platinum: number };
  progress: number;
  lastUpdatedDateTime: string;
}

export interface PSNTrophyDetail {
  trophyId: string;
  name: string;
  description?: string;
  type: 'bronze' | 'silver' | 'gold' | 'platinum';
  iconUrl?: string;
  isHidden: boolean;
}

export interface PSNEarnedTrophy {
  trophyId: string;
  earned: boolean;
  earnedDateTime?: Date;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default delay between PSN API requests (ms) */
const DEFAULT_REQUEST_DELAY_MS = 200;
/** Initial backoff on rate limiting (ms) */
const RATE_LIMIT_INITIAL_BACKOFF_MS = 2_000;
/** Max retries on rate-limiting or transient errors */
const MAX_RETRIES = 3;

// ---------------------------------------------------------------------------
// Platform normalization
// ---------------------------------------------------------------------------

/**
 * Normalize the `trophyTitlePlatform` string from the PSN API into an array
 * of device strings usable by the `devices` field on the Game model.
 *
 * The PSN API may return a comma-separated string for cross-gen titles
 * (e.g. "PS4,PS5").
 */
export function normalizePlatform(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((p) => {
      const trimmed = p.trim().toUpperCase();
      switch (trimmed) {
        case 'PS3':    return 'PS3';
        case 'PS4':    return 'PS4';
        case 'PS5':    return 'PS5';
        case 'PSVITA':
        case 'PS VITA':
        case 'VITA':   return 'PSVita';
        default:       return trimmed;
      }
    })
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// PSN Adapter class
// ---------------------------------------------------------------------------

export class PlayStationAdapter {
  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------

  /**
   * Exchange an NPSSO token for OAuth access + refresh tokens.
   * The returned tokens should be stored encrypted; the raw NPSSO is discarded.
   */
  async exchangeNpssoForTokens(npssoToken: string): Promise<PSNAuthTokens> {
    const code = await exchangeNpssoForAccessCode(npssoToken);
    const tokens = await exchangeAccessCodeForAuthTokens(code);
    return this._mapTokenResponse(tokens);
  }

  /**
   * Refresh an expired access token using the stored refresh token.
   */
  async refreshAccessToken(refreshToken: string): Promise<PSNAuthTokens> {
    const tokens = await exchangeRefreshTokenForAuthTokens(refreshToken);
    // psn-api does not check HTTP error responses — if the refresh token is
    // invalid, Sony returns an error body and the library silently returns
    // undefined fields.  Detect this and throw explicitly.
    if (!tokens.accessToken || !tokens.refreshToken) {
      throw new Error('PSN refresh token is invalid or expired — re-authentication required');
    }
    return this._mapTokenResponse(tokens);
  }

  /**
   * Fetch the PSN profile for the given accountId (use "me" for the
   * authenticated user).
   */
  async getProfile(accessToken: string, accountId = 'me'): Promise<PSNProfile> {
    const auth = { accessToken };
    // The PSN User Profile API does not accept 'me' as an accountId.
    // Use getUserTrophyProfileSummary (which supports 'me') to resolve the
    // real numeric accountId first, then fetch the full profile.
    let resolvedAccountId = accountId;
    if (accountId === 'me') {
      const summary = await getUserTrophyProfileSummary(auth, 'me');
      resolvedAccountId = summary.accountId;
    }
    const profile = await getProfileFromAccountId(auth, resolvedAccountId);
    const avatarUrl = profile.avatars?.find((a) => a.size === 'xl')?.url
      ?? profile.avatars?.[0]?.url;
    return {
      accountId: resolvedAccountId,
      onlineId: profile.onlineId,
      avatarUrl,
    };
  }

  // -------------------------------------------------------------------------
  // Auth helper
  // -------------------------------------------------------------------------

  private _mapTokenResponse(tokens: AuthTokensResponse): PSNAuthTokens {
    const expiresAt = new Date(Date.now() + tokens.expiresIn * 1_000);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt,
      tokenType: tokens.tokenType,
    };
  }

  // -------------------------------------------------------------------------
  // Trophy title listing
  // -------------------------------------------------------------------------

  /**
   * Fetch all trophy titles (games with ≥1 earned trophy) for the account.
   * Paginates until all titles are retrieved.
   */
  async getTrophyTitles(accessToken: string, accountId = 'me'): Promise<PSNTrophyTitle[]> {
    const auth = { accessToken };
    const all: TrophyTitle[] = [];
    const LIMIT = 200;
    let offset = 0;

    while (true) {
      await this._sleep(DEFAULT_REQUEST_DELAY_MS);
      const response = await this._withRetry(() =>
        getUserTitles(auth, accountId, { limit: LIMIT, offset })
      );
      const titles = response.trophyTitles ?? [];
      all.push(...titles);
      if (all.length >= (response.totalItemCount ?? 0) || titles.length < LIMIT) {
        break;
      }
      offset += LIMIT;
    }

    // Filter to only titles where the user has earned at least one trophy
    return all
      .filter((t) => t.progress > 0 || (t.earnedTrophies && (
        (t.earnedTrophies.bronze ?? 0) +
        (t.earnedTrophies.silver ?? 0) +
        (t.earnedTrophies.gold ?? 0) +
        (t.earnedTrophies.platinum ?? 0)
      ) > 0))
      .map((t) => ({
        npCommunicationId: t.npCommunicationId,
        npServiceName: t.npServiceName,
        title: t.trophyTitleName,
        imageUrl: t.trophyTitleIconUrl,
        platform: t.trophyTitlePlatform as string,
        devices: normalizePlatform(t.trophyTitlePlatform as string),
        definedTrophies: {
          bronze: t.definedTrophies?.bronze ?? 0,
          silver: t.definedTrophies?.silver ?? 0,
          gold: t.definedTrophies?.gold ?? 0,
          platinum: t.definedTrophies?.platinum ?? 0,
        },
        earnedTrophies: {
          bronze: t.earnedTrophies?.bronze ?? 0,
          silver: t.earnedTrophies?.silver ?? 0,
          gold: t.earnedTrophies?.gold ?? 0,
          platinum: t.earnedTrophies?.platinum ?? 0,
        },
        progress: t.progress,
        lastUpdatedDateTime: t.lastUpdatedDateTime,
      }));
  }

  // -------------------------------------------------------------------------
  // Trophy definitions
  // -------------------------------------------------------------------------

  /**
   * Fetch trophy definitions for a title (name, description, type, icon, hidden flag).
   * Uses npServiceName to determine PS3/PS4/Vita vs PS5 service.
   */
  async getTrophyDefinitions(
    accessToken: string,
    npCommunicationId: string,
    npServiceName: 'trophy' | 'trophy2',
  ): Promise<PSNTrophyDetail[]> {
    const auth = { accessToken };
    await this._sleep(DEFAULT_REQUEST_DELAY_MS);
    const response = await this._withRetry(() =>
      getTitleTrophies(auth, npCommunicationId, 'all', {
        npServiceName: npServiceName === 'trophy' ? 'trophy' : undefined,
      })
    );

    const trophies: Trophy[] = response.trophies ?? [];
    return trophies.map((t) => ({
      trophyId: String(t.trophyId),
      name: t.trophyName ?? (t.trophyHidden ? 'Hidden Trophy' : 'Unknown Trophy'),
      description: t.trophyDetail,
      type: (t.trophyType as 'bronze' | 'silver' | 'gold' | 'platinum') ?? 'bronze',
      iconUrl: t.trophyIconUrl,
      isHidden: t.trophyHidden ?? false,
    }));
  }

  // -------------------------------------------------------------------------
  // Earned status
  // -------------------------------------------------------------------------

  /**
   * Fetch which trophies the user has earned for a specific title.
   */
  async getEarnedTrophies(
    accessToken: string,
    accountId: string,
    npCommunicationId: string,
    npServiceName: 'trophy' | 'trophy2',
  ): Promise<PSNEarnedTrophy[]> {
    const auth = { accessToken };
    await this._sleep(DEFAULT_REQUEST_DELAY_MS);
    const response = await this._withRetry(() =>
      getUserTrophiesEarnedForTitle(auth, accountId, npCommunicationId, 'all', {
        npServiceName: npServiceName === 'trophy' ? 'trophy' : undefined,
      })
    );

    const trophies = response.trophies ?? [];
    return trophies.map((t) => ({
      trophyId: String(t.trophyId),
      earned: t.earned ?? false,
      earnedDateTime: t.earnedDateTime ? new Date(t.earnedDateTime) : undefined,
    }));
  }

  // -------------------------------------------------------------------------
  // Image downloading
  // -------------------------------------------------------------------------

  /**
   * Download game cover art from PlayStation CDN with fallback chain.
   * Stores under images/playstation/{npCommunicationId}/game_grid.{ext}
   */
  async downloadGameImage(
    gameTitle: string,
    npCommunicationId: string,
    trophyTitleIconUrl?: string,
    steamGridDB?: SteamGridDBAdapter,
  ): Promise<{ capsuleImagePath?: string; iconImagePath?: string; heroImagePath?: string }> {
    let capsuleImagePath: string | undefined;

    // 1. Try PlayStation CDN first
    if (trophyTitleIconUrl) {
      try {
        const path = await imageStorage.downloadAndStore(
          trophyTitleIconUrl,
          'playstation',
          npCommunicationId,
          'game',
          'grid',
        );
        if (path) capsuleImagePath = path;
      } catch (err) {
        logger.debug({ err, trophyTitleIconUrl, npCommunicationId }, 'PlayStation CDN image unavailable, trying fallbacks');
      }
    }

    // 2. SteamGridDB fallback
    if (!capsuleImagePath && steamGridDB) {
      try {
        const path = await steamGridDB.downloadGameImageByName(gameTitle, 'playstation', npCommunicationId);
        if (path) capsuleImagePath = path;
      } catch (err) {
        logger.debug({ err, gameTitle }, 'SteamGridDB fallback failed for PlayStation game');
      }
    }

    // 3. IGDB fallback
    if (!capsuleImagePath) {
      try {
        const igdb = await createIGDBAdapter();
        if (igdb) {
          const path = await igdb.downloadGameImage(gameTitle, 'playstation', npCommunicationId);
          if (path) capsuleImagePath = path;
        }
      } catch (err) {
        logger.debug({ err, gameTitle }, 'IGDB fallback failed for PlayStation game');
      }
    }

    // Download icon and hero in parallel (non-blocking — failures are OK)
    const [iconImagePath, heroImagePath] = await Promise.all([
      // Icon: PlayStation CDN trophyTitleIconUrl resized to 64×64 by imageStorage
      (async (): Promise<string | undefined> => {
        if (!trophyTitleIconUrl) return undefined;
        try {
          const cached = imageStorage.checkLocalFile('playstation', npCommunicationId, 'game', 'icon');
          if (cached) return cached;
          return await imageStorage.downloadAndStore(
            trophyTitleIconUrl, 'playstation', npCommunicationId, 'game', 'icon',
          );
        } catch {
          logger.debug({ npCommunicationId }, 'PlayStation icon image not available');
          return undefined;
        }
      })(),
      // Hero: SteamGridDB hero → IGDB artwork → trophyTitleIconUrl fallback
      (async (): Promise<string | undefined> => {
        try {
          const cached = imageStorage.checkLocalFile('playstation', npCommunicationId, 'game', 'hero');
          if (cached) return cached;

          // 1. SteamGridDB hero images (when configured)
          if (steamGridDB) {
            const game = await steamGridDB.searchGameByName(gameTitle);
            if (game) {
              const heroes = await steamGridDB.getHeroImages(game.id);
              if (heroes.length > 0) {
                const best = heroes.sort((a, b) => b.score - a.score)[0];
                const path = await imageStorage.downloadAndStore(
                  best.url, 'playstation', npCommunicationId, 'game', 'hero',
                );
                if (path) {
                  logger.info({ npCommunicationId, gameTitle }, '[HERO] Downloaded from SteamGridDB');
                  return path;
                }
              }
            }
          }

          // 2. IGDB artwork as hero fallback
          {
            try {
              const igdb = await createIGDBAdapter();
              if (igdb) {
                const heroPath = await igdb.downloadHeroImage(gameTitle, 'playstation', npCommunicationId);
                if (heroPath) {
                  logger.info({ npCommunicationId, gameTitle }, '[HERO] Downloaded from IGDB');
                  return heroPath;
                }
              }
            } catch {
              logger.debug({ npCommunicationId, gameTitle }, 'IGDB hero fallback failed');
            }
          }

          // 3. Last resort: use trophyTitleIconUrl (square, will be stretched but provides visual)
          if (trophyTitleIconUrl) {
            const path = await imageStorage.downloadAndStore(
              trophyTitleIconUrl, 'playstation', npCommunicationId, 'game', 'hero',
            );
            if (path) {
              logger.info({ npCommunicationId, gameTitle }, '[HERO] Using trophy icon as hero fallback');
              return path;
            }
          }

          return undefined;
        } catch {
          logger.debug({ npCommunicationId, gameTitle }, 'PlayStation hero image not available');
          return undefined;
        }
      })(),
    ]);

    return { capsuleImagePath, iconImagePath, heroImagePath };
  }

  /**
   * Download a trophy icon from PlayStation CDN.
   * Stores under images/playstation/{npCommunicationId}/{trophyId}_icon.{ext}
   */
  async downloadTrophyIcon(
    npCommunicationId: string,
    trophyId: string,
    iconUrl?: string,
  ): Promise<string | undefined> {
    if (!iconUrl) return undefined;
    try {
      const path = await imageStorage.downloadAndStore(
        iconUrl,
        'playstation',
        npCommunicationId,
        trophyId,
        'icon',
      );
      return path;
    } catch (err) {
      logger.debug({ err, iconUrl, trophyId, npCommunicationId }, 'Trophy icon download failed');
      return undefined;
    }
  }

  // -------------------------------------------------------------------------
  // Retry logic
  // -------------------------------------------------------------------------

  /**
   * Execute a PSN API call with exponential backoff retry.
   * - On 429: retry with backoff (max MAX_RETRIES times)
   * - On 403 (privacy/permissions): terminal, re-throw
   * - On 5xx: retry with backoff
   */
  private async _withRetry<T>(fn: () => Promise<T>, attempt = 0): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      const statusCode = error?.statusCode ?? error?.response?.status ?? error?.status;
      const message = error?.message ?? String(error);

      // Unauthorized — token is invalid, re-auth required
      if (statusCode === 401) {
        throw new Error(`PSN API returned 401 Unauthorized. Authentication token is invalid or expired — re-authentication required. Original: ${message}`);
      }

      // Privacy / forbidden — terminal error
      if (statusCode === 403) {
        throw new Error(`PSN API access denied (403). Check PSN privacy settings. Original: ${message}`);
      }

      // Rate limited or transient server error — retry with backoff
      if ((statusCode === 429 || (statusCode >= 500 && statusCode < 600)) && attempt < MAX_RETRIES) {
        const backoff = RATE_LIMIT_INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        logger.warn({ statusCode, attempt, backoff }, 'PSN API rate limited or server error, retrying');
        await this._sleep(backoff);
        return this._withRetry(fn, attempt + 1);
      }

      throw error;
    }
  }

  // Overridable for testing
  protected _sleep(ms: number): Promise<void> {
    return new Promise<void>((r) => setTimeout(r, ms));
  }
}

export function createPlayStationAdapter(): PlayStationAdapter {
  return new PlayStationAdapter();
}
