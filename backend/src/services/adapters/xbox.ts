import { live, xnet, XSAPIClient } from '@xboxreplay/xboxlive-auth';
import { logger } from '../../utils/logger.js';
import { rateLimiter } from '../rateLimiter.js';

// ---------------------------------------------------------------------------
// Xbox OAuth scopes
// ---------------------------------------------------------------------------
// These are the Entra v2 scopes for the custom app registration.
// Token exchange goes to login.microsoftonline.com (v2 endpoint), NOT login.live.com.
// The resulting access_token is then passed to the Xbox pipeline via xnet.
const XBOX_SCOPE = 'XboxLive.signin XboxLive.offline_access';
const ENTRA_TOKEN_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface XboxTokenBundle {
  /** Microsoft Live access token (short-lived) */
  accessToken: string;
  /** Microsoft Live refresh token (long-lived, encrypted at rest) */
  refreshToken: string | null;
  /** Xbox XSTS token used for Xbox Live API calls */
  xstsToken: string;
  /** User hash (uhs) for Authorization header */
  userHash: string;
  /** Xbox User ID */
  xuid: string;
  /** Token expiry timestamp */
  expiresAt: Date;
}

export interface XboxProfile {
  xuid: string;
  gamertag: string;
  avatarUrl?: string;
}

export interface XboxTitleHistory {
  titleId: string;
  name: string;
  currentGamerscore?: number;
  maxGamerscore?: number;
  currentAchievements: number;
  totalAchievements: number;
  devices: string[];
  titleImageUrl?: string;
}

export interface XboxAchievement {
  achievementId: string;
  name: string;
  description?: string;
  lockedDescription?: string;
  isSecret: boolean;
  unlockedAt?: Date;
  iconUrl?: string;
  rarityCategory?: string;
}

// ---------------------------------------------------------------------------
// Xbox Adapter class
// ---------------------------------------------------------------------------

export class XboxAdapter {
  // -------------------------------------------------------------------------
  // Auth methods (Phase 2 / T004)
  // -------------------------------------------------------------------------

