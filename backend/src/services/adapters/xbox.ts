import { live, xnet, XSAPIClient } from '@xboxreplay/xboxlive-auth';
import pLimit from 'p-limit';
import { logger } from '../../utils/logger.js';
import { rateLimiter } from '../rateLimiter.js';

// ---------------------------------------------------------------------------
// Microsoft Store search — rate-limit / anti-bot protection
// ---------------------------------------------------------------------------
// apps.microsoft.com returns 403 (WAF bot detection) when many requests arrive
// from the same server IP in parallel. We serialise all search requests with a
// short pause between them and retry once with a longer backoff on 403.
//
// Serial (concurrency = 1) is intentional: the CDN / WAF detects bursts, not
// just concurrency. A 300 ms gap between completions keeps request rate ≤ 3/s.
// With 80 games: 80 × (network ≈ 300ms + 300ms gap) ≈ 48 s worst-case for this
// phase, which is acceptable.
const _msStoreQueue = pLimit(2);
const _msStoreGapMs   = 200;   // pause before each queued request
const _msStoreRetryMs = 2_000; // backoff after a 403 before single retry
const _sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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
  /** Xbox XSTS token used for Xbox Live API calls (XBL3.0 scheme) */
  xstsToken: string;
  /**
   * Xbox User Token — the intermediate token produced before XSTS exchange.
   * Used with the XBL2.0 auth scheme, which is required by the image CDN
   * (image-ssl.xboxlive.com/content/) and other non-API Xbox services.
   * XBL3.0 (XSTS) is rejected by those endpoints with 403.
   */
  userToken: string;
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
  /** Normalised generation strings e.g. ['Xbox360'], ['XboxOne'], ['XboxSeries'], ['PC'] */
  devices: string[];
  /** Raw platform string returned by the API, used to select the correct contract version */
  platform?: string;
  titleImageUrl?: string;
}

export interface XboxAchievement {
  achievementId: string;
  name: string;
  description?: string;
  lockedDescription?: string;
  isSecret: boolean;
  /** True when the user has earned this achievement, regardless of whether a timestamp is available */
  isUnlocked: boolean;
  /** Timestamp of unlock. May be undefined for offline/no-timestamp GS4 earns even when isUnlocked=true */
  unlockedAt?: Date;
  /**
   * Icon URL.
   * - GS5 (Xbox One/Series/PC): embedded directly in the API response.
   * - GS4 (Xbox 360): programmatically generated from titleId + imageId using the public
   *   image.xboxlive.com CDN (`https://image.xboxlive.com/global/t.<titleHex>/ach/0/<imageHex>`).
   *   No authentication required for this endpoint.
   */
  iconUrl?: string;
  rarityCategory?: string;
  /** Gamerscore value for this individual achievement */
  gamerscore?: number;
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
      // Force the account picker every time so users can choose which Microsoft
      // account to link instead of silently reusing the browser's active session.
      prompt: 'select_account',
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
    // Preamble 'd' means the access_token is used directly as RPS ticket.
    // We keep the User Token — it is needed for XBL2.0 auth (image CDN).
    const userTokenResponse = await xnet.exchangeRpsTicketForUserToken(accessToken, 'd');
    const userToken = userTokenResponse.Token;

    // Step 3: Exchange User Token for XSTS Token (used for all Xbox Live API calls)
    const xstsResponse = await xnet.exchangeTokenForXSTSToken(userToken);

    // Extract XUID and UHS (user hash) from XSTS claims
    const claims = xstsResponse.DisplayClaims.xui[0];
    const xuid = (claims as any).xid || '';
    const userHash = claims.uhs;

    const expiresAt = new Date(xstsResponse.NotAfter);

