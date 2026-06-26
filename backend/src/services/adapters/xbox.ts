import { live, xnet, XSAPIClient } from '@xboxreplay/xboxlive-auth';
import pLimit from 'p-limit';
import { logger } from '../../utils/logger.js';
import { rateLimiter } from '../rateLimiter.js';
import { Game } from '../../models/game.js';
import { Achievement } from '../../models/achievement.js';
import { SyncOperation } from '../../models/syncOperation.js';
import { imageStorage } from '../../utils/imageStorage.js';
import { createIGDBAdapter } from './igdb.js';
import { AdaptiveBatchController } from '../adaptiveBatchController.js';
import { AdaptiveThrottler } from '../adaptiveThrottler.js';
import { AdaptiveConcurrencyController } from '../adaptiveConcurrencyController.js';
import { SYNC_DEFAULTS } from '../syncDefaults.js';
import type { SteamGridDBAdapter } from './steamgriddb.js';

// ---------------------------------------------------------------------------
// Microsoft Store search — rate-limit / anti-bot protection
// ---------------------------------------------------------------------------
// apps.microsoft.com returns 403 (WAF bot detection) when many requests arrive
// from the same server IP in parallel. We throttle search requests with a
// short pause between them and retry once with a longer backoff on 403.
const _msStoreGapMs   = 2_000;   // pause before each queued request
const _msStoreRetryMs = 5_000; // backoff after a 403 before single retry
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
  /**
   * Last played/unlocked timestamp.
   * v1 (Xbox 360): `lastPlayed` field from the title history response.
   * v2 (modern Xbox): `lastUnlock` field (last achievement unlock — closest available proxy).
   */
  lastPlayed?: string;
  /**
   * True when this titleId appeared in the GS5 or GS4 all-earned-achievements scan.
   * The scan only surfaces titles where the user has actually earned at least one achievement.
   * Used in Phase 5 as a guard: if the per-title achievements API temporarily returns
   * 0 unlocked (stale/cached data), we preserve the game rather than deleting it.
   */
  inEarnedScan?: boolean;
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
  /** Concurrency limiter for Microsoft Store search requests (WAF rate-limit protection). */
  private readonly _msStoreQueue: ReturnType<typeof pLimit>;

  constructor(concurrency = 2) {
    this._msStoreQueue = pLimit(concurrency);
  }

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
  /**
   * Retry helper for Xbox auth token exchanges.
   * The @xboxreplay/xboxlive-auth library has a hardcoded 10s timeout per request.
   * Microsoft auth endpoints are occasionally slow — a single retry on timeout
   * is usually sufficient to succeed.
   */
  private async _authWithRetry<T>(fn: () => Promise<T>, label: string, maxAttempts = 3): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        const isTimeout =
          err?.message?.includes('timeout') ||
          err?.message?.includes('aborted') ||
          err?.name === 'TimeoutError' ||
          err?.name === 'AbortError';
        if (!isTimeout || attempt === maxAttempts) throw err;
        lastErr = err;
        const backoff = attempt * 2000;
        logger.warn({ label, attempt, backoff }, `Xbox auth step timed out — retrying in ${backoff}ms`);
        await _sleep(backoff);
      }
    }
    throw lastErr;
  }

  private async _exchangeLiveAccessTokenForBundle(
    accessToken: string,
    refreshToken: string | null,
  ): Promise<XboxTokenBundle> {
    // Step 2: Exchange Live access token for Xbox User Token
    // Preamble 'd' means the access_token is used directly as RPS ticket.
    // We keep the User Token — it is needed for XBL2.0 auth (image CDN).
    const userTokenResponse = await this._authWithRetry(
      () => xnet.exchangeRpsTicketForUserToken(accessToken, 'd'),
      'exchangeRpsTicketForUserToken',
    );
    const userToken = userTokenResponse.Token;

    // Step 3: Exchange User Token for XSTS Token (used for all Xbox Live API calls)
    const xstsResponse = await this._authWithRetry(
      () => xnet.exchangeTokenForXSTSToken(userToken),
      'exchangeTokenForXSTSToken',
    );

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
      /** v1: actual last played timestamp; absent in v2 (v2 uses lastUnlock) */
      lastPlayed?: string;
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

    // Fetch both contract versions of history AND a full GS5 achievement scan in parallel.
    // v2 history = Xbox One / Series / modern PC (GS5)
    // v1 history = Xbox 360 legacy titles (GS4)
    // GS5 all-achievements scan = hits every title the user has EVER earned an achievement
    //   in, including titles that no longer appear in the history endpoint (e.g. older
    //   PC/UWP titles like RUSH: A Disney•PIXAR Adventure). Each GS5 achievement record
    //   carries a `titleAssociations` array with the game title name and ID, allowing us
    //   to reconstruct the title list without a separate title-info lookup.

    /** Minimal shape we need from the GS5 all-achievements scan. */
    type GS5TitleScanAchievement = {
      titleAssociations?: Array<{ name: string; id: string | number }>;
      /**
       * 'Achieved' | 'InProgress' | 'NotStarted'
       * The scan endpoint returns progress records for every game the user has ever
       * launched, not just earned achievements. We MUST check this field to distinguish
       * games where the user has actually earned something.
       */
      progressState?: string;
    };
    type GS5TitleScanResponse = {
      achievements?: GS5TitleScanAchievement[];
      pagingInfo?: { continuationToken?: string; totalRecords?: number };
    };

    /** Minimal shape we need from the GS4 (Xbox 360) all-achievements scan. */
    type GS4TitleScanAchievement = {
      /** GS4: titleId is directly on the achievement object (contract v1) */
      titleId?: string | number;
      /** Some v1 responses may also carry titleAssociations; handle both shapes */
      titleAssociations?: Array<{ name: string; id: string | number }>;
    };
    type GS4TitleScanResponse = {
      achievements?: GS4TitleScanAchievement[];
      pagingInfo?: { continuationToken?: string; totalRecords?: number };
    };

    const fetchAllGS5TitlesFromAchievements = async (): Promise<Map<string, string>> => {
      const titleMap = new Map<string, string>(); // titleId → name
      let token: string | null = null;
      // Use maxItems=1000 to reduce page count (~10 pages vs ~100 at 100/page).
      // If the API caps lower, it simply returns fewer items — no harm done.
      const baseAchUrl = `https://achievements.xboxlive.com/users/xuid(${xuid})/achievements?maxItems=1000`;
      let pageNum = 0;
      const MAX_PAGE_ATTEMPTS = 5; // per-page retry budget (on top of rateLimiter retries)
      let consecutiveFailures = 0;
      const MAX_CONSECUTIVE_FAILURES = 3; // give up after 3 consecutive page-level failures
      do {
        const url: string = token
          ? `${baseAchUrl}&continuationToken=${encodeURIComponent(token)}`
          : baseAchUrl;

        let result: GS5TitleScanResponse | null = null;
        let pageSuccess = false;
        for (let pageAttempt = 1; pageAttempt <= MAX_PAGE_ATTEMPTS; pageAttempt++) {
          try {
            result = await rateLimiter.executeWithRetry<GS5TitleScanResponse>(
              'xbox',
              async (): Promise<GS5TitleScanResponse> => {
                // Let errors propagate so executeWithRetry can retry on timeout/429
                const resp = await XSAPIClient.get<GS5TitleScanResponse>(url, {
                  options: { XSTSToken: xstsToken, userHash, contractVersion: '2' },
                });
                return resp.data;
              },
              `gs5scan:${xuid}:${pageNum}`,
            );
            pageSuccess = true;
            consecutiveFailures = 0;
            break;
          } catch (err: any) {
            logger.warn(
              { err: err?.message ?? String(err), xuid, page: pageNum, pageAttempt, maxPageAttempts: MAX_PAGE_ATTEMPTS },
              'GS5 all-achievements scan page failed — retrying',
            );
            if (pageAttempt < MAX_PAGE_ATTEMPTS) {
              // Exponential backoff: 2s, 4s, 8s, 16s
              await _sleep(2000 * Math.pow(2, pageAttempt - 1));
            }
          }
        }

        if (!pageSuccess || !result) {
          consecutiveFailures++;
          logger.error(
            { xuid, page: pageNum, consecutiveFailures, maxConsecutive: MAX_CONSECUTIVE_FAILURES },
            'GS5 all-achievements scan page exhausted all retries',
          );
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            logger.error({ xuid, page: pageNum }, 'GS5 scan: too many consecutive failures — stopping');
            break;
          }
          // Can't skip pages with continuationToken pagination — must stop
          break;
        }

        pageNum++;
        for (const ach of result.achievements ?? []) {
          const assoc = ach.titleAssociations?.[0];
          if (assoc && assoc.id !== undefined && assoc.name) {
            const tid = String(assoc.id);
            // Only consider a title "earned" when at least one of its achievements
            // has progressState === 'Achieved'. The endpoint returns progress records
            // for every game ever launched, including games with 0 earned achievements.
            if (ach.progressState === 'Achieved') {
              titleMap.set(tid, assoc.name);
            }
          }
        }
        token = result.pagingInfo?.continuationToken ?? null;
        if (pageNum === 1) {
          logger.info(
            { xuid, totalRecords: result.pagingInfo?.totalRecords, firstPageCount: result.achievements?.length },
            'GS5 all-achievements scan first page',
          );
        }
      } while (token !== null);
      logger.info(
        { xuid, earnedTitleCount: titleMap.size, pagesScanned: pageNum, earnedTitles: [...titleMap.entries()].map(([id, name]) => ({ id, name })) },
        'GS5 all-achievements scan complete — earned titles',
      );
      return titleMap;
    };

    const fetchAllGS4TitlesFromAchievements = async (): Promise<Map<string, string>> => {
      // GS4 (Xbox 360) all-earned-achievements scan using contract version 1.
      // The v1 endpoint carries titleId directly on each achievement object (no
      // titleAssociations). We primarily use this to build the earnedScanSet —
      // a guard that prevents Phase 5 from deleting titles the user has genuinely
      // earned achievements for, even if the per-title API temporarily returns 0.
      // If a title also has titleAssociations with a name, we add it to byTitleId
      // so it can appear in the library even if absent from the v1 history endpoint.
      const titleMap = new Map<string, string>(); // titleId → name (may be '' for v1)
      let token: string | null = null;
      // Use maxItems=1000 to reduce page count. If the API caps lower, no harm.
      const baseAchUrl = `https://achievements.xboxlive.com/users/xuid(${xuid})/achievements?maxItems=1000`;
      let pageNum = 0;
      const MAX_PAGE_ATTEMPTS = 5;
      let consecutiveFailures = 0;
      const MAX_CONSECUTIVE_FAILURES = 3;
      do {
        const url: string = token
          ? `${baseAchUrl}&continuationToken=${encodeURIComponent(token)}`
          : baseAchUrl;

        let result: GS4TitleScanResponse | null = null;
        let pageSuccess = false;
        let is403or404 = false;
        for (let pageAttempt = 1; pageAttempt <= MAX_PAGE_ATTEMPTS; pageAttempt++) {
          try {
            result = await rateLimiter.executeWithRetry<GS4TitleScanResponse>(
              'xbox',
              async (): Promise<GS4TitleScanResponse> => {
                const resp = await XSAPIClient.get<GS4TitleScanResponse>(url, {
                  options: { XSTSToken: xstsToken, userHash, contractVersion: '1' },
                });
                return resp.data;
              },
              `gs4scan:${xuid}:${pageNum}`,
            );
            pageSuccess = true;
            consecutiveFailures = 0;
            break;
          } catch (err: any) {
            const status = err?.response?.status;
            if (status === 403 || status === 404) {
              logger.info({ xuid }, 'GS4 all-achievements scan: endpoint returned 403/404 — no Xbox 360 achievements or not supported');
              is403or404 = true;
              break;
            }
            logger.warn(
              { err: err?.message ?? String(err), xuid, page: pageNum, pageAttempt, maxPageAttempts: MAX_PAGE_ATTEMPTS },
              'GS4 all-achievements scan page failed — retrying',
            );
            if (pageAttempt < MAX_PAGE_ATTEMPTS) {
              await _sleep(2000 * Math.pow(2, pageAttempt - 1));
            }
          }
        }

        if (is403or404) break;

        if (!pageSuccess || !result) {
          consecutiveFailures++;
          logger.error(
            { xuid, page: pageNum, consecutiveFailures, maxConsecutive: MAX_CONSECUTIVE_FAILURES },
            'GS4 all-achievements scan page exhausted all retries',
          );
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            logger.error({ xuid, page: pageNum }, 'GS4 scan: too many consecutive failures — stopping');
            break;
          }
          break;
        }

        pageNum++;
        for (const ach of result.achievements ?? []) {
          // Try titleAssociations first (some v1 responses mirror v2 shape),
          // then fall back to the titleId field directly on the achievement.
          const assoc = ach.titleAssociations?.[0];
          if (assoc && assoc.id !== undefined) {
            titleMap.set(String(assoc.id), assoc.name ?? '');
          } else if (ach.titleId !== undefined) {
            const tid = String(ach.titleId);
            if (!titleMap.has(tid)) titleMap.set(tid, '');
          }
        }
        token = result.pagingInfo?.continuationToken ?? null;
        if (pageNum === 1) {
          logger.info(
            { xuid, totalRecords: result.pagingInfo?.totalRecords, firstPageCount: result.achievements?.length },
            'GS4 all-achievements scan first page',
          );
        }
      } while (token !== null);
      logger.info(
        { xuid, gs4TitleCount: titleMap.size, pagesScanned: pageNum },
        'GS4 all-achievements scan complete',
      );
      return titleMap;
    };

    const [v2Titles, v1Titles, gs5ScanMap, gs4ScanMap] = await Promise.all([
      fetchAllPages('2'),
      fetchAllPages('1'),
      fetchAllGS5TitlesFromAchievements(),
      fetchAllGS4TitlesFromAchievements(),
    ]);

    logger.info(
      { xuid, v2Count: v2Titles.length, v1Count: v1Titles.length, gs5ScanUniqueGames: gs5ScanMap.size, gs4ScanUniqueGames: gs4ScanMap.size },
      'Xbox title history raw totals',
    );

    // Merge: deduplicate by titleId, preferring v2 entry if present (has more fields).
    // Exception: for Xbox 360 titles, v2 always returns currentGamerscore/maxGamerscore=0
    // because the v2 history endpoint doesn't surface legacy GS4 gamerscore. When a title
    // exists in both responses, patch the v2 entry with v1's gamerscore fields so we don't
    // lose earned gamerscore data.
    const byTitleId = new Map<string, RawTitle & { _contractVersion: '1' | '2' }>();
    for (const t of v2Titles) byTitleId.set(String(t.titleId), { ...t, _contractVersion: '2' });
    for (const t of v1Titles) {
      const key = String(t.titleId);
      if (!byTitleId.has(key)) {
        byTitleId.set(key, { ...t, _contractVersion: '1' });
      } else {
        // In both v1 and v2 — patch v2 entry with v1 gamerscore if v2 shows zeros
        const existing = byTitleId.get(key)!;
        const v2HasNoGS = (existing.currentGamerscore ?? 0) === 0;
        const v1HasGS = (t.currentGamerscore ?? 0) > 0;
        if (v2HasNoGS && v1HasGS) {
          existing.currentGamerscore = t.currentGamerscore;
          existing.maxGamerscore = t.maxGamerscore ?? existing.maxGamerscore;
          existing.earnedAchievements = t.earnedAchievements ?? existing.earnedAchievements;
          logger.info(
            { titleId: key, name: existing.name, v1GS: t.currentGamerscore },
            'Patched v2 title entry with v1 gamerscore data',
          );
        }
      }
    }

    // Merge GS5 all-achievements scan: add any titleId not already discovered via the
    // history endpoint. These are genuine games the user has played but that no longer
    // appear in /history/titles (old PC titles, platform-specific games, etc.).
    // We have no platform or GS info at this stage — Phase 5 will compute all of that
    // from the per-achievement data. We assume titleType=Game since they came from the
    // achievements API (apps/media don't have GS5 achievements).
    //
    // IMPORTANT: For titles that already exist in byTitleId from the history endpoint,
    // we override titleType to 'Game'. The history endpoint sometimes misclassifies
    // genuine games as "App" or other types (e.g. Anthem, Titanfall, Rare Replay, etc.),
    // causing them to be filtered out in the titleType check below.  The achievements
    // scan is authoritative: if a title has earned achievements, it IS a game.
    let gs5ScanAdded = 0;
    let gs5ScanTypeFixed = 0;
    const gs5ScanAddedTitles: Array<{ titleId: string; name: string }> = [];
    for (const [titleId, name] of gs5ScanMap) {
      if (!byTitleId.has(titleId)) {
        byTitleId.set(titleId, {
          titleId,
          name,
          _contractVersion: '2',
          titleType: 'Game',    // safe assumption: came from achievements endpoint
          platform: undefined,
          earnedAchievements: undefined,
          currentGamerscore: undefined,
          maxGamerscore: undefined,
        });
        gs5ScanAdded++;
        gs5ScanAddedTitles.push({ titleId, name });
      } else {
        // Title exists from history — force titleType to 'Game' since the GS5
        // achievements scan proves it has game achievements.
        const existing = byTitleId.get(titleId)!;
        const rawType = existing.titleType;
        const isAlreadyGame =
          rawType === 1 || String(rawType ?? '').toLowerCase() === 'game';
        if (!isAlreadyGame && rawType !== undefined && rawType !== null) {
          logger.info(
            { titleId, name: existing.name, oldTitleType: rawType },
            'GS5 scan: overriding non-game titleType → Game (achievements confirm this is a game)',
          );
          existing.titleType = 'Game';
          gs5ScanTypeFixed++;
        }
      }
    }
    if (gs5ScanAdded > 0 || gs5ScanTypeFixed > 0) {
      logger.info(
        { xuid, gs5ScanAdded, gs5ScanTypeFixed, addedTitles: gs5ScanAddedTitles },
        'GS5 all-achievements scan merge: added new titles and/or fixed titleType for existing ones',
      );
    }

    // Merge GS4 all-achievements scan: add Xbox 360 titles not already in byTitleId.
    // Only add if we have a non-empty name (GS4 achievements often carry only the
    // achievement name, not the game title, so most GS4 scan entries will have name='';
    // those are collected into earnedScanSet only, not added as browse-able titles).
    let gs4ScanAdded = 0;
    let gs4ScanTypeFixed = 0;
    for (const [titleId, name] of gs4ScanMap) {
      if (!byTitleId.has(titleId)) {
        if (name) {
          byTitleId.set(titleId, {
            titleId,
            name,
            _contractVersion: '1',
            titleType: 1, // v1 numeric Game type
            platform: undefined,
            earnedAchievements: undefined,
            currentGamerscore: undefined,
            maxGamerscore: undefined,
          });
          gs4ScanAdded++;
        }
      } else {
        // Same titleType override logic as GS5: if the GS4 achievements scan returned
        // this title, it's a game, regardless of what the history endpoint says.
        const existing = byTitleId.get(titleId)!;
        const rawType = existing.titleType;
        const isAlreadyGame =
          rawType === 1 || String(rawType ?? '').toLowerCase() === 'game';
        if (!isAlreadyGame && rawType !== undefined && rawType !== null) {
          existing.titleType = existing._contractVersion === '1' ? 1 : 'Game';
          gs4ScanTypeFixed++;
        }
      }
    }
    if (gs4ScanAdded > 0 || gs4ScanTypeFixed > 0) {
      logger.info({ xuid, gs4ScanAdded, gs4ScanTypeFixed }, 'GS4 all-achievements scan merge results');
    }

    // Build the earned-scan set: titleIds that appeared in the GS5 or GS4
    // all-achievements scan. Every titleId here is a game the user has interacted
    // with. GS5 is authoritative (only returns earned achievements). GS4 may
    // include unearned achievements, but including it here is necessary so that
    // Xbox 360 games are not incorrectly filtered out during image downloads
    // (the v1 history API often reports currentAchievements=0 for 360 titles
    // even when the user has genuinely earned achievements).
    const earnedScanSet = new Set<string>([...gs5ScanMap.keys(), ...gs4ScanMap.keys()]);

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
      // Fallback check: currentGamerscore explicitly 0 — but ONLY when:
      //   (a) it is not an Xbox 360 title: the v2 history endpoint always reports
      //       currentGamerscore=0 for legacy GS4 titles even when the user has earned GS.
      //   (b) earnedAchievements is not explicitly > 0: some PC/UWP titles (e.g. RUSH:
      //       A Disney•PIXAR Adventure) report currentGamerscore=0 in the history API
      //       even though the user has earned achievements and gamerscore. In that case
      //       earnedAchievements is the reliable signal.
      //
      // NOTE: The title history API returns earnedAchievements=0 and currentGamerscore=0
      // for many games the user has actually played (especially Xbox 360 titles via v1,
      // and some PC titles). These fields are NOT reliable. The authoritative check is
      // done in Phase 5 of the sync via the achievements API. We therefore do NOT
      // pre-filter on these fields here — all games that pass the titleType check get
      // through and are evaluated against real achievement data in Phase 5.

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
        // v1 exposes `lastPlayed`; v2 exposes `lastUnlock` (last achievement unlock).
        lastPlayed: title.lastPlayed ?? title.lastUnlock,
        // Confirmed-earned flag: true when this title appeared in either the GS5 or
        // GS4 all-earned-achievements endpoint scan (meaning the user genuinely has
        // at least one unlocked achievement for this title per that authoritative source).
        inEarnedScan: earnedScanSet.has(String(title.titleId)),
      });
    }

    logger.info({ xuid, kept, filtered, totalTitles: allTitles.length }, 'Fetched Xbox title history');
    return allTitles;
  }

  /**
   * Fetch platform/devices data from the TitleHub API for all of a user's titles.
   * Returns a Map of titleId → devices[] (e.g. ["PC", "XboxSeries"] for Play Anywhere games).
   * This is the only API that exposes multi-platform classification for a title.
   */
  async getTitleHubDevices(
    xuid: string,
    xstsToken: string,
    userHash: string,
  ): Promise<Map<string, string[]>> {
    const devicesMap = new Map<string, string[]>();
    const baseUrl = `https://titlehub.xboxlive.com/users/xuid(${xuid})/titles/titlehistory/decoration/detail`;

    type TitleHubTitle = { titleId: string | number; devices?: string[] };
    type TitleHubResponse = {
      titles?: TitleHubTitle[];
      pagingInfo?: { continuationToken?: string };
    };

    try {
      let continuationToken: string | null = null;
      do {
        const url: string = continuationToken
          ? `${baseUrl}?continuationToken=${encodeURIComponent(continuationToken)}`
          : baseUrl;

        const result: TitleHubResponse | undefined = await rateLimiter.executeWithRetry<TitleHubResponse | undefined>(
          'xbox',
          async (): Promise<TitleHubResponse | undefined> => {
            try {
              const response = await XSAPIClient.get<TitleHubResponse>(url, {
                options: { XSTSToken: xstsToken, userHash, contractVersion: '2' },
              });
              return response.data;
            } catch (error) {
              logger.warn({ error, xuid }, 'TitleHub devices fetch failed');
              return undefined;
            }
          },
          `titlehub-devices:${xuid}:${continuationToken ?? '0'}`,
        );

        if (!result?.titles) break;

        for (const title of result.titles) {
          if (title.devices && title.devices.length > 0) {
            devicesMap.set(String(title.titleId), title.devices);
          }
        }

        continuationToken = result.pagingInfo?.continuationToken ?? null;
      } while (continuationToken);

      logger.info({ xuid, titlesWithDevices: devicesMap.size }, 'TitleHub devices fetched');
    } catch (error) {
      logger.warn({ error, xuid }, 'TitleHub devices fetch failed (outer)');
    }

    return devicesMap;
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
   * Used before both MS Store and IGDB lookups so abbreviated titles
   * ("GTA IV", "MOH Airborne", "TC's Ghost Recon FS") are matched correctly.
   *
   * Returns the expanded string, or undefined if no expansion was made.
   */
  expandAbbreviations(name: string): string | undefined {
    // Split CamelCase/PascalCase sequences so "SplinterCellConviction" becomes
    // "Splinter Cell Conviction" and "EarthDefenseForce" → "Earth Defense Force".
    // Only split when the uppercase letter starts a real word (followed by at least
    // one lowercase letter). This prevents short abbreviations like "GoL", "WaW",
    // "BiB" from being broken into "Go L", "Wa W", "Bi B".
    let r = name.replace(/([a-z])([A-Z][a-z]+)/g, '$1 $2');

    // Known Xbox library abbreviation → full title mappings
    r = r.replace(/^MOH\s+(.+)/i, 'Medal of Honor: $1');
    r = r.replace(/^Spidey\s*:/i, 'Spider-Man:');
    r = r.replace(/^TC[''\'`\u2019]?s\s+/i, "Tom Clancy's ");
    r = r.replace(/:\s*HH\s*$/i, ": Hell's Highway");
    r = r.replace(/\s+FS\s*$/i, ': Future Soldier');
    r = r.replace(/^GTA\s+/i, 'Grand Theft Auto ');
    r = r.replace(/^Dark Alliance$/i, 'Dungeons \u0026 Dragons: Dark Alliance');
    // Xbox 360 abbreviated series titles
    r = r.replace(/^FC\s+/i, 'Far Cry ');
    r = r.replace(/:\s*TFS\s*$/i, ': The Forgotten Sands');
    r = r.replace(/:\s*WaW\s*$/i, ': World at War');
    r = r.replace(/:\s*ORC\s*$/i, ': Operation Raccoon City');
    r = r.replace(/:\s*BiB\s*$/i, ': Bound in Blood');
    r = r.replace(/:\s*GoL\s*$/i, ': Guardian of Light');
    r = r.replace(/^R\.E\.\s+CODE\s*:/i, 'Resident Evil Code:');
    r = r.replace(/^AoE\s+Online\s*$/i, 'Age of Empires Online');
    r = r.replace(/^AoE\s*$/i, 'Age of Empires');

    const trimmed = r.trim();
    return trimmed !== name.trim() ? trimmed : undefined;
  }

  /**
   * Strip trademark symbols (™ ® ©), C0/C1 control characters, and other
   * non-printable code-points that the Xbox API embeds in some game titles.
   * Also collapses runs of whitespace into a single space.
   *
   * Examples:
   *   "HITMAN™"                      → "HITMAN"
   *   "Rush: A Disney\u009EPixar Adventure" → "Rush: A Disney Pixar Adventure"
   *   "Battlefield™ Hardline"        → "Battlefield Hardline"
   */
  sanitizeTitle(name: string): string {
    return name
      // Remove trademark / copyright symbols
      .replace(/[™®©]/g, '')
      // Replace C0/C1 control characters (U+0000–U+001F, U+007F–U+009F) and
      // other invisible/zero-width code-points with a space
      .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, ' ')
      // Collapse multiple spaces into one
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  /**
   * Strip edition qualifiers ("Remastered", "Remaster", "Remake", "Definitive Edition")
   * that prevent image databases from matching the base game title.
   * Only removed when at the END of the title so "Remastered Collection" is untouched.
   *
   * Examples:
   *   "XIII Remaster"                 → "XIII"
   *   "Crysis Remastered"             → "Crysis"
   *   "Alan Wake Remastered"          → "Alan Wake"
   */
  stripEditionSuffix(name: string): string {
    return name
      .replace(/\s+(Remaster(ed)?|Remake)\s*$/i, '')
      .trim();
  }

  /**
   * Normalise a raw Xbox API title name for external image searches.
   * Pipeline: sanitize → abbreviation expansion → platform suffix strip → edition suffix strip.
   * Used wherever a game title is passed to SteamGridDB / IGDB.
   */
  normalizeForSearch(name: string): string {
    const clean = this.sanitizeTitle(name);
    const expanded = this.expandAbbreviations(clean);
    const stripped = this.stripPlatformSuffix(expanded ?? clean);
    return this.stripEditionSuffix(stripped);
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
   * Returns:
   * - `imageUrl`       – best portrait image URL (empty string if match found but no image)
   * - `productId`      – Store product ID for Emerald fallback (Priority 4)
   * - `canonicalTitle`  – the Store's canonical full title for the game, useful as
   *                       an improved search query for SteamGridDB / IGDB
   *                       when the Xbox API name is abbreviated.
   */
  async fetchMicrosoftStoreGridUrl(
    titleName: string,
    titleId?: string,
  ): Promise<{ imageUrl: string; productId: string; canonicalTitle?: string } | undefined> {
    // Sanitize: strip ™®©, control chars, then platform qualifiers
    titleName = this.sanitizeTitle(titleName);
    titleName = this.stripPlatformSuffix(titleName);
    titleName = this.stripEditionSuffix(titleName);

    // Expand known abbreviations so the Store can match them. This mirrors
    // the same expansion used for IGDB lookups. e.g.:
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
    // Tokenise: split CamelCase ("DisneyPixar" → "Disney Pixar"), then
    // lowercase and keep only alphanumeric tokens.
    const tokenise = (s: string) =>
      s.replace(/([a-z])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);

    // Fetch the productsList for a given query string; logs the URL so it can be
    // opened manually in a browser to diagnose missing or wrong results.
    const searchProducts = async (queryName: string): Promise<MSProduct[]> => {
      return this._msStoreQueue(async () => {
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
      'achievements', 'trophy', 'trophies', 'wiki', 'unofficial', 'server', 'servers',
      'mod', 'mods', 'dlc', 'expansion', 'expansions', 'season', 'pass', 'add-ons',
      'add-on', 'vip', 'bundle', 'bundles',
      // Utility / companion-app words — prevents matching "Destiny Item Manager"
      // when the needle is just "Destiny".
      'manager', 'tracker', 'tool', 'tools', 'app', 'editor', 'viewer', 'browser',
      'organizer', 'planner', 'helper', 'calculator', 'database', 'wallpaper',
      'wallpapers', 'theme', 'themes', 'soundtrack', 'soundtracks',
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

        // First-word anchor: the first meaningful word of the needle must appear
        // in the candidate. This prevents false positives like "Doom & Destiny"
        // matching needle "Destiny" — "destiny" is not the leading word of the
        // candidate so the context is wrong. For multi-word needles the anchor is
        // the very first meaningful token (e.g. "gears" for "Gears of War 3").
        const firstNeedleWord = scoringNeedleWords[0];
        const firstHayWord = scoringHayWords[0];
        if (firstNeedleWord && firstHayWord && firstNeedleWord !== firstHayWord) continue;

        const intersection = scoringNeedleWords.filter((t) => scoringHaySet.has(t)).length;
        const recall    = scoringNeedleSet.size > 0 ? intersection / scoringNeedleSet.size : 1;
        const precision = scoringHaySet.size   > 0 ? intersection / scoringHaySet.size    : 0;
        const f1 = (recall + precision) > 0 ? 2 * recall * precision / (recall + precision) : 0;

        // Prefix-match relaxation: when ALL scoring-needle tokens form the opening
        // of the candidate's scoring tokens (same order), the candidate is likely a
        // rebranded / expanded title of the same game.  Accept these with a lower
        // F1 bar because the first-word anchor + companion gates already protect
        // against false positives.
        // e.g. needle "HITMAN" → candidate "HITMAN World of Assassination" (prefix)
        const needleIsPrefix = scoringNeedleWords.length > 0
          && scoringNeedleWords.every((w, i) => i < scoringHayWords.length && scoringHayWords[i] === w);
        const effectiveF1 = needleIsPrefix ? 0.4 : F1_THRESHOLD;

        if (recall >= RECALL_THRESHOLD && f1 >= effectiveF1 && f1 > bestScore) {
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
              return { imageUrl: dcMatch.posterArtUrl, productId: dcProductId, canonicalTitle: dcMatch.title ?? undefined };
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
        return { imageUrl: sizedUrl, productId, canonicalTitle: bestMatch.title ?? undefined };
      }

      // Fall back to the images array
      const IMAGE_PRIORITY = ['Poster', 'BrandedKeyArt', 'BoxArt', 'SquareMobileTile'];
      const images = bestMatch.images ?? [];
      for (const type of IMAGE_PRIORITY) {
        const img = images.find((i) => i.imageType === type && i.url);
        if (img?.url) {
          const sizedUrl = this.addMSCDNSize(img.url);
          logger.info({ titleName, matchedTitle: bestMatch.title, productId, type, url: sizedUrl }, 'Found Microsoft Store grid image');
          return { imageUrl: sizedUrl, productId, canonicalTitle: bestMatch.title ?? undefined };
        }
      }

      logger.info({ titleName, availableTypes: images.map((i) => i.imageType) }, '[MSStore] No suitable image type — returning match without image');
      return { imageUrl: '', productId, canonicalTitle: bestMatch.title ?? undefined };
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
   * Fetch a wide hero (SuperHeroArt) image URL from the Emerald API.
   * Returns a landscape-oriented banner suitable for the hero image slot.
   * Falls back to undefined if no superHeroArt is available.
   */
  async fetchEmeraldHeroUrl(productId: string): Promise<string | undefined> {
    if (!productId) return undefined;
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (UUID_RE.test(productId)) return undefined;
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
        logger.debug({ productId, status: response.status }, '[Emerald Hero] Non-OK response');
        return undefined;
      }
      const json = await response.json() as {
        productSummaries?: Array<{
          images?: { superHeroArt?: { url?: string } };
        }>;
      };
      const summary = json?.productSummaries?.[0];
      const heroUrl = summary?.images?.superHeroArt?.url;
      if (heroUrl) {
        logger.info({ productId, heroUrl }, '[Emerald Hero] SuperHeroArt URL found');
        return heroUrl;
      }
      logger.debug({ productId, imageKeys: Object.keys(summary?.images ?? {}) }, '[Emerald Hero] No superHeroArt in response');
      return undefined;
    } catch (err) {
      logger.debug({ productId, err: String(err) }, '[Emerald Hero] Lookup threw');
      return undefined;
    }
  }

  /**
   * Fetch a hero (SuperHeroArt) image URL from the Microsoft Display Catalog API.
   * Falls back to BrandedKeyArt if no SuperHeroArt is found.
   * This is a public API that doesn't require authentication.
   */
  async fetchDisplayCatalogHeroUrl(productId: string): Promise<string | undefined> {
    if (!productId) return undefined;
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (UUID_RE.test(productId)) return undefined;
    const url = `https://displaycatalog.mp.microsoft.com/v7.0/products/${encodeURIComponent(productId)}?market=US&languages=en-US`;
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'MS-CV': '0.0',
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        logger.debug({ productId, status: response.status }, '[DC Hero] Non-OK response');
        return undefined;
      }
      const json = await response.json() as {
        Product?: {
          LocalizedProperties?: Array<{
            Images?: Array<{ ImagePurpose?: string; Uri?: string }>;
          }>;
        };
      };
      const images = json?.Product?.LocalizedProperties?.[0]?.Images ?? [];
      // Prefer SuperHeroArt, then BrandedKeyArt (both are wide/landscape)
      for (const purpose of ['SuperHeroArt', 'BrandedKeyArt']) {
        const img = images.find((i) => i.ImagePurpose === purpose && i.Uri);
        if (img?.Uri) {
          const heroUrl = img.Uri.startsWith('//') ? `https:${img.Uri}` : img.Uri;
          logger.info({ productId, purpose, heroUrl }, '[DC Hero] Wide image found');
          return heroUrl;
        }
      }
      logger.debug({ productId, purposes: images.map((i) => i.ImagePurpose).filter(Boolean) }, '[DC Hero] No wide image in response');
      return undefined;
    } catch (err) {
      logger.debug({ productId, err: String(err) }, '[DC Hero] Lookup threw');
      return undefined;
    }
  }

  /**
   * Download game cover images with adaptive concurrency control.
   * Handles the full fallback chain: local cache → Xbox CDN → MS Store → Emerald → SteamGridDB → IGDB.
   */
  async downloadGameImages(
    titles: XboxTitleHistory[],
    syncOperation: any,
    steamGridDBAdapter: SteamGridDBAdapter | null,
  ): Promise<Map<string, { capsuleImagePath?: string; iconImagePath?: string; heroImagePath?: string }>> {
    const concurrencyController = new AdaptiveConcurrencyController(
      syncOperation.adaptiveParams.concurrency,
    );
    const hasSteamGridDB = steamGridDBAdapter !== null;

    // Only download images for titles the user has actually earned achievements in.
    // The title history API returns games with 0 achievements (launched but never played).
    // inEarnedScan is authoritative — it comes from the all-earned-achievements scan.
    const eligibleTitles = titles.filter((t) => t.inEarnedScan || t.currentAchievements > 0);
    const skipped = titles.length - eligibleTitles.length;
    if (skipped > 0) {
      logger.info({ skipped, total: titles.length, eligible: eligibleTitles.length, syncOperationId: syncOperation._id }, 'Skipping image downloads for titles with no earned achievements');
    }

    logger.info({ total: eligibleTitles.length, syncOperationId: syncOperation._id }, 'Starting Xbox game image downloads');

    const gameImageResults = await Promise.all(
      eligibleTitles.map((title) =>
        concurrencyController.execute(async () => {
          let imagePath: string | undefined;
          let imageSource = 'none';

          // Priority 1: Existing local cache
          imagePath = imageStorage.checkLocalFile('xbox', title.titleId, 'game', 'grid') || undefined;
          if (imagePath) {
            logger.info({ titleId: title.titleId, name: title.name, imagePath }, '[IMG P1] Cache hit for grid');
          }
          logger.info({ titleId: title.titleId, name: title.name }, '[IMG] No cached image — starting download chain');

          // Priority 2: Xbox CDN displayImage
          if (title.titleImageUrl) {
            logger.info({ titleId: title.titleId, name: title.name, cdnUrl: title.titleImageUrl }, '[IMG P2] Attempting Xbox CDN image download');
            try {
              imagePath = await imageStorage.downloadAndStore(
                title.titleImageUrl, 'xbox', title.titleId, 'game', 'grid',
              );
              if (imagePath) {
                imageSource = 'xbox-cdn';
                logger.info({ titleId: title.titleId, name: title.name, imagePath }, '[IMG P2] Xbox CDN image downloaded successfully');
              } else {
                logger.info({ titleId: title.titleId, name: title.name }, '[IMG P2] Xbox CDN returned no path — trying next source');
              }
            } catch (error) {
              logger.warn({ titleId: title.titleId, name: title.name, cdnUrl: title.titleImageUrl, error: (error as any)?.message ?? String(error) }, '[IMG P2] Xbox CDN download failed — trying next source');
            }
          } else {
            logger.info({ titleId: title.titleId, name: title.name }, '[IMG P2] No CDN URL on title — skipping to Microsoft Store');
          }

          // Priority 3: Microsoft Store search (free, no API key required)
          // Always search for storeProductId (needed for Emerald hero lookup)
          // but only download the grid image when imagePath is not yet resolved.
          let storeProductId: string | undefined;
          let storeCanonicalTitle: string | undefined;

          {
            logger.info({ titleId: title.titleId, name: title.name, hasImage: !!imagePath }, '[IMG P3] Searching Microsoft Store');
            try {
              const storeResult = await this.fetchMicrosoftStoreGridUrl(title.name, title.titleId);
              if (storeResult) {
                storeProductId = storeResult.productId || undefined;
                storeCanonicalTitle = storeResult.canonicalTitle;
                if (storeCanonicalTitle && storeCanonicalTitle !== title.name) {
                  logger.info({ titleId: title.titleId, original: title.name, canonical: storeCanonicalTitle }, '[IMG P3] Resolved canonical title from Store');
                }
                if (!imagePath && storeResult.imageUrl) {
                  logger.info({ titleId: title.titleId, name: title.name, storeProductId, imageUrl: storeResult.imageUrl }, '[IMG P3] MS Store match found — downloading image');
                  try {
                    imagePath = await imageStorage.downloadAndStore(
                      storeResult.imageUrl, 'xbox', title.titleId, 'game', 'grid',
                    );
                    if (imagePath) {
                      imageSource = 'ms-store';
                      logger.info({ titleId: title.titleId, name: title.name, imagePath }, '[IMG P3] MS Store image downloaded successfully');
                    } else {
                      logger.warn({ titleId: title.titleId, name: title.name, imageUrl: storeResult.imageUrl }, '[IMG P3] MS Store image download returned no path');
                    }
                  } catch (dlErr) {
                    logger.warn({ titleId: title.titleId, name: title.name, imageUrl: storeResult.imageUrl, error: (dlErr as any)?.message ?? String(dlErr) }, '[IMG P3] MS Store image download threw — will try Emerald with productId');
                  }
                } else if (imagePath) {
                  logger.info({ titleId: title.titleId, name: title.name, storeProductId }, '[IMG P3] Image already resolved — keeping productId for hero lookup');
                } else {
                  logger.info({ titleId: title.titleId, name: title.name, storeProductId }, '[IMG P3] MS Store matched product but no image — will use canonical title for fallback sources');
                }
              } else {
                logger.info({ titleId: title.titleId, name: title.name }, '[IMG P3] MS Store: no confident match found');
              }
            } catch (error) {
              logger.warn({ titleId: title.titleId, name: title.name, error: String(error) }, '[IMG P3] MS Store search threw unexpected error');
            }
          }

          // Priority 4: Emerald Xbox services (xbox.com product API)
          if (!imagePath) {
            if (storeProductId) {
              logger.info({ titleId: title.titleId, name: title.name, storeProductId }, '[IMG P4] Trying Emerald with MS Store productId');
              try {
                const emeraldUrl = await this.fetchEmeraldImageUrl(storeProductId);
                if (emeraldUrl) {
                  logger.info({ titleId: title.titleId, name: title.name, storeProductId, emeraldUrl }, '[IMG P4] Emerald returned URL — downloading');
                  imagePath = await imageStorage.downloadAndStore(
                    emeraldUrl, 'xbox', title.titleId, 'game', 'grid',
                  );
                  if (imagePath) {
                    imageSource = 'emerald';
                    logger.info({ titleId: title.titleId, name: title.name, imagePath }, '[IMG P4] Emerald image downloaded successfully');
                  } else {
                    logger.warn({ titleId: title.titleId, name: title.name, emeraldUrl }, '[IMG P4] Emerald image download returned no path');
                  }
                } else {
                  logger.warn({ titleId: title.titleId, name: title.name, storeProductId }, '[IMG P4] Emerald returned no image URL');
                }
              } catch (error) {
                logger.warn({ titleId: title.titleId, name: title.name, storeProductId, error: String(error) }, '[IMG P4] Emerald download threw');
              }
            } else {
              logger.info({ titleId: title.titleId, name: title.name }, '[IMG P4] Skipped Emerald — no storeProductId available (Xbox-only title, will try SteamGridDB)');
            }
          } else {
            logger.info({ titleId: title.titleId, name: title.name, imageSource }, '[IMG P4] Skipped Emerald — image already resolved');
          }

          // Priority 5: SteamGridDB by name
          if (!imagePath && hasSteamGridDB) {
            const p5SearchName = storeCanonicalTitle || this.normalizeForSearch(title.name);
            logger.info({ titleId: title.titleId, name: title.name, searchName: p5SearchName }, '[IMG P5] Trying SteamGridDB by name');
            try {
              imagePath = await steamGridDBAdapter!.downloadGameImageByName(
                p5SearchName, 'xbox', title.titleId,
              ) || undefined;
              if (imagePath) {
                imageSource = 'steamgriddb';
                logger.info({ titleId: title.titleId, name: title.name, imagePath }, '[IMG P5] SteamGridDB image downloaded successfully');
              } else {
                logger.info({ titleId: title.titleId, name: title.name }, '[IMG P5] SteamGridDB returned no image');
              }
            } catch (error) {
              logger.warn({ error, titleId: title.titleId, name: title.name }, '[IMG P5] SteamGridDB lookup threw');
            }
          } else if (!imagePath) {
            logger.info({ titleId: title.titleId, name: title.name }, '[IMG P5] Skipped SteamGridDB — not configured');
          }

          // Priority 6: IGDB (if credentials configured)
          if (!imagePath) {
            try {
              const igdb = await createIGDBAdapter();
              if (igdb) {
                const igdbSearchName = storeCanonicalTitle || title.name;
                imagePath = await igdb.downloadGameImage(igdbSearchName, 'xbox', title.titleId) || undefined;
                if (imagePath) {
                  imageSource = 'igdb';
                  logger.info({ titleId: title.titleId, name: title.name, imagePath }, '[IMG P6] IGDB image downloaded successfully');
                }
              }
            } catch (error) {
              logger.warn({ error, titleId: title.titleId, name: title.name }, '[IMG P6] IGDB lookup threw');
            }
          }

          if (imagePath) {
            logger.info({ titleId: title.titleId, name: title.name, imageSource, imagePath }, '[IMG] Image resolved');
          } else {
            logger.warn({ titleId: title.titleId, name: title.name }, '[IMG] All sources exhausted — no image found');
          }

          // Download hero and icon images in parallel (non-blocking — failures are OK)
          const [heroImagePath, iconImagePath] = await Promise.all([
            // Hero: Emerald SuperHeroArt → Display Catalog → SteamGridDB hero → titleImageUrl fallback
            (async (): Promise<string | undefined> => {
              try {
                const cached = imageStorage.checkLocalFile('xbox', title.titleId, 'game', 'hero');
                if (cached) return cached;

                // 1. Emerald SuperHeroArt (wide landscape banner)
                if (storeProductId) {
                  const heroUrl = await this.fetchEmeraldHeroUrl(storeProductId);
                  if (heroUrl) {
                    const path = await imageStorage.downloadAndStore(
                      heroUrl, 'xbox', title.titleId, 'game', 'hero',
                    );
                    if (path) {
                      logger.info({ titleId: title.titleId, name: title.name }, '[HERO] Downloaded from Emerald SuperHeroArt');
                      return path;
                    }
                  }

                  // 1b. Display Catalog SuperHeroArt / BrandedKeyArt
                  const dcHeroUrl = await this.fetchDisplayCatalogHeroUrl(storeProductId);
                  if (dcHeroUrl) {
                    const path = await imageStorage.downloadAndStore(
                      dcHeroUrl, 'xbox', title.titleId, 'game', 'hero',
                    );
                    if (path) {
                      logger.info({ titleId: title.titleId, name: title.name }, '[HERO] Downloaded from Display Catalog');
                      return path;
                    }
                  }
                }

                // 2. SteamGridDB hero images
                if (hasSteamGridDB) {
                  const searchName = storeCanonicalTitle || this.normalizeForSearch(title.name);
                  const game = await steamGridDBAdapter!.searchGameByName(searchName);
                  if (game) {
                    const heroes = await steamGridDBAdapter!.getHeroImages(game.id);
                    if (heroes.length > 0) {
                      const best = heroes.sort((a, b) => b.score - a.score)[0];
                      const path = await imageStorage.downloadAndStore(
                        best.url, 'xbox', title.titleId, 'game', 'hero',
                      );
                      if (path) {
                        logger.info({ titleId: title.titleId, name: title.name }, '[HERO] Downloaded from SteamGridDB');
                        return path;
                      }
                    }
                  }
                }

                // 3. IGDB artwork as hero fallback
                {
                  try {
                    const igdb = await createIGDBAdapter();
                    if (igdb) {
                      const heroSearchName = storeCanonicalTitle || title.name;
                      const heroPath = await igdb.downloadHeroImage(heroSearchName, 'xbox', title.titleId);
                      if (heroPath) {
                        logger.info({ titleId: title.titleId, name: title.name }, '[HERO] Downloaded from IGDB');
                        return heroPath;
                      }
                    }
                  } catch {
                    logger.debug({ titleId: title.titleId }, '[HERO] IGDB fallback failed');
                  }
                }

                // 4. Last resort: titleImageUrl (box art — not ideal but better than nothing)
                if (title.titleImageUrl) {
                  return await imageStorage.downloadAndStore(
                    title.titleImageUrl, 'xbox', title.titleId, 'game', 'hero',
                  );
                }
                return undefined;
              } catch {
                logger.debug({ titleId: title.titleId }, 'Xbox hero image not available');
                return undefined;
              }
            })(),
            // Icon: titleImageUrl → capsule image fallback → SteamGridDB icon
            (async (): Promise<string | undefined> => {
              try {
                const cached = imageStorage.checkLocalFile('xbox', title.titleId, 'game', 'icon');
                if (cached) return cached;

                // 1. Xbox displayImage / largeBoxArt
                if (title.titleImageUrl) {
                  const path = await imageStorage.downloadAndStore(
                    title.titleImageUrl, 'xbox', title.titleId, 'game', 'icon',
                  );
                  if (path) return path;
                }

                // 2. Use already-downloaded capsule image as icon source
                if (imagePath) {
                  const fs = await import('fs');
                  const pathMod = await import('path');
                  const sharp = (await import('sharp')).default;
                  const absPath = imageStorage.getAbsolutePath(imagePath);
                  if (fs.existsSync(absPath)) {
                    try {
                      const iconBuffer = await sharp(absPath)
                        .resize(64, 64, { fit: 'cover', position: 'centre' })
                        .jpeg({ quality: 90 })
                        .toBuffer();
                      const iconDir = pathMod.dirname(absPath);
                      const iconFile = pathMod.join(iconDir, 'game_icon.jpg');
                      await fs.promises.writeFile(iconFile, iconBuffer);
                      // Derive relative path: same directory as capsule, just different filename
                      const iconRelPath = imagePath.replace(/[^/]+$/, 'game_icon.jpg');
                      logger.info({ titleId: title.titleId, name: title.name }, '[ICON] Generated from capsule image');
                      return iconRelPath;
                    } catch (resizeErr) {
                      logger.debug({ titleId: title.titleId, err: String(resizeErr) }, '[ICON] Failed to generate from capsule');
                    }
                  }
                }

                // 3. SteamGridDB icon
                if (hasSteamGridDB) {
                  const searchName = storeCanonicalTitle || this.normalizeForSearch(title.name);
                  const game = await steamGridDBAdapter!.searchGameByName(searchName);
                  if (game) {
                    const icons = await steamGridDBAdapter!.getIconImages(game.id);
                    if (icons.length > 0) {
                      const best = icons.sort((a, b) => b.score - a.score)[0];
                      const path = await imageStorage.downloadAndStore(
                        best.url, 'xbox', title.titleId, 'game', 'icon',
                      );
                      if (path) {
                        logger.info({ titleId: title.titleId, name: title.name }, '[ICON] Downloaded from SteamGridDB');
                        return path;
                      }
                    }
                  }
                }

                return undefined;
              } catch {
                logger.debug({ titleId: title.titleId }, 'Xbox icon image not available');
                return undefined;
              }
            })(),
          ]);

          return { titleId: title.titleId, capsuleImagePath: imagePath, heroImagePath, iconImagePath };
        }),
      ),
    );

    const gameImageMap = new Map(gameImageResults.map((r) => [r.titleId, {
      capsuleImagePath: r.capsuleImagePath,
      iconImagePath: r.iconImagePath,
      heroImagePath: r.heroImagePath,
    }]));

    // Update imagesCompleted count on the sync operation
    const imagesDownloaded = gameImageResults.filter((r) => r.capsuleImagePath).length;
    await SyncOperation.updateOne(
      { _id: syncOperation._id },
      { $set: { imagesCompleted: imagesDownloaded } },
    );

    logger.info({ total: eligibleTitles.length, imagesDownloaded, skipped, syncOperationId: syncOperation._id }, 'All Xbox game images downloaded');
    return gameImageMap;
  }

  /**
   * Sync achievements for all titles with adaptive batch/throttle/concurrency control.
   * Handles: achievement fetching, icon downloads, game stat updates, DB upserts, and cancellation.
   */
  async syncAchievements(
    titles: XboxTitleHistory[],
    xuid: string,
    xstsToken: string,
    userHash: string,
    syncOperation: any,
    gameIdToMongoId: Map<string, any>,
  ): Promise<number> {
    const { isSyncCancelled } = await import('../syncCancellation.js');

    // Initialize adaptive controllers with shared defaults.
    // Values auto-adjust during sync: increase when healthy, decrease on errors/slowdowns.
    const batchController = new AdaptiveBatchController(SYNC_DEFAULTS.BATCH_SIZE, SYNC_DEFAULTS.MAX_BATCH_SIZE, SYNC_DEFAULTS.MIN_BATCH_SIZE);
    const throttler = new AdaptiveThrottler(SYNC_DEFAULTS.DELAY);
    const concurrencyController = new AdaptiveConcurrencyController(SYNC_DEFAULTS.CONCURRENCY, SYNC_DEFAULTS.MAX_CONCURRENCY, SYNC_DEFAULTS.MIN_CONCURRENCY);

    // Separate concurrency limiter for icon downloads within each title.
    // Capped at 5 because modern Xbox icons are 1080p+ (5-10 MB each) and
    // higher concurrency saturates bandwidth, causing timeouts on NAS/server setups.
    const iconLimit = pLimit(Math.min(SYNC_DEFAULTS.CONCURRENCY, 5));

    let achievementsSynced = 0;
    let titlesProcessed = 0;

    logger.info({ startBatchSize: SYNC_DEFAULTS.BATCH_SIZE, maxBatchSize: SYNC_DEFAULTS.MAX_BATCH_SIZE, startConcurrency: SYNC_DEFAULTS.CONCURRENCY, maxConcurrency: SYNC_DEFAULTS.MAX_CONCURRENCY, syncOperationId: syncOperation._id }, 'Xbox adaptive controllers initialized for achievement sync');

    for (let batchOffset = 0; batchOffset < titles.length;) {
      if (isSyncCancelled(syncOperation._id.toString())) {
        logger.info({ syncOperationId: syncOperation._id }, 'Xbox sync cancelled (pre-batch)');
        break;
      }

      const currentBatchSize = batchController.getBatchSize();
      const batch = titles.slice(batchOffset, batchOffset + currentBatchSize);
      const batchStartTime = Date.now();

      await Promise.all(batch.map((title) =>
        concurrencyController.execute(async () => {
          if (isSyncCancelled(syncOperation._id.toString())) {
            return;
          }

          let achievements: XboxAchievement[];
          let achievementsTotalInCatalog: number;
          let achievementStoreProductId: string | undefined;
          try {
            const result = await this.getAchievements(xuid, title.titleId, xstsToken, userHash, title.platform);
            achievements = result.achievements;
            achievementsTotalInCatalog = result.totalInCatalog;
            achievementStoreProductId = result.storeProductId;
          } catch (error) {
            logger.warn({ error, titleId: title.titleId, name: title.name, inEarnedScan: title.inEarnedScan }, 'Failed to fetch Xbox achievements for title');
            if (!title.inEarnedScan) {
              const gId = gameIdToMongoId.get(title.titleId);
              if (gId) await Game.deleteOne({ _id: gId }).catch(() => {});
            }
            return;
          }

          titlesProcessed++;
          logger.info(
            { titleId: title.titleId, name: title.name, achievementCount: achievements.length, progress: `${titlesProcessed}/${titles.length}` },
            'Xbox achievements fetched for title',
          );

          const gameMongoId = gameIdToMongoId.get(title.titleId);
          if (!gameMongoId) {
            logger.warn({ titleId: title.titleId }, 'Xbox game not found after upsert, skipping achievements');
            return;
          }

          if (achievements.length === 0) {
            if (title.inEarnedScan) {
              logger.warn(
                { titleId: title.titleId, name: title.name },
                'Per-title achievements API returned empty array but title is in GS5 earned-scan — preserving game (API may be stale)',
              );
              return;
            }
            logger.info(
              { titleId: title.titleId, name: title.name },
              'Removing game — per-title achievements API returned 0 achievements',
            );
            await Game.deleteOne({ _id: gameMongoId });
            return;
          }

          const realTotal = achievementsTotalInCatalog || achievements.length;
          const unlockedCount = achievements.filter((a) => a.isUnlocked).length;

          if (unlockedCount === 0) {
            if (title.inEarnedScan) {
              logger.warn(
                { titleId: title.titleId, name: title.name, totalInCatalog: realTotal },
                'Per-title achievements API returned 0 unlocked but title is in earned-scan — preserving game (API may be stale)',
              );
              return;
            }
            logger.info(
              { titleId: title.titleId, name: title.name, totalInCatalog: realTotal },
              'Removing game — achievements API confirms 0 earned achievements',
            );
            await Game.deleteOne({ _id: gameMongoId });
            return;
          }

          const realCompletionPercent = Math.round((unlockedCount / realTotal) * 100);
          const maxGS = achievements.reduce((s, a) => s + (a.gamerscore ?? 0), 0);
          const currentGS = achievements
            .filter((a) => a.isUnlocked)
            .reduce((s, a) => s + (a.gamerscore ?? 0), 0);
          const gsUpdate: any = {
            achievementsTotal: realTotal,
            achievementsUnlocked: unlockedCount,
            completionPercent: realCompletionPercent,
          };
          if (maxGS > 0) {
            gsUpdate.maxGamerscore = maxGS;
            gsUpdate.currentGamerscore = currentGS;
          }
          await Game.findByIdAndUpdate(gameMongoId, { $set: gsUpdate });

          // Authenticated image fallback: use GS5 productId for Emerald lookup
          if (achievementStoreProductId) {
            const existingGame = await Game.findById(gameMongoId).select('capsuleImagePath').lean();
            if (!existingGame?.capsuleImagePath) {
              logger.info({ titleId: title.titleId, name: title.name, storeProductId: achievementStoreProductId }, '[IMG P6-auth] No image yet — trying Emerald with GS5 productId');
              try {
                const emeraldUrl = await this.fetchEmeraldImageUrl(achievementStoreProductId);
                if (emeraldUrl) {
                  const emeraldPath = await imageStorage.downloadAndStore(
                    emeraldUrl, 'xbox', title.titleId, 'game', 'grid',
                  );
                  if (emeraldPath) {
                    await Game.findByIdAndUpdate(gameMongoId, { $set: { capsuleImagePath: emeraldPath } });
                    logger.info(
                      { titleId: title.titleId, name: title.name, storeProductId: achievementStoreProductId, capsuleImagePath: emeraldPath },
                      '[IMG P6-auth] Image fetched from Emerald via authenticated GS5 productId',
                    );
                  } else {
                    logger.warn({ titleId: title.titleId, name: title.name, emeraldUrl }, '[IMG P6-auth] Emerald image download returned no path');
                  }
                } else {
                  logger.warn({ titleId: title.titleId, name: title.name, storeProductId: achievementStoreProductId }, '[IMG P6-auth] Emerald returned no URL for GS5 productId');
                }
              } catch (err) {
                logger.warn(
                  { titleId: title.titleId, name: title.name, storeProductId: achievementStoreProductId, err: String(err) },
                  '[IMG P6-auth] Emerald authenticated fallback threw',
                );
              }
            } else {
              logger.debug({ titleId: title.titleId, name: title.name }, '[IMG P6-auth] Skipped — game already has an image');
            }
          } else {
            logger.debug({ titleId: title.titleId, name: title.name }, '[IMG P6-auth] Skipped — no GS5 productId available (Xbox 360 title or GS5 achievement response was empty)');
          }

          syncOperation.totalAchievements += realTotal;
          syncOperation.iconDownloadsPending += realTotal;
          await SyncOperation.findByIdAndUpdate(syncOperation._id, {
            totalAchievements: syncOperation.totalAchievements,
            iconDownloadsPending: syncOperation.iconDownloadsPending,
          });

          const isXbox360Title = (title.platform ?? '').toLowerCase().includes('360');

          if (isXbox360Title) {
            logger.debug({ titleId: title.titleId, name: title.name, achievementCount: achievements.length }, 'GS4 title — icon URLs generated from public CDN, downloading below');
          }

          // Build Xbox Live auth headers for non-360 icon downloads.
          // The images-eds-ssl.xboxlive.com CDN may throttle/block unauthenticated
          // requests from server IPs; passing the XBL3.0 token prevents timeouts.
          const xblIconHeaders: Record<string, string> = {
            Authorization: `XBL3.0 x=${userHash};${xstsToken}`,
          };

          // Download achievement icons concurrently with staggered starts
          // to avoid overwhelming the Xbox CDN (images-eds-ssl.xboxlive.com).
          // All Xbox icons (360 and modern) use wget — it streams directly to disk
          // which is far better for modern 1080p+ images (5-10 MB each) than
          // buffering in Node.js memory via fetch.
          const ICON_CONCURRENCY = Math.min(SYNC_DEFAULTS.CONCURRENCY, 5);
          const ICON_TIMEOUT_SECS = 120; // 2 minutes per icon
          let iconIndex = 0;
          const iconPromises = achievements.map((ach) =>
            iconLimit(async () => {
              // Stagger concurrent requests: 100ms per slot to spread CDN load
              const myIndex = iconIndex++;
              if (myIndex > 0) {
                await new Promise((r) => setTimeout(r, 100 * (myIndex % ICON_CONCURRENCY)));
              }
              let iconPath: string | undefined;

              if (ach.iconUrl) {
                try {
                  iconPath = isXbox360Title
                    ? await imageStorage.downloadAndStoreViaWget(
                        ach.iconUrl, 'xbox', title.titleId, ach.achievementId, 'icon',
                      )
                    : await imageStorage.downloadAndStoreViaWget(
                        ach.iconUrl, 'xbox', title.titleId, ach.achievementId, 'icon',
                        xblIconHeaders,
                        ICON_TIMEOUT_SECS,
                      );
                  logger.debug({ url: ach.iconUrl, titleId: title.titleId, achievementId: ach.achievementId, isXbox360Title }, 'Xbox achievement icon downloaded');
                } catch (err) {
                  const msg = err instanceof Error ? err.message : String(err);
                  logger.warn({ url: ach.iconUrl, titleId: title.titleId, achievementId: ach.achievementId, isXbox360Title, err: msg }, 'Xbox achievement icon download failed');
                  iconPath = imageStorage.checkLocalFile('xbox', title.titleId, ach.achievementId, 'icon') || undefined;
                }
              }

              syncOperation.iconDownloadsCompleted++;
              if (syncOperation.iconDownloadsCompleted % 50 === 0) {
                await SyncOperation.findByIdAndUpdate(syncOperation._id, {
                  iconDownloadsCompleted: syncOperation.iconDownloadsCompleted,
                });
                logger.info(
                  {
                    syncOperationId: syncOperation._id,
                    iconDownloadsCompleted: syncOperation.iconDownloadsCompleted,
                    iconDownloadsPending: syncOperation.iconDownloadsPending,
                  },
                  'Xbox icon download progress',
                );
              }
              return { achievementId: ach.achievementId, iconPath };
            }),
          );

          const iconResults = await Promise.all(iconPromises.map((p) => p.catch(() => null)));
          const iconMap = new Map(
            iconResults.filter(Boolean).map((r) => [r!.achievementId, r!.iconPath]),
          );

          // Bulk upsert achievements for this title
          const bulkOps = achievements.map((ach) => {
            const iconPath = iconMap.get(ach.achievementId);
            const updateFields: any = {
              platform: 'xbox',
              profileId: syncOperation.profileId,
              name: ach.name,
              description: ach.description,
              unlockedAt: ach.unlockedAt ?? (ach.isUnlocked ? new Date(0) : undefined),
              isSecret: ach.isSecret,
            };
            if (ach.gamerscore !== undefined) updateFields.gamerscore = ach.gamerscore;
            if (iconPath) {
              updateFields.iconPath = iconPath;
              updateFields.iconGrayPath = iconPath;
            }
            return {
              updateOne: {
                filter: { profileId: syncOperation.profileId, gameId: gameMongoId, achievementId: ach.achievementId },
                update: { $set: updateFields },
                upsert: true,
              },
            };
          });

          if (bulkOps.length > 0) {
            try {
              await Achievement.bulkWrite(bulkOps, { ordered: false });
              achievementsSynced += bulkOps.length;
              await SyncOperation.findByIdAndUpdate(syncOperation._id, { achievementsSynced });
              syncOperation.achievementsSynced = achievementsSynced;
            } catch (error) {
              logger.error({ error, titleId: title.titleId }, 'Failed to upsert Xbox achievements');
            }
          }
        }),
      ));

      const batchDuration = Date.now() - batchStartTime;
      const batchStats = batchController.getStats();
      logger.info({
        batchOffset,
        batchSize: currentBatchSize,
        batchDuration,
        concurrency: concurrencyController.getConcurrency(),
        avgResponseTime: batchStats.averageResponseTime,
        total: titles.length,
        syncOperationId: syncOperation._id,
      }, 'Xbox achievement sync batch progress');

      batchController.adjustBatchSize(batchDuration);

      // Keep concurrency in sync — never exceed batch size
      concurrencyController.capConcurrency(batchController.getBatchSize());

      if (batchOffset + currentBatchSize < titles.length) {
        await throttler.throttle(batchDuration);
      }

      batchOffset += currentBatchSize;
    }

    // Update adaptive params with final values
    syncOperation.adaptiveParams = {
      batchSize: batchController.getBatchSize(),
      concurrency: concurrencyController.getConcurrency(),
      delay: throttler.getCurrentDelay(),
    };
    logger.info({
      finalBatchSize: batchController.getBatchSize(),
      finalConcurrency: concurrencyController.getConcurrency(),
      finalDelay: throttler.getCurrentDelay(),
      syncOperationId: syncOperation._id,
    }, 'Xbox adaptive params finalized');

    if (isSyncCancelled(syncOperation._id.toString())) {
      logger.info({ syncOperationId: syncOperation._id }, 'Xbox sync cancelled');
    }

    return achievementsSynced;
  }
}

export function createXboxAdapter(concurrency?: number): XboxAdapter {
  return new XboxAdapter(concurrency);
}