  /**
   * Generate the Microsoft OAuth authorization URL.
   * Uses the Entra v2 (login.microsoftonline.com) authorize endpoint so that
   * custom app registrations work with personal Microsoft / Xbox accounts.
   */
  getAuthorizeUrl(clientId: string, redirectUri: string, state?: string): string {
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: XBOX_SCOPE,
      response_mode: 'query',
      ...(state ? { state } : {}),
    });
    return `https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?${params.toString()}`;
  }

  /**
   * Exchange an OAuth authorization code for a full Xbox token bundle.
   * Flow: Entra v2 code → access/refresh tokens → Xbox User Token → XSTS Token
   * Uses login.microsoftonline.com/consumers (v2 endpoint) for custom app registrations.
   */
  async exchangeCodeForTokens(
    code: string,
    clientId: string,
    clientSecret: string,
    redirectUri: string,
  ): Promise<XboxTokenBundle> {
    // Step 1: Exchange code via Entra v2 token endpoint
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      scope: XBOX_SCOPE,
    });

    const res = await fetch(ENTRA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Token exchange failed (${res.status}): ${text}`);
    }

    const tokens = await res.json() as { access_token: string; refresh_token?: string };
    return this._exchangeLiveAccessTokenForBundle(tokens.access_token, tokens.refresh_token ?? null);
  }

  /**
   * Refresh Xbox tokens using a stored refresh token.
   * Returns updated token bundle with new XSTS credentials.
   * Uses login.microsoftonline.com/consumers (v2 endpoint) for custom app registrations.
   */
  async refreshXboxTokens(
    refreshToken: string,
    clientId: string,
    clientSecret: string,
  ): Promise<XboxTokenBundle> {
    // Step 1: Refresh via Entra v2 token endpoint
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: XBOX_SCOPE,
    });

    const res = await fetch(ENTRA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Token refresh failed (${res.status}): ${text}`);
    }

    const tokens = await res.json() as { access_token: string; refresh_token?: string };
    return this._exchangeLiveAccessTokenForBundle(tokens.access_token, tokens.refresh_token ?? null);
  }

  /**
   * Internal helper: Exchange a Live access token through the full Xbox pipeline
   * (User Token → XSTS Token) to produce a complete token bundle.
   */
  private async _exchangeLiveAccessTokenForBundle(
    accessToken: string,
    refreshToken: string | null,
  ): Promise<XboxTokenBundle> {
    // Step 2: Exchange Live access token for Xbox User Token
    // Preamble 'd' means the access_token is used directly as RPS ticket
    const userTokenResponse = await xnet.exchangeRpsTicketForUserToken(accessToken, 'd');

    // Step 3: Exchange User Token for XSTS Token
    const xstsResponse = await xnet.exchangeTokenForXSTSToken(userTokenResponse.Token);

    // Extract XUID and UHS (user hash) from XSTS claims
    const claims = xstsResponse.DisplayClaims.xui[0];
    const xuid = (claims as any).xid || '';
    const userHash = claims.uhs;

    const expiresAt = new Date(xstsResponse.NotAfter);

    return {
      accessToken,
      refreshToken,
      xstsToken: xstsResponse.Token,
      userHash,
      xuid,
      expiresAt,
    };
  }

  /**
   * Fetch Xbox profile information (gamertag, avatar) for a given XUID.
   */
  async getXboxProfile(xuid: string, xstsToken: string, userHash: string): Promise<XboxProfile> {
    const url = `https://profile.xboxlive.com/users/xuid(${xuid})/profile/settings?settings=Gamertag,GameDisplayPicRaw`;

    return rateLimiter.executeWithRetry(
      'xbox',
      async () => {
        try {
          const response = await XSAPIClient.get<{
            profileUsers: Array<{
              id: string;
              settings: Array<{ id: string; value: string }>;
            }>;
          }>(url, {
            options: {
              XSTSToken: xstsToken,
              userHash,
              contractVersion: '2',
            },
          });

          const profileUser = response.data?.profileUsers?.[0];
          if (!profileUser) {
            throw new Error('No profile data returned from Xbox profile API');
          }

          const settings = profileUser.settings.reduce<Record<string, string>>(
            (acc, s) => { acc[s.id] = s.value; return acc; },
            {},
          );

          return {
            xuid: profileUser.id,
            gamertag: settings['Gamertag'] || `Xbox User ${xuid}`,
            avatarUrl: settings['GameDisplayPicRaw'] || undefined,
          };
        } catch (error) {
          logger.error({ error, xuid }, 'Failed to fetch Xbox profile');
          throw error;
        }
      },
      `profile:${xuid}`,
    );
  }

  // -------------------------------------------------------------------------
  // Data methods (US2 / T013)
  // -------------------------------------------------------------------------

  /**
   * Fetch all title history with achievements for a given XUID.
   * Handles pagination via continuationToken.
   * Filters out titles with 0 achievements.
   */
  async getTitleHistory(xuid: string, xstsToken: string, userHash: string): Promise<XboxTitleHistory[]> {
    const baseUrl = `https://achievements.xboxlive.com/users/xuid(${xuid})/history/titles`;
    const allTitles: XboxTitleHistory[] = [];
    let continuationToken: string | null = null;

    // Actual API response shape (contract version "2"):
    // Fields are flattened — no nested `achievement` object.
    // `earnedAchievements` = unlocked count; `maxGamerscore` used as proxy
    // for "has achievements". `devices` and `displayImage` are absent.
    type TitleHistoryResponse = {
      titles: Array<{
        titleId: string | number;
        name: string;
        titleType?: string;
        platform?: string;
        earnedAchievements?: number;
        currentGamerscore?: number;
        maxGamerscore?: number;
        lastUnlock?: string;
        serviceConfigId?: string;
      }>;
      pagingInfo?: { continuationToken?: string };
    };

    do {
      const url: string = continuationToken
        ? `${baseUrl}?continuationToken=${encodeURIComponent(continuationToken)}`
        : baseUrl;

      const result: TitleHistoryResponse | undefined = await rateLimiter.executeWithRetry<TitleHistoryResponse | undefined>(
        'xbox',
        async (): Promise<TitleHistoryResponse | undefined> => {
          try {
            const response = await XSAPIClient.get<TitleHistoryResponse>(url, {
              options: {
                XSTSToken: xstsToken,
                userHash,
                contractVersion: '2',
              },
            });
            return response.data;
          } catch (error) {
            logger.error({ error, xuid }, 'Failed to fetch Xbox title history');
            throw error;
          }
        },
        `titles:${xuid}:${continuationToken ?? '0'}`,
      );

      const titles = result?.titles ?? [];

      logger.info(
        { xuid, rawTitleCount: titles.length, rawResultKeys: result ? Object.keys(result) : null },
        'Xbox title history raw response',
      );

      let pageKept = 0;
      let pageFiltered = 0;
      for (const title of titles) {
        const maxGs = title.maxGamerscore ?? 0;
        // Skip titles with no gamerscore (apps, media, etc. — no achievement system)
        if (maxGs === 0) {
          pageFiltered++;
          continue;
        }
        pageKept++;
        allTitles.push({
          titleId: String(title.titleId),
          name: title.name,
          currentGamerscore: title.currentGamerscore,
          maxGamerscore: maxGs,
          currentAchievements: title.earnedAchievements ?? 0,
          // totalAchievements is not returned by the history endpoint;
          // it will be populated from individual getAchievements() calls.
          totalAchievements: 0,
          devices: [],
          titleImageUrl: undefined,
        });
      }

      logger.info(
        { xuid, pageKept, pageFiltered },
        'Xbox title history page filter stats',
      );

      continuationToken = result?.pagingInfo?.continuationToken ?? null;
    } while (continuationToken !== null);

    logger.info({ xuid, totalTitles: allTitles.length }, 'Fetched Xbox title history');
    return allTitles;
  }

  /**
   * Fetch all achievements for a given title.
   * Handles pagination via continuationToken.
   */
  async getAchievements(
    xuid: string,
    titleId: string,
    xstsToken: string,
    userHash: string,
  ): Promise<XboxAchievement[]> {
    const baseUrl = `https://achievements.xboxlive.com/users/xuid(${xuid})/achievements?titleId=${titleId}&maxItems=100`;
    const allAchievements: XboxAchievement[] = [];
    let continuationToken: string | null = null;

    type AchievementResponse = {
      achievements: Array<{
        id: string;
        name: string;
        progressState: string;
        progression: { timeUnlocked: string; requirements?: unknown[] };
        mediaAssets: Array<{ name: string; type: string; url: string }>;
        isSecret: boolean;
        description: string;
        lockedDescription: string;
        productId: string;
        achievementType: string;
        participationType: string;
        rewards: Array<{ name?: string; description?: string; value?: string; type: string; valueType: string }>;
        rarityCurrentCategory?: string;
      }>;
      pagingInfo?: { continuationToken?: string };
    };

    do {
      const url: string = continuationToken
        ? `${baseUrl}&continuationToken=${encodeURIComponent(continuationToken)}`
        : baseUrl;

      const result: AchievementResponse | null = await rateLimiter.executeWithRetry<AchievementResponse | null>(
        'xbox',
        async (): Promise<AchievementResponse | null> => {
          try {
            const response = await XSAPIClient.get<AchievementResponse>(url, {
              options: {
                XSTSToken: xstsToken,
                userHash,
                contractVersion: '2',
              },
            });
            return response.data;
          } catch (error) {
            logger.warn({ error, xuid, titleId }, 'Failed to fetch achievements for Xbox title');
            // For privacy-blocked titles, return empty achievements rather than failing sync
            if ((error as any)?.statusCode === 403 || (error as any)?.status === 403) {
              logger.warn({ xuid, titleId }, 'Xbox achievements blocked by privacy settings, skipping title');
              return null;
            }
            throw error;
          }
        },
        `achievements:${xuid}:${titleId}:${continuationToken ?? '0'}`,
      );

      if (!result) break; // Privacy blocked - skip this title

      const achievements = result?.achievements ?? [];

      for (const ach of achievements) {
        const iconAsset = ach.mediaAssets?.find((a: { name: string; type: string; url: string }) => a.type === 'Icon');
        const unlockedAt = ach.progression?.timeUnlocked
          ? new Date(ach.progression.timeUnlocked)
          : undefined;
        // timeUnlocked is "0001-01-01T00:00:00.0000000Z" when not unlocked
        const isUnlocked = ach.progressState === 'Achieved';

        allAchievements.push({
          achievementId: ach.id,
          name: ach.name,
          description: ach.description,
          lockedDescription: ach.lockedDescription,
          isSecret: ach.isSecret ?? false,
          unlockedAt: isUnlocked && unlockedAt ? unlockedAt : undefined,
          iconUrl: iconAsset?.url,
        });
      }

      continuationToken = result?.pagingInfo?.continuationToken ?? null;
    } while (continuationToken !== null);

    logger.debug({ xuid, titleId, count: allAchievements.length }, 'Fetched Xbox achievements');
    return allAchievements;
  }
}

export function createXboxAdapter(): XboxAdapter {
  return new XboxAdapter();
}