    return {
      accessToken,
      refreshToken,
      xstsToken: xstsResponse.Token,
      userToken,
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

    // Title response fields differ between contract versions but the outer shape is the same.
    type RawTitle = {
      titleId: string | number;
      name: string;
      /** v2: string e.g. "Game", "App", "Movie". v1 (360): numeric 1=Game, 2=App, 3=Video, etc. */
      titleType?: string | number;
      platform?: string;
      earnedAchievements?: number;
      currentGamerscore?: number;
      maxGamerscore?: number;
      lastUnlock?: string;
      serviceConfigId?: string;
      /** v2 response: HTTPS URL to box art / display image */
      displayImage?: string;
      /** v2 response: alternative cover art field */
      largeBoxArt?: string;
    };
    type TitleHistoryResponse = {
      titles: RawTitle[];
      pagingInfo?: { continuationToken?: string };
    };

    /** Fetch all pages for a given contract version, returning raw title objects. */
    const fetchAllPages = async (contractVersion: '1' | '2'): Promise<RawTitle[]> => {
      const collected: RawTitle[] = [];
      let continuationToken: string | null = null;
      do {
        const url: string = continuationToken
          ? `${baseUrl}?continuationToken=${encodeURIComponent(continuationToken)}`
          : baseUrl;

        const result: TitleHistoryResponse | undefined = await rateLimiter.executeWithRetry<TitleHistoryResponse | undefined>(
          'xbox',
          async (): Promise<TitleHistoryResponse | undefined> => {
            try {
              const response = await XSAPIClient.get<TitleHistoryResponse>(url, {
                options: { XSTSToken: xstsToken, userHash, contractVersion },
              });
              return response.data;
            } catch (error) {
              logger.warn({ error, xuid, contractVersion }, 'Failed to fetch Xbox title history page');
              // A 403/404 on the v1 endpoint just means no 360 titles — don't throw
              if (contractVersion === '1') return undefined;
              throw error;
            }
          },
          `titles:${xuid}:v${contractVersion}:${continuationToken ?? '0'}`,
        );

        const page = result?.titles ?? [];
        logger.info(
          { xuid, contractVersion, rawTitleCount: page.length },
          'Xbox title history page fetched',
        );
        collected.push(...page);
        continuationToken = result?.pagingInfo?.continuationToken ?? null;
      } while (continuationToken !== null);
      return collected;
    };

    // Fetch both contract versions in parallel.
    // v2 = Xbox One / Series / modern PC (GS5)
    // v1 = Xbox 360 legacy titles (GS4) — these often appear ONLY in the v1 response or
    //      appear in v2 with maxGamerscore=0 (gamerscore not surfaced for legacy schema)
    const [v2Titles, v1Titles] = await Promise.all([
      fetchAllPages('2'),
      fetchAllPages('1'),
    ]);

    logger.info({ xuid, v2Count: v2Titles.length, v1Count: v1Titles.length }, 'Xbox title history raw totals');

    // Merge: deduplicate by titleId, preferring v2 entry if present (has more fields)
    const byTitleId = new Map<string, RawTitle & { _contractVersion: '1' | '2' }>();
    for (const t of v2Titles) byTitleId.set(String(t.titleId), { ...t, _contractVersion: '2' });
    // Add v1 titles that aren't already in v2
    for (const t of v1Titles) {
      const key = String(t.titleId);
      if (!byTitleId.has(key)) byTitleId.set(key, { ...t, _contractVersion: '1' });
    }

    // Log a sample of titles with their platform strings so we can verify 360 detection
    const sampleTitles = [...byTitleId.values()].slice(0, 20).map((t) => ({
      titleId: t.titleId, name: t.name, platform: t.platform, contractVersion: t._contractVersion,
    }));
    logger.info({ xuid, sampleTitles }, 'Xbox title history sample (platform detection)');

    const allTitles: XboxTitleHistory[] = [];
    let kept = 0, filtered = 0;

    for (const title of byTitleId.values()) {
      const maxGs = title.maxGamerscore ?? 0;
      const isXbox360 =
        (title.platform ?? '').toLowerCase().includes('360') ||
        title._contractVersion === '1';

      // Filter out non-game titles (apps, movies, TV, etc.).
      // v2 API: titleType is a string — "Game", "App", "Movie", "TV", etc.
      // v1 API: titleType is a number — 1=Game, 2=App, 3=Video, 4=Music, etc.
      // Keep only explicit Game values; if titleType is absent assume it's a game.
      const rawTitleType = title.titleType;
      if (rawTitleType !== undefined && rawTitleType !== null) {
        const isGame =
          rawTitleType === 1 ||                                          // v1 numeric Game
          String(rawTitleType).toLowerCase() === 'game';                // v2 string "Game"
        if (!isGame) {
          filtered++;
          logger.debug(
            { titleId: title.titleId, name: title.name, titleType: rawTitleType },
            'Filtered out non-game title',
          );
          continue;
        }
      }

      // Skip games where the user has earned zero achievements.
      // Primary check: earnedAchievements field explicitly 0.
      // Fallback check: currentGamerscore explicitly 0. For Xbox 360 v1-only titles, the
      // earnedAchievements field is often absent (undefined) in the API response, so the
      // primary check misses them. currentGamerscore === 0 means the user has earned nothing;
      // this is reliable for both v1 and v2 responses.
      const earnedCount = title.earnedAchievements;
      const currentGs = title.currentGamerscore;
      const hasZeroEarned = (earnedCount !== undefined && earnedCount !== null && earnedCount === 0);
      const hasZeroGS = (currentGs !== undefined && currentGs !== null && currentGs === 0);
      if (hasZeroEarned || hasZeroGS) {
        filtered++;
        logger.debug(
          { titleId: title.titleId, name: title.name, earnedAchievements: earnedCount, currentGamerscore: currentGs },
          'Filtered out title with 0 earned achievements',
        );
        continue;
      }

      // For 360 titles the v2 history endpoint often returns maxGamerscore=0.
      // Accept them as long as they're clearly 360 games (v1-only or platform=Xbox360).
      if (maxGs === 0 && !isXbox360) {
        filtered++;
        logger.debug(
          { titleId: title.titleId, name: title.name, platform: title.platform },
          'Filtered out title with maxGamerscore=0',
        );
        continue;
      }

      kept++;
      const platform = title.platform ?? (isXbox360 ? 'Xbox360' : '');
      let devices: string[] = [];
      if (platform.toLowerCase().includes('360') || isXbox360) {
        devices = ['Xbox360'];
      } else if (platform.toLowerCase().includes('series') || platform.toLowerCase().includes('scarlett')) {
        devices = ['XboxSeries'];
      } else if (platform.toLowerCase().includes('xboxone') || platform.toLowerCase() === 'xboxone') {
        devices = ['XboxOne'];
      } else if (platform.toLowerCase() === 'pc' || platform.toLowerCase().includes('win')) {
        devices = ['PC'];
      } else if (platform) {
        devices = [platform];
      }

      allTitles.push({
        titleId: String(title.titleId),
        name: title.name,
        currentGamerscore: title.currentGamerscore,
        maxGamerscore: maxGs,
        currentAchievements: title.earnedAchievements ?? 0,
        totalAchievements: 0, // populated from getAchievements()
        devices,
        platform: isXbox360 ? 'Xbox360' : (platform || undefined),
        // Populate image URL:
        // – Xbox One/Series: use displayImage returned by the v2 history endpoint
        // – Xbox 360: construct tile art URL from titleId hex
        titleImageUrl: title.displayImage ?? title.largeBoxArt ?? undefined,
        // Note: Xbox 360 tile CDN URLs (image-ssl.xboxlive.com/global/t.{hex}/tile/...)
        // consistently return 404. 360 game art is sourced via SteamGridDB instead.
      });
    }

    logger.info({ xuid, kept, filtered, totalTitles: allTitles.length }, 'Fetched Xbox title history');
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
    /** Pass the raw platform string from XboxTitleHistory to select the right schema version */
    platform?: string,
  ): Promise<{ achievements: XboxAchievement[]; totalInCatalog: number; storeProductId?: string }> {
    // Xbox 360 titles use the GS4 achievement system (contract version 1).
    // Xbox One and later use GS5 (contract version 2).
    // Using v2 for a 360 title returns an error → the title gets silently skipped.
    const isXbox360 = !!platform && platform.toLowerCase().includes('360');
    const contractVersion = isXbox360 ? '1' : '2';
    logger.info({ xuid, titleId, platform, isXbox360, contractVersion }, 'Fetching Xbox achievements');

    const allAchievements: XboxAchievement[] = [];
    // Store productId from the GS5 achievement response (each GS5 achievement carries
    // the Microsoft Store productId for the title). Undefined for GS4 / 360 titles.
    let storeProductId: string | undefined;

    // GS5 (contract v2) – Xbox One / Series / modern PC
    type GS5Achievement = {
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
    };

    // GS4 (contract v1) – Xbox 360 legacy format
    // ACTUAL field names from production API (confirmed by raw log):
    //   unlocked (bool)       – whether the current user has the achievement
    //   unlockedOnline (bool) – whether it was earned online
    //   timeUnlocked          – ISO timestamp; sentinel "1753-01-01" when not earned
    //   imageId (number)      – asset identifier; CDN URL format TBD (see icon construction below)
    //   sequence (number)     – sequential position of this achievement in the title
    // NOTE: isEarned/Earned/earned do NOT appear in real responses.
    type GS4Achievement = {
      id: string | number;
      titleId?: string | number;
      name: string;
      description: string;
      lockedDescription?: string;
      sequence?: number;
      flags?: number;
      isSecret?: boolean;
      platform?: number;
      gamerscore?: string | number;
      /** Primary unlock field confirmed in production */
      unlocked?: boolean;
      unlockedOnline?: boolean;
      /** Fallback casing variants (defensive) */
      isEarned?: boolean;
      Earned?: boolean;
      earned?: boolean;
      /** Timestamp field confirmed in production; sentinel = "1753-01-01" */
      timeUnlocked?: string;
      /** Alternate timestamp field names (defensive) */
      timeEarned?: string;
      earnedOnline?: string;
      /** Icon tile ID confirmed in production */
      imageId?: string | number;
      /** Alternate tile field name (defensive) */
      tileId?: string | number;
      /** Some API versions return a direct image URL */
      imageUrl?: string;
      lockedImageUrl?: string;
      unlockedImageUrl?: string;
      type?: number;
      isRevoked?: boolean;
    };

    type AchievementResponse = {
      achievements: Array<GS5Achievement | GS4Achievement>;
      pagingInfo?: {
        continuationToken?: string;
        totalRecords?: number;
      };
    };

    // Helper: fetch all pages from a GS4 endpoint and return raw GS4 achievements.
    const fetchAllGS4Pages = async (baseEndpointUrl: string, label: string): Promise<GS4Achievement[]> => {
      const all: GS4Achievement[] = [];
      let token: string | null = null;
      let isFirstPage = true;
      do {
        const url = token
          ? `${baseEndpointUrl}&continuationToken=${encodeURIComponent(token)}`
          : baseEndpointUrl;
        const result: AchievementResponse | null = await rateLimiter.executeWithRetry<AchievementResponse | null>(
          'xbox',
          async (): Promise<AchievementResponse | null> => {
            try {
              const response = await XSAPIClient.get<AchievementResponse>(url, {
                options: { XSTSToken: xstsToken, userHash, contractVersion: '1' },
              });
              return response.data;
            } catch (error) {
              logger.warn({ error, xuid, titleId, label }, `Failed to fetch GS4 ${label}`);
              if ((error as any)?.statusCode === 403 || (error as any)?.status === 403) return null;
              if ((error as any)?.statusCode === 400 || (error as any)?.status === 400) {
                logger.warn({ xuid, titleId, label }, `GS4 ${label} returned 400 — no achievements`);
                return null;
              }
              throw error;
            }
          },
          `gs4:${label}:${xuid}:${titleId}:${token ?? '0'}`,
        );
        if (!result) break;
        if (isFirstPage) {
          const firstRaw = result.achievements?.[0] ?? null;
          // Dump the COMPLETE raw object so we can discover any URL-carrying fields
          // we may have missed (imageUrl, lockedImageUrl, unlockedImageUrl, etc.).
          logger.info(
            {
              titleId,
              label,
              pageCount: result.achievements?.length ?? 0,
              totalRecords: result.pagingInfo?.totalRecords,
              firstRaw,
            },
            `GS4 ${label} first page`,
          );
          isFirstPage = false;
        }
        for (const a of result.achievements ?? []) all.push(a as GS4Achievement);
        token = result.pagingInfo?.continuationToken ?? null;
      } while (token !== null);
      return all;
    };

    if (isXbox360) {
      // GS4 two-endpoint approach:
      //   titleachievements — full achievement catalog (definitions, names, icons).
      //                       The `unlocked` field here is NOT reliable for user earned
      //                       status — it reflects whether the achievement is "revealed"
      //                       (i.e., not a secret), not personal progress.
      //   achievements      — user's EARNED list ONLY. Every item returned = earned.
      //                       This is the authoritative source for earned status and timestamps.
      const gs4CatalogUrl = `https://achievements.xboxlive.com/users/xuid(${xuid})/titleachievements?titleId=${titleId}&maxItems=100`;
      const gs4EarnedUrl  = `https://achievements.xboxlive.com/users/xuid(${xuid})/achievements?titleId=${titleId}&maxItems=100`;

      const [catalogAchs, earnedAchs] = await Promise.all([
        fetchAllGS4Pages(gs4CatalogUrl, 'catalog'),
        fetchAllGS4Pages(gs4EarnedUrl, 'earned'),
      ]);

      logger.info({ titleId, catalogCount: catalogAchs.length, earnedCount: earnedAchs.length }, 'GS4 merge stats');

      // Build earned map: achievementId → earn timestamp (may be sentinel for offline earns)
      const earnedMap = new Map<string, string | undefined>();
      for (const ach of earnedAchs) {
        earnedMap.set(String(ach.id), ach.timeUnlocked ?? ach.timeEarned ?? ach.earnedOnline);
      }

      for (const raw of catalogAchs) {
        const ach = raw as GS4Achievement;
        const achId = String(ach.id);
        const isEarned = earnedMap.has(achId);
        let unlockedAt: Date | undefined;
        if (isEarned) {
          const ts = earnedMap.get(achId);
          if (ts) {
            const d = new Date(ts);
            // Sentinel dates ("0001-01-01", "1753-01-01") mean no timestamp; guard with year > 1900
            if (d.getFullYear() > 1900) unlockedAt = d;
          }
        }

        // GS4 (Xbox 360) achievement icons are served from a public CDN without authentication:
        //   https://image.xboxlive.com/global/t.<titleIdHex>/ach/0/<imageIdHex>
        // titleIdHex = decimal titleId converted to lowercase hex.
        // imageIdHex = decimal imageId (from the `imageId` or `tileId` field) converted to lowercase hex.
        // Example: titleId=1297580006 → 4d5307e6, imageId=37 → 25
        //   → https://image.xboxlive.com/global/t.4d5307e6/ach/0/25
        // If the API unexpectedly returns a full URL in one of the URL fields, prefer that.
        let iconUrl: string | undefined = ach.imageUrl ?? ach.unlockedImageUrl ?? ach.lockedImageUrl;
        if (!iconUrl) {
          const rawImageId = ach.imageId ?? ach.tileId;
          if (rawImageId !== undefined && rawImageId !== null) {
            const imageIdNum = typeof rawImageId === 'number'
              ? rawImageId
              : parseInt(String(rawImageId), 10);
            const titleIdNum = parseInt(titleId, 10);
            if (!isNaN(imageIdNum) && !isNaN(titleIdNum)) {
              const titleIdHex = titleIdNum.toString(16);
              const imageIdHex = imageIdNum.toString(16);
              iconUrl = `https://image.xboxlive.com/global/t.${titleIdHex}/ach/0/${imageIdHex}`;
            }
          }
        }

        allAchievements.push({
          achievementId: achId,
          name: ach.name,
          description: ach.description,
          lockedDescription: ach.lockedDescription,
          isSecret: ach.isSecret ?? false,
          isUnlocked: isEarned,
          unlockedAt,
          iconUrl, // always undefined for GS4 unless the API unexpectedly returns a URL field
          gamerscore: ach.gamerscore !== undefined
            ? (parseInt(String(ach.gamerscore), 10) || undefined)
            : undefined,
        });
      }

      logger.debug({ titleId, total: allAchievements.length }, 'GS4 achievements mapped (icons via image.xboxlive.com public CDN)');
    } else {
      // GS5 (contract v2) — single endpoint returns full catalog with per-user progress states.
      const gs5BaseUrl = `https://achievements.xboxlive.com/users/xuid(${xuid})/achievements?titleId=${titleId}&maxItems=100`;
      let continuationToken: string | null = null;
      do {
        const url: string = continuationToken
          ? `${gs5BaseUrl}&continuationToken=${encodeURIComponent(continuationToken)}`
          : gs5BaseUrl;

        const result: AchievementResponse | null = await rateLimiter.executeWithRetry<AchievementResponse | null>(
          'xbox',
          async (): Promise<AchievementResponse | null> => {
            try {
              const response = await XSAPIClient.get<AchievementResponse>(url, {
                options: { XSTSToken: xstsToken, userHash, contractVersion },
              });
              return response.data;
            } catch (error) {
              logger.warn({ error, xuid, titleId, contractVersion }, 'Failed to fetch achievements for Xbox title');
              if ((error as any)?.statusCode === 403 || (error as any)?.status === 403) {
                logger.warn({ xuid, titleId }, 'Xbox achievements blocked by privacy settings, skipping title');
                return null;
              }
              throw error;
            }
          },
          `achievements:${xuid}:${titleId}:${continuationToken ?? '0'}`,
        );

        if (!result) break;

        for (const raw of result.achievements ?? []) {
          const ach = raw as GS5Achievement;
          // Capture the Store productId from the first achievement (all achievements
          // for a title share the same productId).
          if (!storeProductId && ach.productId) storeProductId = ach.productId;
          const iconAsset = ach.mediaAssets?.find(
            (a: { name: string; type: string; url: string }) =>
              a.type?.toLowerCase() === 'icon' || a.type?.toLowerCase() === 'achievement icon',
          );
          const unlockedAt = ach.progression?.timeUnlocked
            ? new Date(ach.progression.timeUnlocked)
            : undefined;
          const isUnlocked = ach.progressState === 'Achieved';

          allAchievements.push({
            achievementId: ach.id,
            name: ach.name,
            description: ach.description,
            lockedDescription: ach.lockedDescription,
            isSecret: ach.isSecret ?? false,
            isUnlocked,
            unlockedAt: isUnlocked && unlockedAt ? unlockedAt : undefined,
            iconUrl: iconAsset?.url,
            gamerscore: ach.rewards?.find((r) => r.type === 'Gamerscore')
              ? (parseInt(ach.rewards.find((r) => r.type === 'Gamerscore')!.value ?? '0', 10) || undefined)
              : undefined,
          });
        }

        continuationToken = result?.pagingInfo?.continuationToken ?? null;
      } while (continuationToken !== null);
    }

    const totalInCatalog = allAchievements.length;
    if (storeProductId) {
      logger.debug({ xuid, titleId, storeProductId }, 'Extracted Store productId from GS5 achievement response');
    }
    logger.debug({ xuid, titleId, contractVersion, count: totalInCatalog }, 'Fetched Xbox achievements');
    return {
      achievements: allAchievements,
      totalInCatalog,
      storeProductId,
    };
  }

  /**
   * Strip platform/edition suffixes that are appended to Xbox game titles
   * for disambiguation (e.g. "GTA IV PC", "The Outer Worlds Windows 10",
   * "Cult of the Lamb Xbox") but that will break image look-ups because the
   * image databases index the canonical title without the qualifier.
   *
   * Patterns removed (case-insensitive, only when they appear at the end):
   *   • " PC" / " PC Edition"
   *   • " Windows 10" / " Windows 10 Edition"
   *   • " Xbox" / " Xbox Edition" / " Xbox One" / " Xbox Series"
   *   • " for PC" / " for Xbox"
   *   • " (PC)" / " (Xbox)" / " (Windows)"
   */
  stripPlatformSuffix(name: string): string {
    return name
      // Remove parenthesised qualifiers at end: " (PC)", " (Xbox)", " (Windows)"
      .replace(/\s*\((PC|Xbox[^)]*|Windows[^)]*)\)\s*$/i, '')
      // Remove " for PC" / " for Xbox" at end
      .replace(/\s+for\s+(PC|Xbox[\w\s]*)\s*$/i, '')
      // Remove " Windows 10 [Edition]" at end
      .replace(/\s+Windows\s+10(\s+Edition)?\s*$/i, '')
      // Remove " Xbox [One|Series X|Series S|Edition]" at end
      .replace(/\s+Xbox(\s+(One|Series[\s\w]*|Edition))?\s*$/i, '')
      // Remove trailing " PC [Edition]" at end
      .replace(/\s+PC(\s+Edition)?\s*$/i, '')
      .trim();
  }

  /**
   * Expand known Xbox library abbreviations to their canonical full titles.
   * Used before both MS Store and Wikipedia lookups so abbreviated titles
   * ("GTA IV", "MOH Airborne", "TC's Ghost Recon FS") are matched correctly.
   *
   * Returns the expanded string, or undefined if no expansion was made.
   */
  expandAbbreviations(name: string): string | undefined {
    let r = name;
    r = r.replace(/^MOH\s+(.+)/i, 'Medal of Honor: $1');
    r = r.replace(/^Spidey\s*:/i, 'Spider-Man:');
    r = r.replace(/^TC[''\'`\u2019]?s\s+/i, "Tom Clancy's ");
    r = r.replace(/:\s*HH\s*$/i, ": Hell's Highway");
    r = r.replace(/\s+FS\s*$/i, ': Future Soldier');
    r = r.replace(/^GTA\s+/i, 'Grand Theft Auto ');
    r = r.replace(/^Dark Alliance$/i, 'Dungeons \u0026 Dragons: Dark Alliance');
    const trimmed = r.trim();
    return trimmed !== name.trim() ? trimmed : undefined;
  }

  /**
   * Append `?w=600&h=900` to store-images.s-microsoft.com CDN URLs.
   * The MS image CDN honours these params and returns a pre-resized image,
   * avoiding downloading the original which can be 4–10 MB. Non-MS URLs are
   * returned unchanged.
   */
  private addMSCDNSize(url: string): string {
    if (!url || !url.includes('store-images.s-microsoft.com')) return url;
    try {
      const u = new URL(url);
      u.searchParams.set('w', '600');
      u.searchParams.set('h', '900');
      return u.toString();
    } catch {
      return url;
    }
  }

  /**
   * Fetch a portrait grid image URL for an Xbox game using the public
   * apps.microsoft.com search API. No authentication required.
   *
   * This is the API that powers the Microsoft Store website search — it returns
   * actual results for the queried game name, unlike storeedgefd which returns
   * a fixed curated Game Pass list regardless of the query.
   *
   * Image priority: posterArtUrl (direct) → Poster → BrandedKeyArt → BoxArt
   *
   * Returns both the best image URL and the Store productId so callers can
   * use the productId for a direct Emerald lookup if needed (Priority 4).
   */
  async fetchMicrosoftStoreGridUrl(
    titleName: string,
    titleId?: string,
  ): Promise<{ imageUrl: string; productId: string } | undefined> {
    // Strip trailing platform qualifiers before searching so that
    // "GTA IV PC" searches as "GTA IV", "Cult of the Lamb Xbox" as
    // "Cult of the Lamb", etc.
    titleName = this.stripPlatformSuffix(titleName);

    // Expand known abbreviations so the Store can match them. This mirrors
    // the same expansion used for Wikipedia lookups. e.g.:
    //   "GTA IV"              → "Grand Theft Auto IV"
    //   "MOH Airborne"        → "Medal of Honor: Airborne"
    //   "TC's Ghost Recon FS" → "Tom Clancy's Ghost Recon: Future Soldier"
    //   "Spidey: Web of ..."  → "Spider-Man: Web of ..."
    const expanded = this.expandAbbreviations(titleName);
    if (expanded) {
      logger.info({ original: titleName, expanded }, '[MSStore] Expanded abbreviated title');
      titleName = expanded;
    }

    type MSProduct = {
      productId?: string;
      title?: string;
      posterArtUrl?: string;
      images?: Array<{ imageType?: string; url?: string; width?: number; height?: number }>;
    };

    // Tokenise a string into lowercase alphanumeric tokens.
    const tokenise = (s: string) =>
      s.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean);

    // Fetch the productsList for a given query string; logs the URL so it can be
    // opened manually in a browser to diagnose missing or wrong results.
    const searchProducts = async (queryName: string): Promise<MSProduct[]> => {
      return _msStoreQueue(async () => {
        // Respect the inter-request gap to stay under the WAF rate limit.
        await _sleep(_msStoreGapMs);

        const searchUrl =
          `https://apps.microsoft.com/api/products/search` +
          `?hl=en-US&gl=US&query=${encodeURIComponent(queryName)}`;
        logger.info({ titleName, queryName, searchUrl }, '[MSStore] Fetching search results');

        // Common browser headers — reduces WAF fingerprinting rejections.
        const requestHeaders = {
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Referer': 'https://apps.microsoft.com/',
          'Origin': 'https://apps.microsoft.com',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin',
          'Sec-Ch-Ua': '"Chromium";v="122", "Not:A-Brand";v="99", "Google Chrome";v="122"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Windows"',
        };

        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const response = await fetch(searchUrl, {
              headers: requestHeaders,
              signal: AbortSignal.timeout(10_000),
            });

            if (response.status === 403) {
              const body = await response.text().catch(() => '');
              if (attempt < 2) {
                logger.warn(
                  { titleName, queryName, attempt, retryInMs: _msStoreRetryMs, bodySnippet: body.slice(0, 150) },
                  '[MSStore] 403 WAF block — backing off and retrying',
                );
                await _sleep(_msStoreRetryMs);
                continue;
              }
              logger.warn(
                { titleName, queryName, bodySnippet: body.slice(0, 150) },
                '[MSStore] 403 WAF block on retry — giving up for this title',
              );
              return [];
            }

            if (!response.ok) {
              let body = '';
              try { body = await response.text(); } catch (_) { /* ignore */ }
              logger.warn({ titleName, queryName, status: response.status, body: body.slice(0, 300) }, '[MSStore] Search returned non-OK status');
              return [];
            }

            const text = await response.text();
            let json: { productsList?: MSProduct[] };
            try {
              json = JSON.parse(text) as { productsList?: MSProduct[] };
            } catch (parseErr) {
              logger.warn({ titleName, queryName, bodySnippet: text.slice(0, 300) }, '[MSStore] Response was not valid JSON (possible bot-detection page)');
              return [];
            }

            const results = json?.productsList ?? [];
            if (results.length === 0) {
              logger.warn({ titleName, queryName, bodySnippet: text.slice(0, 200) }, '[MSStore] Search returned empty productsList');
            } else {
              logger.info(
                { titleName, queryName, resultCount: results.length, resultTitles: results.slice(0, 5).map((r) => r.title) },
                '[MSStore] Search results received',
              );
            }
            return results;
          } catch (err) {
            logger.warn({ titleName, queryName, attempt, err: String(err) }, '[MSStore] Search request failed (network error or timeout)');
            return [];
          }
        }
        return [];
      });
    };

    // Find the best-matching product from a result list against the original needle.
    //
    // NUMBER TOKENS ARE HARD DISCRIMINATORS:
    //   Every numeric token in the needle (e.g. "3" in "Forza Horizon 3") must appear
    //   verbatim in the candidate. This prevents "Forza Horizon 3" from matching
    //   "Forza Horizon 6 Standard Edition".
    //
    // STOPWORD FILTERING:
    //   Common filler words (the, a, an, of, in, and, or, to, de, ...) are excluded
    //   from the recall/precision calculation. They inflate recall for unrelated titles
    //   that happen to share filler tokens, e.g. "The Rogue Prince of Persia" would
    //   otherwise score recall=0.8 against "Fanmade Prince of Persia: The Crystal Castle"
    //   because 4/5 tokens match (the, prince, of, persia) even though "rogue" is missing.
    //   With stopwords removed, meaningful words are [rogue, prince, persia] and recall
    //   drops to 0.67, correctly rejecting the match.
    //
    // WORD TOKEN SCORING (meaningful non-stopword, non-numeric tokens only):
    //   recall    = meaningful needle tokens found in candidate / total meaningful needle tokens
    //   precision = meaningful candidate tokens found in needle / total meaningful candidate tokens
    //   f1        = harmonic mean — prefers results that are neither too short nor too long
    //   recall must be >= 0.8 and f1 must be >= 0.5
    //
    // Single-character tokens (e.g. individual letters from "S.T.A.L.K.E.R.") are included
    // because they form the game's unique identity; the subtitle words and numbers are the
    // additional real signal.
    // 'i' is included as a stopword to handle Roman-numeral ordinals used as game
    // subtitle markers (e.g. "Mafia I: Definitive Edition" → "Mafia: Definitive Edition").
    // Higher Roman numerals (v, vi, x …) are intentionally excluded because they act as
    // meaningful discriminators between numbered entries in a series (Civilization V vs VI).
    const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'and', 'or', 'to', 'for', 'de', 'la', 'le', 'el', 'it', 'its', 'i']);
    const RECALL_THRESHOLD = 0.8;
    const F1_THRESHOLD = 0.6;
    // Words that identify companion/non-game products (guides, walkthroughs, etc.).
    // If the candidate title contains any of these but the needle does not, the
    // candidate is categorically a different product and must be rejected.
    // e.g. "Cult of the Lamb: The Ultimate Guide" must not match "Cult of the Lamb".
    const COMPANION_WORDS = new Set([
      'guide', 'guides', 'walkthrough', 'walkthroughs', 'tips', 'hints', 'cheats',
      'cheat', 'strategy', 'strategies', 'companion', 'handbook', 'manual', 'demo',
      'demos', 'preview', 'previews', 'tutorial', 'tutorials', 'achievement',
      'achievements','trophy', 'trophies', 'wiki', 'unofficial', 'server', 'servers',
      'mod', 'mods', 'dlc', 'expansion','expansions', 'season pass', 'Add-Ons', 'Add-On',
      'vip', 'bundle', 'bundles'
    ]);
    const findBestMatch = (results: MSProduct[], needle: string): { match: MSProduct; score: number } | undefined => {
      const needleTokens = tokenise(needle);
      const needleNumbers = needleTokens.filter((t) => /^\d+$/.test(t));
      const needleNumberSet = new Set(needleNumbers);
      const needleWordSet = new Set(needleTokens);
      // Use meaningful (non-stopword, non-numeric) tokens for scoring.
      // Fall back to all word-tokens if everything is a stopword/number.
      const allNeedleWords = needleTokens.filter((t) => !/^\d+$/.test(t));
      const meaningfulNeedleWords = allNeedleWords.filter((t) => !STOPWORDS.has(t));
      const scoringNeedleWords = meaningfulNeedleWords.length > 0 ? meaningfulNeedleWords : allNeedleWords;
      const scoringNeedleSet = new Set(scoringNeedleWords);

      let bestMatch: MSProduct | undefined;
      let bestScore = -1;

      for (const result of results) {
        const hayTokens  = tokenise(result.title ?? '');
        const haySet     = new Set(hayTokens);
        const hayNumbers = hayTokens.filter((t) => /^\d+$/.test(t));
        const allHayWords = hayTokens.filter((t) => !/^\d+$/.test(t));
        const meaningfulHayWords = allHayWords.filter((t) => !STOPWORDS.has(t));
        const scoringHayWords = meaningfulHayWords.length > 0 ? meaningfulHayWords : allHayWords;
        const scoringHaySet = new Set(scoringHayWords);

        // Hard gate: every number from the needle must appear in the candidate.
        // e.g. needle "Forza Horizon 3" rejects "Forza Horizon 6".
        if (needleNumbers.some((n) => !haySet.has(n))) continue;

        // Reverse hard gate: every number in the candidate must also appear in
        // the needle. Prevents "S.T.A.L.K.E.R. 2: Heart of Chornobyl" from
        // matching a needle like "S.T.A.L.K.E.R.: Shadow of Chernobyl" that
        // carries no number tokens at all.
        if (hayNumbers.some((n) => !needleNumberSet.has(n))) continue;

        // Companion-content gate: if the candidate contains a guide/walkthrough/etc.
        // word that the needle does not, it's a companion product — not the game itself.
        // e.g. "Cult of the Lamb: The Ultimate Guide" rejected for needle "Cult of the Lamb".
        if (hayTokens.some((t) => COMPANION_WORDS.has(t) && !needleWordSet.has(t))) continue;

        const intersection = scoringNeedleWords.filter((t) => scoringHaySet.has(t)).length;
        const recall    = scoringNeedleSet.size > 0 ? intersection / scoringNeedleSet.size : 1;
        const precision = scoringHaySet.size   > 0 ? intersection / scoringHaySet.size    : 0;
        const f1 = (recall + precision) > 0 ? 2 * recall * precision / (recall + precision) : 0;

        if (recall >= RECALL_THRESHOLD && f1 >= F1_THRESHOLD && f1 > bestScore) {
          bestScore = f1;
          bestMatch = result;
        }
      }

      return bestMatch ? { match: bestMatch, score: bestScore } : undefined;
    };

    try {
      // --- First attempt: full title ---
      let results = await searchProducts(titleName);
      let found = findBestMatch(results, titleName);

      // --- Second attempt: strip subtitle (everything after ":") ---
      // The Store search API struggles with long subtitle-containing queries like
      // "S.T.A.L.K.E.R. 2: Heart of Chornobyl" and may return 0 relevant results.
      // Retrying with just the main title often surfaces the right product; we still
      // match against the FULL original needle so the subtitle tokens boost precision.
      if (!found && titleName.includes(':')) {
        const mainTitle = titleName.split(':')[0].trim();
        logger.info({ titleName, mainTitle }, '[MSStore] No match with full title — retrying with main title only');
        results = await searchProducts(mainTitle);
        found = findBestMatch(results, titleName);
      }

      if (!found) {
        logger.info(
          { titleName, resultTitles: results.slice(0, 5).map((r) => r.title) },
          '[MSStore] No confident title match — trying Display Catalog fallback',
        );

        // --- Third attempt: Microsoft Display Catalog ---
        // Covers Xbox-console-only titles not indexed on apps.microsoft.com.
        // The displaycatalog API always returns at most 10 results; pagination params
        // (skipItems, pageIndex) are silently ignored. To maximise coverage we probe
        // the same endpoint with several progressively narrower keyword queries and
        // stop at the first confident match.
        //
        // Probe strategy (deduplicated, max 5 queries):
        //  1. All normalised tokens as-is           — "red dead redemption 2"
        //  2. Meaningful tokens (no stopwords/nums) — "star wars jedi fallen order"
        //  3. Without any numeric tokens            — "red dead redemption"   (strips "2")
        //  4. First 3 meaningful tokens             — "star wars jedi"
        //  5. First 2 meaningful tokens             — "star wars"
        //
        // Each probe result set is matched against the FULL original needle via
        // findBestMatch (same recall/F1 thresholds) to stay safe against false positives.
        type DCProduct = {
          ProductId?: string;
          ProductKind?: string;
          LocalizedProperties?: Array<{
            ProductTitle?: string;
            Images?: Array<{ ImagePurpose?: string; Uri?: string }>;
          }>;
        };
        const DC_IMG_PRIO = ['Poster', 'BoxArt', 'SuperHeroArt', 'BrandedKeyArt'];
        const DC_BASE = 'https://displaycatalog.mp.microsoft.com/v7.0/productFamilies/Games/products?market=US&languages=en-US&top=10';
        const DC_HEADERS = {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'MS-CV': '0.0',
        };

        /** Parse a raw displaycatalog Products[] into MSProduct[] with embedded images. */
        const parseDCProducts = (raw: DCProduct[]): MSProduct[] =>
          raw
            .filter((p) => p.ProductKind === 'Game')
            .flatMap((p): MSProduct[] => {
              const lp = p.LocalizedProperties?.[0];
              const title = lp?.ProductTitle;
              const productId = p.ProductId;
              if (!title || !productId) return [];
              const imgs = lp?.Images ?? [];
              for (const purpose of DC_IMG_PRIO) {
                const img = imgs.find((i) => i.ImagePurpose === purpose);
                if (img?.Uri) return [{ productId, title, posterArtUrl: this.addMSCDNSize(`https:${img.Uri}`) }];
              }
              return [{ productId, title }];
            });

        /**
         * Build an ordered list of probe queries for displaycatalog, deduped, max 9.
         *
         * The API ignores pagination — every param combo returns the same 10. The only
         * way to surface different results is with different query strings.
         *
         * Probe order (most-specific first, so we stop early on hits):
         *  1. Full normalised tokens              "star wars jedi fallen order"
         *  2. Meaningful only (no nums/stops/'i') "red dead redemption"  (strips "2")
         *  3. No numeric tokens                   "red dead redemption"  (strips "2")
         *  4. Subtitle raw tokens (after ':')     "fallen order" / "heart of chornobyl"
         *  5. Subtitle meaningful tokens          "fallen order" / "heart chornobyl"
         *  6. No-single-char meaningful tokens    "dante inferno" (strips stray letters
         *                                          from apostrophes: "dante's" → "dante s"
         *                                          → strip "s" → "dante")
         *  7. Last 3 meaningful tokens            "jedi fallen order"
         *  8. Last 2 meaningful tokens            "fallen order"
         *  9. First 3 meaningful tokens           "star wars jedi"
         * 10. First 2 meaningful tokens           "star wars"
         * 11. First multi-char token alone        "dante"  (last-resort single-keyword)
         */
        const buildDCProbes = (name: string): string[] => {
          const toks = tokenise(name);
          const isNum = (t: string) => /^\d+$/.test(t);
          const noNums = toks.filter((t) => !isNum(t));
          const meaningful = noNums.filter((t) => !STOPWORDS.has(t));
          // Tokens longer than 1 char — strips stray single letters produced by
          // possessives ("dante's" → ["dante","s"]) and Roman numeral ordinaries ("i").
          const longMeaningful = meaningful.filter((t) => t.length > 1);

          // Subtitle: raw text after the first ':'
          const colonIdx = name.indexOf(':');
          const subtitleToks = colonIdx >= 0 ? tokenise(name.slice(colonIdx + 1)) : [];
          const subtitleMeaningful = subtitleToks.filter((t) => !isNum(t) && !STOPWORDS.has(t));

          // Single-keyword last-resort: first multi-char meaningful token
          const firstLongToken = longMeaningful[0] ?? '';

          const candidates: string[] = [
            toks.join(' '),                            // 1. full normalised
            meaningful.join(' '),                      // 2. meaningful only
            noNums.join(' '),                          // 3. no numbers
            subtitleToks.join(' '),                    // 4. subtitle raw
            subtitleMeaningful.join(' '),               // 5. subtitle meaningful
            longMeaningful.join(' '),                   // 6. no-single-char meaningful
            meaningful.slice(-3).join(' '),             // 7. last 3 meaningful
            meaningful.slice(-2).join(' '),             // 8. last 2 meaningful
            meaningful.slice(0, 3).join(' '),           // 9. first 3 meaningful
            meaningful.slice(0, 2).join(' '),           // 10. first 2 meaningful
            firstLongToken,                             // 11. first single keyword (last resort)
          ];

          const seen = new Set<string>();
          // Require at least 2 chars; the single-keyword probe is allowed if >= 3 chars.
          return candidates
            .filter((p) => {
              if (!p || seen.has(p)) return false;
              seen.add(p);
              // Single-char strings are noise; single-keyword probes need >= 3 chars.
              return p.includes(' ') ? p.length > 1 : p.length >= 3;
            })
            .slice(0, 9);
        };

        const probes = buildDCProbes(titleName);
        logger.info({ titleName, probes }, '[DisplayCatalog] Probe queries');

        for (const probe of probes) {
          const dcUrl = `${DC_BASE}&query=${encodeURIComponent(probe)}`;
          logger.info({ titleName, probe, dcUrl }, '[DisplayCatalog] Fetching probe');

          let dcProducts: MSProduct[] = [];
          try {
            const dcRes = await fetch(dcUrl, { headers: DC_HEADERS, signal: AbortSignal.timeout(10_000) });
            if (dcRes.ok) {
              const dcRaw = await dcRes.json() as { Products?: DCProduct[] };
              dcProducts = parseDCProducts(dcRaw.Products ?? []);
              logger.info(
                { titleName, probe, resultCount: dcProducts.length, resultTitles: dcProducts.slice(0, 5).map((r) => r.title) },
                '[DisplayCatalog] Probe results',
              );
            } else {
              logger.warn({ titleName, probe, status: dcRes.status }, '[DisplayCatalog] Non-OK response');
            }
          } catch (dcErr) {
            logger.warn({ titleName, probe, err: String(dcErr) }, '[DisplayCatalog] Fetch failed');
          }

          const dcFound = findBestMatch(dcProducts, titleName);
          if (dcFound) {
            const { match: dcMatch, score: dcScore } = dcFound;
            const dcProductId = dcMatch.productId ?? '';
            logger.info(
              { titleName, probe, matchedTitle: dcMatch.title, productId: dcProductId, f1Score: dcScore.toFixed(2) },
              '[DisplayCatalog] Title matched',
            );
            if (dcMatch.posterArtUrl) {
              return { imageUrl: dcMatch.posterArtUrl, productId: dcProductId };
            }
            logger.info({ titleName, probe, productId: dcProductId }, '[DisplayCatalog] Match found but no suitable image in result');
          }
        }

        logger.info({ titleName, probeCount: probes.length }, '[DisplayCatalog] No confident match across all probes — all sources exhausted');
        return undefined;
      }

      const { match: bestMatch, score: bestScore } = found;
      const productId = bestMatch.productId ?? '';
      logger.info({ titleName, matchedTitle: bestMatch.title, productId, f1Score: bestScore.toFixed(2) }, '[MSStore] Title matched');

      // Use posterArtUrl shortcut first (already the best portrait image)
      if (bestMatch.posterArtUrl) {
        const sizedUrl = this.addMSCDNSize(bestMatch.posterArtUrl);
        logger.info({ titleName, matchedTitle: bestMatch.title, productId, url: sizedUrl }, 'Found Microsoft Store grid image (posterArtUrl)');
        return { imageUrl: sizedUrl, productId };
      }

      // Fall back to the images array
      const IMAGE_PRIORITY = ['Poster', 'BrandedKeyArt', 'BoxArt', 'SquareMobileTile'];
      const images = bestMatch.images ?? [];
      for (const type of IMAGE_PRIORITY) {
        const img = images.find((i) => i.imageType === type && i.url);
        if (img?.url) {
          const sizedUrl = this.addMSCDNSize(img.url);
          logger.info({ titleName, matchedTitle: bestMatch.title, productId, type, url: sizedUrl }, 'Found Microsoft Store grid image');
          return { imageUrl: sizedUrl, productId };
        }
      }

      logger.info({ titleName, availableTypes: images.map((i) => i.imageType) }, '[MSStore] No suitable image type in result');
      return undefined;
    } catch (err) {
      logger.warn({ titleName, err: String(err) }, '[MSStore] Search threw unexpected error');
      return undefined;
    }
  }
  /**
   * Fetch a portrait grid image URL using the Emerald Xbox services API.
   * This is the API that powers xbox.com product pages and accepts a Microsoft
   * Store product ID (e.g. "9N2ZDN7NWQKV") — NOT an Xbox numeric titleId.
   *
   * The productId is obtained from `fetchMicrosoftStoreGridUrl()` which returns
   * it alongside the image URL. Use this as a fallback when the Store search
   * found a match (so we have the productId) but the image download failed,
   * or when you want a richer structured image set.
   *
   * Image priority: poster → boxArt → superHeroArt
   * No authentication required — public API with browser-like headers.
   */
  async fetchEmeraldImageUrl(productId: string): Promise<string | undefined> {
    if (!productId) return undefined;
    // Emerald only accepts short Store product IDs (e.g. 9NBLGGH4NNS1 / BNLG5J5KDVJ3).
    // UUID-format IDs (e.g. d3270100-495e-44f5-ab77-d255362a3073) are internal catalog
    // GUIDs from apps.microsoft.com and always return 404 from Emerald.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (UUID_RE.test(productId)) {
      logger.debug({ productId }, '[Emerald] Skipping UUID-format productId — not a Store product ID');
      return undefined;
    }
    const url = `https://emerald.xboxservices.com/xboxcomfd/productDetails/${encodeURIComponent(productId)}?locale=en-US&enableFullDetail=true&deviceType=desktop`;
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'x-ms-api-version': '2.0',
          'ms-cv': '0.0',
          Origin: 'https://www.xbox.com',
          Referer: 'https://www.xbox.com/',
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        let body = '';
        try { body = await response.text(); } catch (_) { /* ignore */ }
        logger.warn({ productId, status: response.status, body: body.slice(0, 300) }, '[Emerald] Non-OK response from productDetails');
        return undefined;
      }

      const json = await response.json() as {
        productSummaries?: Array<{
          productId?: string;
          title?: string;
          images?: {
            poster?: { url?: string };
            boxArt?: { url?: string };
            superHeroArt?: { url?: string };
          };
        }>;
      };

      const summary = json?.productSummaries?.[0];
      if (!summary) {
        logger.warn({ productId, keys: Object.keys(json ?? {}) }, '[Emerald] Response had no productSummaries');
        return undefined;
      }

      const rawImageUrl =
        summary.images?.poster?.url ??
        summary.images?.boxArt?.url ??
        summary.images?.superHeroArt?.url;

      if (rawImageUrl) {
        const imageUrl = this.addMSCDNSize(rawImageUrl);
        logger.info({ productId, title: summary.title, url: imageUrl }, '[Emerald] Image URL found');
        return imageUrl;
      }

      logger.warn({ productId, title: summary.title, imageKeys: Object.keys(summary.images ?? {}) }, '[Emerald] No usable image field in productSummaries[0]');
      return undefined;
    } catch (err) {
      logger.warn({ productId, err: String(err) }, '[Emerald] Image lookup threw');
      return undefined;
    }
  }

  /**
   * Fetch a cover-art URL from PCGamingWiki's MediaWiki API.
   * Completely public — no API key required.
   *
   * Strategy:
   *  1. Search PCGW for the game name; token-match results with 80% recall guard.
   *  2. Fetch infobox wikitext for the matched page; extract `|cover = <filename>`.
   *  3. Resolve the file URL via MediaWiki imageinfo API.
   *
   * NOTE: Do NOT pass a Referer header when downloading the returned URL —
   * the images.pcgamingwiki.com CDN allows requests with no Referer but
   * blocks requests whose Referer header is present and not on an allowlist.
   */
  async fetchPCGamingWikiImageUrl(gameName: string): Promise<string | undefined> {
    const BASE = 'https://www.pcgamingwiki.com/w/api.php';
    const HEADERS = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'application/json',
    };
    const TIMEOUT = 10_000;
    const RECALL_THRESHOLD = 0.8;
    const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'or', 'de']);
    const tokenise = (s: string) =>
      s.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean);

    gameName = this.stripPlatformSuffix(gameName);
    const needle = this.expandAbbreviations(gameName) ?? gameName;
    const needleAllTokens = tokenise(needle);
    const needleNumbers = needleAllTokens.filter((t) => /^\d+$/.test(t));
    const needleNumberSet = new Set(needleNumbers);
    const needleTokens = needleAllTokens.filter((t) => !STOPWORDS.has(t) && t.length >= 2);

    try {
      const searchUrl = `${BASE}?action=query&list=search&srsearch=${encodeURIComponent(needle)}&srlimit=5&format=json`;
      const searchRes = await fetch(searchUrl, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT) });
      if (!searchRes.ok) return undefined;
      const searchJson = await searchRes.json() as {
        query?: { search?: Array<{ title: string; pageid: number }> };
      };
      const hits = searchJson.query?.search ?? [];
      if (hits.length === 0) return undefined;

      let bestHit: { title: string; pageid: number } | undefined;
      for (const hit of hits) {
        const hitAllTokens = tokenise(hit.title);
        const hitSet = new Set(hitAllTokens);
        const hitNumbers = hitAllTokens.filter((t) => /^\d+$/.test(t));
        // Hard gate: every number in the needle must appear in the candidate.
        // e.g. "Forza Horizon 3" must not match "Forza Horizon 6".
        if (needleNumbers.some((n) => !hitSet.has(n))) continue;
        // Reverse hard gate: every number in the candidate must appear in the needle.
        // e.g. "Forza Horizon" (no numbers) must not match "Forza Horizon 5".
        if (hitNumbers.some((n) => !needleNumberSet.has(n))) continue;
        const hitTokens = new Set(hitAllTokens.filter((t) => !STOPWORDS.has(t) && t.length >= 2));
        const matchCount = needleTokens.filter((t) => hitTokens.has(t)).length;
        const recall = needleTokens.length > 0 ? matchCount / needleTokens.length : 1;
        if (recall >= RECALL_THRESHOLD) { bestHit = hit; break; }
      }
      if (!bestHit) {
        logger.info({ gameName: needle, hits: hits.map((h) => h.title) }, '[PCGW] No confident title match');
        return undefined;
      }
      logger.info({ gameName: needle, matchedTitle: bestHit.title }, '[PCGW] Title matched');

      const contentUrl = `${BASE}?action=query&pageids=${bestHit.pageid}&prop=revisions&rvprop=content&rvsection=0&format=json`;
      const contentRes = await fetch(contentUrl, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT) });
      if (!contentRes.ok) return undefined;
      const contentJson = await contentRes.json() as {
        query?: { pages?: Record<string, { revisions?: Array<{ '*': string }> }> };
      };
      const wikitext = Object.values(contentJson.query?.pages ?? {})[0]?.revisions?.[0]?.['*'] ?? '';
      const coverMatch = wikitext.match(/\|\s*cover\s*=\s*([^\n|{}]+)/);
      if (!coverMatch) {
        logger.info({ gameName: needle, title: bestHit.title }, '[PCGW] No cover field in infobox');
        return undefined;
      }
      const coverFilename = coverMatch[1].trim();
      logger.info({ gameName: needle, title: bestHit.title, coverFilename }, '[PCGW] Cover filename found');

      const fileTitle = `File:${coverFilename}`;
      const imageInfoUrl = `${BASE}?action=query&titles=${encodeURIComponent(fileTitle)}&prop=imageinfo&iiprop=url&format=json`;
      const imageInfoRes = await fetch(imageInfoUrl, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT) });
      if (!imageInfoRes.ok) return undefined;
      const imageInfoJson = await imageInfoRes.json() as {
        query?: { pages?: Record<string, { imageinfo?: Array<{ url?: string }> }> };
      };
      const rawImageUrl = Object.values(imageInfoJson.query?.pages ?? {})[0]?.imageinfo?.[0]?.url;
      if (!rawImageUrl) {
        logger.info({ gameName: needle, title: bestHit.title, coverFilename }, '[PCGW] No image URL in imageinfo');
        return undefined;
      }
      // imageinfo can return http:// — upgrade to https://.
      const imageUrl = rawImageUrl.replace(/^http:\/\//i, 'https://');
      logger.info({ gameName: needle, title: bestHit.title, url: imageUrl }, '[PCGW] Image URL found');
      return imageUrl;
    } catch (err) {
      logger.warn({ gameName: needle, err: String(err) }, '[PCGW] Lookup threw');
      return undefined;
    }
  }

  /**
   * Fetch a cover-art URL from the Wikipedia REST API.
   * Completely public — no API key required.
   *
   * Strategy:
   *  1. Build a Wikipedia article slug from the game name (title-case, spaces → _,
   *     special chars encoded).
   *  2. Fetch /page/summary/{slug}. Accept pages of type "standard" only.
   *  3. If the first slug returns a disambiguation page or 404, retry with the
   *     "(video game)" disambiguation suffix appended.
   *
   * Image priority: originalimage (full-res box art) → thumbnail.
   */
  async fetchWikipediaImageUrl(gameName: string): Promise<string | undefined> {
    // Strip platform suffixes before building Wikipedia slugs so
    // "Cult of the Lamb Xbox" searches as "Cult of the Lamb" etc.
    gameName = this.stripPlatformSuffix(gameName);

    /**
     * Small words kept lowercase in slugs (unless they are the first word).
     * Wikipedia titling convention: prepositions/articles stay lowercase.
     * e.g. "Gears_of_War_2" NOT "Gears_Of_War_2" (the latter 404s).
     */
    const SMALL_WORDS = new Set([
      'a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'for',
      'and', 'or', 'but', 'nor', 'de', 'la', 'le', 'el',
      'as', 'by', 'up', 'vs',
    ]);

    /** Build a Wikipedia slug from a game title. */
    const makeSlug = (name: string): string =>
      name
        .replace(/[™®©]/g, '')              // strip trademark/copyright symbols
        .trim()
        .split(/\s+/)
        .map((w, i) => {
          const lower = w.toLowerCase();
          // All-caps abbreviations (e.g. "LA", "GTA", "HH") must never be
          // lowercased — they are not the small French/Spanish articles that
          // share the same letters.
          const isAllCapsAbbrev = w.length > 1 && w === w.toUpperCase() && /^[A-Z]/.test(w);
          // Always capitalise the first word; keep small prepositions lowercase
          // unless the word is an all-caps abbreviation.
          if (i === 0) return w.charAt(0).toUpperCase() + w.slice(1);
          if (SMALL_WORDS.has(lower) && !isAllCapsAbbrev) return lower;
          return w.charAt(0).toUpperCase() + w.slice(1);
        })
        .join('_')
        .replace(/:/g, '%3A')
        .replace(/[''\u2019]/g, '%27')       // straight + curly apostrophes
        .replace(/&/g, '%26')
        .replace(/\?/g, '%3F');

    /**
     * Fetch the Wikipedia summary for a slug and verify the article is a
     * "standard" page (not disambiguation). Returns both the image URL and
     * the article title so callers can run a relevance check.
     */
    const fetchSummary = async (slug: string): Promise<{ imageUrl: string; title: string } | undefined> => {
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`;
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'cpak/1.0 (game-image-lookup; contact via GitHub)',
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(8_000),
        });
        if (!res.ok) return undefined;
        const data = await res.json() as {
          type?: string;
          title?: string;
          originalimage?: { source?: string };
          thumbnail?: { source?: string };
        };
        if (data.type !== 'standard') return undefined;  // skip disambig / missing pages
        const imageUrl = data.originalimage?.source ?? data.thumbnail?.source;
        if (!imageUrl) return undefined;
        return { imageUrl, title: data.title ?? '' };
      } catch {
        return undefined;
      }
    };

    // Local alias so buildSlugVariants can call it without `this`.
    const expandAbbreviations = (n: string) => this.expandAbbreviations(n);

    /**
     * Build canonical Wikipedia slug variants for a game name, ordered from
     * most-specific to least-specific.
     *
     * Key principles:
     *  - Try "_(video_game)" FIRST so movies/shows sharing a game title
     *    (e.g. "Toy Story 3") are bypassed in favour of the game article.
     *  - Expand known Xbox library abbreviations ("MOH", "TC's", "HH", "FS").
     *  - Drop short leading prefixes / possessives ("TC's", "MOH") and also
     *    expand the resulting string.
     *  - Try subtitle-only slug for colon-separated names.
     */
    const buildSlugVariants = (name: string): string[] => {
      const variants: string[] = [];
      const seen = new Set<string>();

      /** Add slug + its _(video_game) companion, both deduplicated.
       * Does NOT append _(video_game) if the slug already ends with it. */
      const push = (s: string) => {
        if (!s) return;
        if (!seen.has(s)) { seen.add(s); variants.push(s); }
        if (!s.endsWith('_(video_game)')) {
          const vg = `${s}_(video_game)`;
          if (!seen.has(vg)) { seen.add(vg); variants.push(vg); }
        }
      };

      const primary = makeSlug(name);

      // _(video_game) comes BEFORE plain slug — avoids matching movie/show
      // articles that share a title with the game (e.g. Toy Story 3).
      push(`${primary}_(video_game)`);
      push(primary);

      // Expand known abbreviations (e.g. "MOH Airborne" → "Medal of Honor: Airborne")
      const expandedPrimary = expandAbbreviations(name);
      if (expandedPrimary) push(makeSlug(expandedPrimary));

      // Subtitle only: text after the first ':' (e.g. "Spidey: Web of Shadows" → "Web of Shadows")
      const colonIdx = name.indexOf(':');
      if (colonIdx > 0) {
        const subtitle = name.slice(colonIdx + 1).trim();
        if (subtitle) push(makeSlug(subtitle));
      }

      // Drop a short leading abbreviation/possessive token and retry,
      // including with abbreviation expansion on the remainder.
      // e.g. "TC's Ghost Recon FS" → drop "TC's" → "Ghost Recon FS"
      //      → expand "FS" → "Ghost Recon: Future Soldier"
      const words = name.split(/\s+/);
      if (words.length >= 2) {
        const first = words[0];
        const rest  = words.slice(1).join(' ');
        if (first.length <= 3 || /['''\u2019]s$/i.test(first)) {
          push(makeSlug(rest));
          const restExpanded = expandAbbreviations(rest);
          if (restExpanded) push(makeSlug(restExpanded));
        }
      }

      return variants;
    };

    const slugVariants = buildSlugVariants(gameName);
    logger.info({ gameName, slugVariants }, '[Wikipedia] Trying slug variants');

    // Tokens from the game name used to reject completely irrelevant articles.
    // Use the expanded form when available so abbreviated names ("GTA IV" →
    // "Grand Theft Auto IV", "Spidey" → "Spider-Man") share tokens with the
    // actual Wikipedia article title and pass the recall check.
    const nameForTokens = this.expandAbbreviations(gameName) ?? gameName;
    const gameKeyTokens = nameForTokens
      .toLowerCase()
      .replace(/[^a-z0-9]/g, ' ')
      .split(/\s+/)
      // Include tokens of length >= 2 so short but meaningful tokens like
      // "iv" (Grand Theft Auto IV) participate in the relevance check.
      .filter((t) => t.length >= 2 && !SMALL_WORDS.has(t));
    for (const slug of slugVariants) {
      const result = await fetchSummary(slug);
      if (!result) continue;

      // Relevance guard: article title must share >= 80% of the game's meaningful
      // tokens (same recall threshold as MS Store matching). A single shared token
      // is not enough — e.g. "Cult of the Lamb" vs a redirect to "Cult of the Dude"
      // share only "cult", which would pass a naïve `.some()` check but is wrong.
      if (gameKeyTokens.length > 0) {
        const articleTokens = new Set(
          result.title.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean),
        );
        const matchCount = gameKeyTokens.filter((t) => articleTokens.has(t)).length;
        const recall = matchCount / gameKeyTokens.length;
        if (recall < 0.8) {
          logger.info({ gameName, slug, articleTitle: result.title, matchCount, total: gameKeyTokens.length }, '[Wikipedia] Article not relevant — skipping');
          continue;
        }
      }

      logger.info({ gameName, slug, articleTitle: result.title, url: result.imageUrl }, '[Wikipedia] Image found');
      return result.imageUrl;
    }

    logger.info({ gameName }, '[Wikipedia] No image found after all slug variants');
    return undefined;
  }
}

export function createXboxAdapter(): XboxAdapter {
  return new XboxAdapter();
}
