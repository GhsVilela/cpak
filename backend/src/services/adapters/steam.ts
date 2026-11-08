import { logger } from '../../utils/logger.js';
import { rateLimiter } from '../rateLimiter.js';
import { AdaptiveBatchController } from '../adaptiveBatchController.js';
import { AdaptiveThrottler } from '../adaptiveThrottler.js';
import { AdaptiveConcurrencyController } from '../adaptiveConcurrencyController.js';
import { SYNC_DEFAULTS } from '../syncDefaults.js';
import { performanceMonitor } from '../performanceMonitor.js';
import { SyncOperation } from '../../models/syncOperation.js';
import { imageStorage } from '../../utils/imageStorage.js';
import type { SteamGridDBAdapter } from './steamgriddb.js';
import { createIGDBAdapter } from './igdb.js';
import type { SyncProgressTracker } from '../syncProgress.js';

const STEAM_BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const STEAM_COMMUNITY_MIN_INTERVAL_MS = process.env.NODE_ENV === 'test' ? 0 : 500;
const STEAM_COMMUNITY_RETRY_DELAYS_MS = process.env.NODE_ENV === 'test' ? [0, 0, 0] : [1000, 2000, 4000];
const STEAM_STORE_RETRY_DELAY_MS = process.env.NODE_ENV === 'test' ? 0 : 500;

let communityNameQueue: Promise<void> = Promise.resolve();
let lastCommunityNameRequestAt = 0;
let gameNameResolutionQueue: Promise<void> = Promise.resolve();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#0*39;|&#x0*27;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)));
}

function cleanGameName(raw?: string | null): string | null {
  if (!raw) return null;

  const name = decodeHtmlEntities(String(raw))
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^Steam Community\s*::\s*/i, '')
    .trim();

  if (!name) return null;
  if (/^(steam community|steam store|steam|welcome to steam|error|age check|sign in|login)$/i.test(name)) {
    return null;
  }
  if (/^valvetestapp/i.test(name)) return null;
  if (/^Unknown \(\d+\)$/i.test(name) || /^App \d+$/i.test(name)) {
    return null;
  }
  return name;
}

function isSuspiciousSchemaName(name: string): boolean {
  return name.length <= 4
    || /^(test|placeholder|unknown|valvetestapp)\b/i.test(name)
    || /^(steam community|steam store|steam|welcome to steam|error)$/i.test(name);
}

function parseRetryAfterMs(value: string | null | undefined): number {
  if (!value) return 0;

  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());

  return 0;
}

function queueCommunityNameRequest<T>(task: () => Promise<T>): Promise<T> {
  const run = communityNameQueue.then(async () => {
    const wait = Math.max(
      0,
      STEAM_COMMUNITY_MIN_INTERVAL_MS - (Date.now() - lastCommunityNameRequestAt),
    );
    if (wait > 0) await sleep(wait);

    try {
      return await task();
    } finally {
      lastCommunityNameRequestAt = Date.now();
    }
  });

  communityNameQueue = run.then(() => undefined, () => undefined);
  return run;
}

function queueGameNameResolution<T>(task: () => Promise<T>): Promise<T> {
  const run = gameNameResolutionQueue.then(task, task);
  gameNameResolutionQueue = run.then(() => undefined, () => undefined);
  return run;
}

interface SteamGame {
  appid: number;
  name: string;
  playtime_forever: number;
  img_icon_url?: string;
  rtime_last_played?: number;
  /** Present when GetOwnedGames is called with include_family_licenses=1. */
  family_shared?: boolean;
}

interface SteamPlayerSummary {
  personaname: string;
  profileurl: string;
  avatar: string;
}

interface SteamAchievement {
  apiname: string;
  achieved: number;
  unlocktime: number;
  name?: string;
  description?: string;
}

interface SteamGameSchema {
  gameName?: string;
  availableGameStats?: {
    achievements?: Array<{
      name: string;
      defaultvalue: number;
      displayName: string;
      description: string;
      icon: string;
      icongray: string;
    }>;
  };
}

/**
 * Response shape for IPlayerService/GetGameAchievements (protobuf Web API).
 * This is the modern achievement API that supports "achievement sets"
 * (groups), where group 0 is the base game and other groups are DLC/updates.
 */
interface SteamGameAchievementsResponse {
  achievements: Array<{
    internal_name?: string;
    internal_key?: number;
    localized_name?: string;
    localized_desc?: string;
    icon?: string;
    icon_gray?: string;
    hidden?: boolean;
    archived?: boolean;
    groupid?: number;
    /** More precise global unlock percentage returned by the modern schema. */
    player_percent_unlocked?: string | number;
  }>;
  groups: Array<{
    groupid?: number;
    localized_name?: string;
    dlcappid?: number;
    archived?: boolean;
    developeronly?: boolean;
    order?: number;
    ispublic?: boolean;
    total_achievements?: number;
    completion_achievements?: number;
  }>;
}

/** Response shape for IPlayerService/GetUserAchievements (protobuf Web API). */
interface SteamUserAchievementsResponse {
  achievements: Array<{
    internal_key?: number;
    unlocked?: boolean;
    unlock_time?: number;
    progress_int?: number;
    progress_float?: number;
  }>;
  groups: Array<{
    groupid?: number;
    is_achievable?: boolean;
    completed_achievements?: number;
    is_completed?: boolean;
    time_completed?: number;
  }>;
}

/** Normalized achievement produced by the modern group-aware Steam flow. */
interface SteamMappedAchievement {
  appId: number;
  achievementId: string;
  name: string;
  description: string;
  unlocked: boolean;
  unlockTime?: Date;
  icon?: string;
  iconGray?: string;
  groupId?: string;
  groupName?: string;
  groupOrder?: number;
  /** Global unlock percentage (0–100). Below 10 is considered rare by Steam. */
  globalPercent?: number;
  /** True when Steam has archived the achievement (still visible to earners only). */
  archived?: boolean;
}

export class SteamAdapter {
  private apiKey: string;
  private baseUrl = 'https://api.steampowered.com';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async getPlayerSummary(steamId: string): Promise<SteamPlayerSummary | null> {
    const url = `${this.baseUrl}/ISteamUser/GetPlayerSummaries/v2/?key=${this.apiKey}&steamids=${steamId}`;
    
    return rateLimiter.executeWithRetry(
      'steam',
      async () => {
        const response = await fetch(url);
        const data = await response.json() as any;
        return data.response?.players?.[0] || null;
      },
      steamId
    );
  }

  async getOwnedGames(steamId: string): Promise<SteamGame[]> {
    // include_family_licenses is an undocumented Steam parameter that also
    // returns games shared through Steam Families and flags them with
    // family_shared: true. If Steam ignores it, those games still arrive via
    // play history and are classified as played_history.
    const url = `${this.baseUrl}/IPlayerService/GetOwnedGames/v1/?key=${this.apiKey}&steamid=${steamId}&include_appinfo=1&include_played_free_games=1&include_family_licenses=1`;
    
    return rateLimiter.executeWithRetry(
      'steam',
      async () => {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Steam API returned HTTP ${response.status} — your API key may be invalid or the profile may be private.`);
        }
        const contentType = response.headers?.get('content-type') || '';
        if (contentType && !contentType.includes('application/json')) {
          throw new Error('Steam API returned an unexpected response — your API key may be invalid or revoked. Please verify it in Settings.');
        }
        const data = await response.json() as any;
        return data.response?.games || [];
      },
      steamId
    );
  }

  async getRecentlyPlayedGames(steamId: string): Promise<SteamGame[]> {
    const url = `${this.baseUrl}/IPlayerService/GetRecentlyPlayedGames/v1/?key=${this.apiKey}&steamid=${steamId}&count=0`;
    
    return rateLimiter.executeWithRetry(
      'steam',
      async () => {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Steam API returned HTTP ${response.status} — your API key may be invalid or the profile may be private.`);
        }
        const contentType = response.headers?.get('content-type') || '';
        if (contentType && !contentType.includes('application/json')) {
          throw new Error('Steam API returned an unexpected response — your API key may be invalid or revoked. Please verify it in Settings.');
        }
        const data = await response.json() as any;
        return data.response?.games || [];
      },
      `recent:${steamId}`
    );
  }

  /**
   * Fetch games with play-time history via the ClientGetLastPlayedTimes endpoint.
   * This client-oriented endpoint may return family-shared and other non-owned
   * games that GetOwnedGames omits.
   */
  async getPlayedGamesHistory(steamId: string): Promise<SteamGame[]> {
    const url = `${this.baseUrl}/IPlayerService/ClientGetLastPlayedTimes/v1/?key=${this.apiKey}&steamid=${steamId}&min_last_played=0`;

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) {
        logger.warn({ steamId, status: response.status }, 'ClientGetLastPlayedTimes not accessible');
        return [];
      }
      const data = await response.json() as any;
      const list = data?.response?.games;
      if (!Array.isArray(list) || list.length === 0) {
        logger.info({ steamId }, 'ClientGetLastPlayedTimes returned no games');
        return [];
      }

      // This endpoint returns {appid, last_playtime, playtime_forever, ...} but no name
      const games: SteamGame[] = list.map((g: any) => ({
        appid: g.appid,
        name: '',
        playtime_forever: g.playtime_forever ?? 0,
        rtime_last_played: g.last_playtime,
      }));

      logger.info({ steamId, playedGames: games.length }, 'Fetched play-time history via ClientGetLastPlayedTimes');
      return games;
    } catch (error) {
      logger.warn({ error: String(error), steamId }, 'Failed to fetch ClientGetLastPlayedTimes');
      return [];
    }
  }

  async getPlayerAchievements(steamId: string, appId: number): Promise<SteamAchievement[]> {
    const url = `${this.baseUrl}/ISteamUserStats/GetPlayerAchievements/v1/?key=${this.apiKey}&steamid=${steamId}&appid=${appId}`;
    
    return rateLimiter.executeWithRetry(
      'steam',
      async () => {
        const response = await fetch(url);
        // Retryable server/rate-limit errors — throw so executeWithRetry can retry
        if (response.status === 429 || response.status >= 500) {
          throw new Error(`Steam API ${response.status} for achievements appId=${appId}`);
        }
        // Non-retryable client errors (400/403 = game has no achievements or is restricted)
        if (!response.ok) {
          return [];
        }
        const data = await response.json() as any;
        if (!data.playerstats?.success) {
          // For refunded/removed games, GetPlayerAchievements returns
          // { success: false, error: "Profile is not public" } even when the
          // profile IS public.  Fall back to GetUserStatsForGame which may
          // still return achievement data for these edge-case titles.
          const fallback = await this.getPlayerAchievementsFallback(steamId, appId);
          if (fallback.length > 0) {
            logger.info({ appId, achievements: fallback.length }, 'Recovered achievements via GetUserStatsForGame fallback');
          }
          return fallback;
        }
        return data.playerstats?.achievements || [];
      },
      `${steamId}:${appId}`
    );
  }

  /**
   * Fallback for achievement data using GetUserStatsForGame/v2.
   * This endpoint returns achievements in a different format ({name, achieved})
   * and can succeed for refunded/family-shared games where GetPlayerAchievements
   * returns "Profile is not public".
   */
  private async getPlayerAchievementsFallback(steamId: string, appId: number): Promise<SteamAchievement[]> {
    const url = `${this.baseUrl}/ISteamUserStats/GetUserStatsForGame/v2/?key=${this.apiKey}&steamid=${steamId}&appid=${appId}`;

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) return [];
      const data = await response.json() as any;
      const achievements = data?.playerstats?.achievements;
      if (!Array.isArray(achievements)) return [];

      // GetUserStatsForGame returns { name, achieved } — map to SteamAchievement shape
      return achievements.map((a: any) => ({
        apiname: a.name,
        achieved: a.achieved ?? 0,
        unlocktime: 0, // This endpoint doesn't provide unlock times
      }));
    } catch (error) {
      logger.debug({ error: String(error), appId }, 'GetUserStatsForGame fallback failed');
      return [];
    }
  }

  /**
   * Fetch global achievement unlock percentages for an app.
   * This is the data Steam uses to mark rare achievements (< 10% of players).
   * Public endpoint — no API key required. Returns an empty map on failure so
   * a rarity lookup can never break a library sync.
   */
  async getGlobalAchievementPercentages(appId: number): Promise<Map<string, number>> {
    const url = `${this.baseUrl}/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=${appId}`;

    try {
      return await rateLimiter.executeWithRetry(
        'steam',
        async () => {
          const response = await fetch(url);
          if (response.status === 429 || response.status >= 500) {
            throw new Error(`Steam API ${response.status} for global achievement percentages appId=${appId}`);
          }
          if (!response.ok) return new Map<string, number>();

          const data = await response.json() as any;
          const list = data?.achievementpercentages?.achievements;
          const percentages = new Map<string, number>();
          if (Array.isArray(list)) {
            for (const item of list) {
              const name = typeof item?.name === 'string' ? item.name : undefined;
              const percent = Number(item?.percent);
              if (name && Number.isFinite(percent)) {
                percentages.set(name, percent);
              }
            }
          }
          return percentages;
        },
        `globalach:${appId}`,
      );
    } catch (error) {
      logger.debug({ error: String(error), appId }, 'Failed to fetch global achievement percentages');
      return new Map();
    }
  }

  async getGameSchema(appId: number): Promise<SteamGameSchema | null> {
    const url = `${this.baseUrl}/ISteamUserStats/GetSchemaForGame/v2/?key=${this.apiKey}&appid=${appId}`;
    
    return rateLimiter.executeWithRetry(
      'steam',
      async () => {
        const response = await fetch(url);
        // Retryable server/rate-limit errors — throw so executeWithRetry can retry
        if (response.status === 429 || response.status >= 500) {
          throw new Error(`Steam API ${response.status} for schema appId=${appId}`);
        }
        // Non-retryable client errors (400/403 = game delisted or no schema)
        if (!response.ok) {
          return null;
        }
        const data = await response.json() as any;
        return data.game || null;
      },
      `schema:${appId}`
    );
  }

  /**
   * Fetch achievement metadata (names, descriptions, icons) plus achievement
   * sets (groups) via IPlayerService/GetGameAchievements.
   *
   * This is the modern replacement for GetSchemaForGame and is the only source
   * of achievement-set grouping. Returns null for games/endpoints that don't
   * support it (delisted titles, no achievements, transient errors).
   */
  async getGameAchievements(appId: number): Promise<SteamGameAchievementsResponse | null> {
    const url = `${this.baseUrl}/IPlayerService/GetGameAchievements/v1/?key=${this.apiKey}&appid=${appId}&language=english`;

    return rateLimiter.executeWithRetry(
      'steam',
      async () => {
        const response = await fetch(url);
        // Retryable server/rate-limit errors — throw so executeWithRetry can retry
        if (response.status === 429 || response.status >= 500) {
          throw new Error(`Steam API ${response.status} for game achievements appId=${appId}`);
        }
        if (!response.ok) {
          return null;
        }
        const contentType = response.headers?.get?.('content-type') || '';
        if (contentType && !contentType.includes('application/json')) {
          return null;
        }
        const data = await response.json() as any;
        const payload = data?.response;
        if (!payload || typeof payload !== 'object') {
          return null;
        }
        return {
          achievements: Array.isArray(payload.achievements) ? payload.achievements : [],
          groups: Array.isArray(payload.groups) ? payload.groups : [],
        };
      },
      `gameach:${appId}`
    );
  }

  /**
   * Fetch the authenticated player's achievement unlock state via
   * IPlayerService/GetUserAchievements. Returns null when unavailable.
   *
   * Achievements are keyed by `internal_key` (joined against the metadata from
   * GetGameAchievements), not by the legacy `apiname`.
   */
  async getUserAchievements(steamId: string, appId: number): Promise<SteamUserAchievementsResponse | null> {
    const url = `${this.baseUrl}/IPlayerService/GetUserAchievements/v1/?key=${this.apiKey}&steamid=${steamId}&appid=${appId}`;

    return rateLimiter.executeWithRetry(
      'steam',
      async () => {
        const response = await fetch(url);
        if (response.status === 429 || response.status >= 500) {
          throw new Error(`Steam API ${response.status} for user achievements appId=${appId}`);
        }
        if (!response.ok) {
          return null;
        }
        const contentType = response.headers?.get?.('content-type') || '';
        if (contentType && !contentType.includes('application/json')) {
          return null;
        }
        const data = await response.json() as any;
        const payload = data?.response;
        if (!payload || typeof payload !== 'object') {
          return null;
        }
        // NOTE: when the player has unlocked nothing, Steam omits the
        // `achievements` array entirely and only returns `groups`. That is a
        // valid "0 unlocked" response, not a failure — callers must not treat
        // a missing array as a fetch error.
        return {
          achievements: Array.isArray(payload.achievements) ? payload.achievements : [],
          groups: Array.isArray(payload.groups) ? payload.groups : [],
        };
      },
      `userach:${steamId}:${appId}`
    );
  }

  /**
   * Build group-aware achievements using the modern IPlayerService endpoints.
   *
   * Returns null only when the modern endpoint is unavailable (HTTP error /
   * missing payload) so the caller can fall back to the legacy
   * GetPlayerAchievements/GetSchemaForGame path. A valid response with no
   * achievements is definitive: the app genuinely has none.
   *
   * Group semantics: achievement set groupid 0 / dlcappid 0 is the base game;
   * other groups are DLC or content updates added by the developer.
   */
  private async getAchievementsWithGroups(steamId: string, appId: number): Promise<{
    totalAchievements: number;
    earnedAchievements: number;
    archivedEarnedAchievements: number;
    archivedAchievementIds: string[];
    hasGroups: boolean;
    achievementsData: SteamMappedAchievement[];
  } | null> {
    const gameSet = await this.getGameAchievements(appId);
    if (!gameSet) {
      return null;
    }

    const groupMap = new Map<number, { name: string; order: number }>();
    const archivedGroupIds = new Set<number>();
    const developerOnlyGroupIds = new Set<number>();
    gameSet.groups.forEach((g, index) => {
      const gid = g.groupid ?? 0;
      const name = g.localized_name
        || (gid === 0 ? 'Base Game' : (g.dlcappid ? `DLC ${g.dlcappid}` : `Set ${gid}`));
      groupMap.set(gid, { name, order: g.order ?? index });
      if (g.archived) archivedGroupIds.add(gid);
      if (g.developeronly) developerOnlyGroupIds.add(gid);
    });

    // Developer-only sets are never shown to players. Archived achievements
    // (and achievements in archived sets) are only visible to players who
    // already unlocked them, so they are tracked separately from active ones.
    const allAchievements = gameSet.achievements.filter(
      (a) => !!a.internal_name && !developerOnlyGroupIds.has(a.groupid ?? 0),
    );
    const activeAchievements = allAchievements.filter(
      (a) => !a.archived && !archivedGroupIds.has(a.groupid ?? 0),
    );
    const archivedAchievements = allAchievements.filter(
      (a) => a.archived || archivedGroupIds.has(a.groupid ?? 0),
    );

    const activeGroups = gameSet.groups.filter((g) => !g.archived && !g.developeronly);
    const hasGroups = activeGroups.length > 1;

    // A valid response with no achievements means the app has none — the caller
    // should not fall back to the legacy endpoints in this case.
    if (activeAchievements.length === 0 && archivedAchievements.length === 0) {
      return {
        totalAchievements: 0,
        earnedAchievements: 0,
        archivedEarnedAchievements: 0,
        archivedAchievementIds: [],
        hasGroups: false,
        achievementsData: [],
      };
    }

    // Fetch per-user unlock state and global rarity in parallel. Rarity is
    // supplementary: a failure returns an empty map and never blocks the sync.
    //
    // GetUserAchievements omits archived achievements entirely, so when the
    // schema has archived entries we also consult the legacy player endpoint,
    // which still returns their achieved/unlock-time state.
    const legacyAchievementsPromise = archivedAchievements.length > 0
      ? this.getPlayerAchievements(steamId, appId).catch((error) => {
          logger.warn({
            error: error instanceof Error ? error.message : String(error),
            appId,
          }, 'Failed to fetch archived achievement unlock state');
          return [] as SteamAchievement[];
        })
      : Promise.resolve([] as SteamAchievement[]);

    const [userSet, globalPercentages, legacyAchievements] = await Promise.all([
      this.getUserAchievements(steamId, appId),
      this.getGlobalAchievementPercentages(appId),
      legacyAchievementsPromise,
    ]);

    const userMap = new Map<number, { unlocked: boolean; unlockTime?: number }>();
    for (const ua of userSet?.achievements ?? []) {
      if (ua.internal_key == null) continue;
      userMap.set(ua.internal_key, { unlocked: !!ua.unlocked, unlockTime: ua.unlock_time });
    }

    const legacyMap = new Map<string, SteamAchievement>();
    for (const achievement of legacyAchievements) {
      legacyMap.set(achievement.apiname, achievement);
    }

    // GetGameAchievements returns bare icon filenames (e.g. "abc123.jpg"),
    // unlike GetSchemaForGame which returns fully-qualified URLs. Rebuild the
    // CDN URL.
    //
    // Steam now serves modern achievement icons from the shared community
    // assets host. The old steamcommunity/public/images/apps path still works
    // for some older titles but returns 404 for newer achievements (for
    // example Rust, PAYDAY 2 and Marauders), so use the current host first.
    const iconUrl = (value?: string): string | undefined => {
      if (!value) return undefined;
      const normalized = value.trim();
      if (!normalized) return undefined;
      if (/^https?:\/\//i.test(normalized)) return normalized;
      return `https://shared.akamai.steamstatic.com/community_assets/images/apps/${appId}/${normalized}`;
    };

    const mapAchievement = (
      achievement: SteamGameAchievementsResponse['achievements'][number],
      archived: boolean,
    ): SteamMappedAchievement => {
      const key = achievement.internal_key;
      const user = key != null ? userMap.get(key) : undefined;
      const legacy = archived ? legacyMap.get(achievement.internal_name as string) : undefined;

      const unlocked = archived
        ? legacy?.achieved === 1 || !!user?.unlocked
        : !!user?.unlocked;
      const unlockTimestamp = legacy?.achieved === 1 && legacy.unlocktime > 0
        ? legacy.unlocktime
        : user?.unlockTime;

      const gid = achievement.groupid ?? 0;
      const group = groupMap.get(gid);

      // GetGameAchievements includes a more precise player_percent_unlocked
      // value than GetGlobalAchievementPercentagesForApp, which rounds very
      // low values down to 0.0 (e.g. 0.1% becomes 0.0%). Prefer the schema
      // value and fall back to the global endpoint when it is unavailable.
      const schemaPercentRaw = achievement.player_percent_unlocked;
      const schemaPercent = schemaPercentRaw == null || schemaPercentRaw === ''
        ? undefined
        : Number(schemaPercentRaw);
      const globalPercent = schemaPercent !== undefined && Number.isFinite(schemaPercent)
        ? schemaPercent
        : globalPercentages.get(achievement.internal_name as string);

      return {
        appId,
        achievementId: achievement.internal_name as string,
        name: achievement.localized_name || (achievement.internal_name as string),
        description: achievement.localized_desc || '',
        unlocked,
        unlockTime: unlocked && unlockTimestamp ? new Date(unlockTimestamp * 1000) : undefined,
        icon: iconUrl(achievement.icon),
        iconGray: iconUrl(achievement.icon_gray),
        groupId: String(gid),
        groupName: group?.name ?? 'Base Game',
        groupOrder: group?.order ?? 0,
        globalPercent,
        archived,
      };
    };

    let earnedAchievements = 0;
    const activeData = activeAchievements.map((achievement) => {
      const mapped = mapAchievement(achievement, false);
      if (mapped.unlocked) earnedAchievements++;
      return mapped;
    });

    let archivedEarnedAchievements = 0;
    const archivedData = archivedAchievements.map((achievement) => {
      const mapped = mapAchievement(achievement, true);
      if (mapped.unlocked) archivedEarnedAchievements++;
      return mapped;
    }).filter((achievement) => achievement.unlocked);

    return {
      // Game totals only include currently obtainable achievements. Archived
      // achievements are returned separately so the UI can show earned history
      // without counting it toward completion.
      totalAchievements: activeAchievements.length,
      earnedAchievements,
      archivedEarnedAchievements,
      archivedAchievementIds: archivedAchievements.map((a) => a.internal_name as string),
      hasGroups,
      achievementsData: [...activeData, ...archivedData],
    };
  }

  /**
   * Resolve a display name for a game using the fallback chain:
   * existing name → Steam Store → Steam Community → SteamCMD PICS → schema.
   */
  private async resolveGameName(game: SteamGame, schemaGameName?: string): Promise<string> {
    return (await this.resolveGameNameByAppId(game.appid, game.name, schemaGameName)) ?? '';
  }

  /**
   * Resolve a game name from an app ID. Returns null when every source fails;
   * callers should preserve an existing valid title rather than store a
   * placeholder.
   */
  async resolveGameNameByAppId(
    appId: number,
    initialName?: string,
    schemaGameName?: string,
  ): Promise<string | null> {
    const initial = cleanGameName(initialName);
    if (initial) return initial;

    return queueGameNameResolution(async () => {
      // 1. Steam Store. This is unavailable for most delisted apps.
      const storeDetails = await this.getAppDetails(appId);
      const storeName = cleanGameName(storeDetails?.name);
      if (storeName) {
        logger.info({ appId, newName: storeName }, 'Resolved game name from Steam Store API');
        return storeName;
      }

      // 2. Steam Community hub. Includes many delisted games, but is
      // rate-limited when many requests are sent in a short period.
      const communityName = await this.getAppNameFromCommunity(appId);
      if (communityName) {
        logger.info({ appId, newName: communityName }, 'Resolved game name from Steam Community');
        return communityName;
      }

      // 3. SteamCMD PICS data. This still exposes public names for many
      // delisted and test apps that the Store API no longer lists.
      const steamCmdName = await this.getAppNameFromSteamCmd(appId);
      if (steamCmdName) {
        logger.info({ appId, newName: steamCmdName }, 'Resolved game name from SteamCMD');
        return steamCmdName;
      }

      // 4. Schema name already fetched by the legacy achievement path.
      const providedSchemaName = cleanGameName(schemaGameName);
      if (providedSchemaName && !isSuspiciousSchemaName(providedSchemaName)) {
        logger.info({ appId, newName: providedSchemaName }, 'Resolved game name from achievement schema');
        return providedSchemaName;
      }

      // 5. Fetch the legacy schema name directly.
      const schemaName = await this.getAppNameFromSchema(appId);
      if (schemaName) {
        logger.info({ appId, newName: schemaName }, 'Resolved game name from achievement schema');
        return schemaName;
      }

      logger.warn({ appId }, 'Could not resolve Steam game name from any source');
      return null;
    });
  }

  /**
   * Fetch app details from the Steam Store API.
   * This is the most reliable source for game names — the community API schema
   * occasionally returns placeholder/test names for certain titles.
   */
  async getAppDetails(appId: number): Promise<{ name: string } | null> {
    const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&filters=basic&l=english`;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(10_000),
          headers: {
            'User-Agent': STEAM_BROWSER_USER_AGENT,
            'Accept': 'application/json',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        });

        if (response.status === 429 || response.status >= 500) {
          if (attempt === 0) {
            await sleep(STEAM_STORE_RETRY_DELAY_MS);
            continue;
          }
          return null;
        }
        if (!response.ok) return null;

        const data = await response.json() as any;
        const appData = data?.[String(appId)];
        if (appData?.success && appData.data?.name) {
          const name = cleanGameName(appData.data.name);
          return name ? { name } : null;
        }
        return null;
      } catch (error) {
        if (attempt === 0) {
          await sleep(STEAM_STORE_RETRY_DELAY_MS);
          continue;
        }
        logger.debug({ error: String(error), appId }, 'Steam Store appdetails lookup failed');
        return null;
      }
    }

    return null;
  }

  /**
   * Look up a game name from the Steam Community hub page.
   * Works for delisted/removed games that the Store API no longer returns,
   * as community hub pages typically persist after delisting.
   *
   * Requests are serialized and throttled because Steam Community rate-limits
   * bursts with HTTP 429.
   */
  private async getAppNameFromCommunity(appId: number): Promise<string | null> {
    return queueCommunityNameRequest(async () => {
      const url = `https://steamcommunity.com/app/${appId}/?l=english`;
      const maxAttempts = STEAM_COMMUNITY_RETRY_DELAYS_MS.length + 1;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const response = await fetch(url, {
            signal: AbortSignal.timeout(10_000),
            redirect: 'follow',
            headers: {
              'User-Agent': STEAM_BROWSER_USER_AGENT,
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
            },
          });

          if (response.status === 429 || response.status === 403 || response.status >= 500) {
            if (attempt < maxAttempts - 1) {
              const retryAfterMs = parseRetryAfterMs(response.headers?.get?.('retry-after'));
              const delay = Math.max(
                retryAfterMs,
                STEAM_COMMUNITY_RETRY_DELAYS_MS[attempt] ?? 0,
              );
              logger.debug(
                { appId, status: response.status, attempt, delay },
                'Steam Community name lookup throttled, retrying',
              );
              await sleep(delay);
              continue;
            }
            return null;
          }

          if (!response.ok) return null;

          const html = await response.text();
          // The page title follows the pattern: "Steam Community :: Game Name".
          // Also accept og:title because some pages render it more reliably.
          const titleMatch = html.match(/<title[^>]*>\s*Steam Community\s*::\s*(.+?)\s*<\/title>/i);
          const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
            ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:title["']/i);

          const name = cleanGameName(titleMatch?.[1] ?? ogTitleMatch?.[1]);
          if (name) return name;
          return null;
        } catch (error) {
          if (attempt < maxAttempts - 1) {
            await sleep(STEAM_COMMUNITY_RETRY_DELAYS_MS[attempt] ?? 0);
            continue;
          }
          logger.debug({ error: String(error), appId }, 'Steam Community name lookup failed');
          return null;
        }
      }

      return null;
    });
  }

  /**
   * Look up a game name from SteamCMD PICS app info.
   * Useful for delisted apps that still have public PICS data.
   */
  private async getAppNameFromSteamCmd(appId: number): Promise<string | null> {
    try {
      const response = await fetch(`https://api.steamcmd.net/v1/info/${appId}`, {
        signal: AbortSignal.timeout(10_000),
        headers: {
          'User-Agent': STEAM_BROWSER_USER_AGENT,
          'Accept': 'application/json',
        },
      });
      if (!response.ok) return null;

      const data = await response.json() as any;
      const rawName = data?.data?.[String(appId)]?.common?.name;
      return cleanGameName(rawName);
    } catch (error) {
      logger.debug({ error: String(error), appId }, 'SteamCMD name lookup failed');
      return null;
    }
  }

  /**
   * Look up a game name from the legacy achievement schema.
   * This is an official fallback for many delisted games with achievements.
   */
  private async getAppNameFromSchema(appId: number): Promise<string | null> {
    try {
      const schema = await this.getGameSchema(appId);
      const name = cleanGameName(schema?.gameName);
      if (!name) return null;

      if (isSuspiciousSchemaName(name)) {
        logger.info({ appId, schemaName: name }, 'Discarding suspicious schema game name');
        return null;
      }

      return name;
    } catch (error) {
      logger.debug({ error: String(error), appId }, 'Steam schema name lookup failed');
      return null;
    }
  }

  async syncGamesAndAchievements(
    steamId: string,
    syncOperation?: any,
    knownGameIds?: number[],
    progress?: SyncProgressTracker,
    historicalGameIds?: number[],
  ): Promise<{
    games: Array<{
      appId: number;
      name: string;
      playtimeMinutes: number;
      lastPlayed?: Date;
      totalAchievements: number;
      earnedAchievements: number;
      iconHash?: string;
      ownershipSource?: 'owned' | 'family_shared' | 'played_history';
      achievementsFetchFailed?: boolean;
      hasAchievementGroups?: boolean;
      archivedAchievementIds?: string[];
    }>;
    achievements: Array<{
      appId: number;
      achievementId: string;
      name: string;
      description: string;
      unlocked: boolean;
      unlockTime?: Date;
      icon?: string;
      iconGray?: string;
      groupId?: string;
      groupName?: string;
      groupOrder?: number;
      globalPercent?: number;
      archived?: boolean;
    }>;
    adaptiveStats?: {
      finalBatchSize: number;
      finalConcurrency: number;
      finalDelay: number;
    };
  }> {
    const historicalGameIdSet = new Set(historicalGameIds ?? []);

    // Fetch owned games with performance monitoring
    const ownedGames = await performanceMonitor.measureApiCall(
      'steam.getOwnedGames',
      async () => this.getOwnedGames(steamId)
    );
    logger.info({ steamId, ownedGames: ownedGames.length }, 'Fetched owned games from Steam');

    // Fetch recently played games — includes family-shared games not in owned list
    let recentGames: SteamGame[] = [];
    try {
      recentGames = await performanceMonitor.measureApiCall(
        'steam.getRecentlyPlayedGames',
        async () => this.getRecentlyPlayedGames(steamId)
      );
    } catch (error) {
      logger.warn({ error }, 'Failed to fetch recently played games');
    }

    // Fetch play-time history — may include family-shared and other non-owned games
    let playedGamesHistory: SteamGame[] = [];
    try {
      playedGamesHistory = await performanceMonitor.measureApiCall(
        'steam.getPlayedGamesHistory',
        async () => this.getPlayedGamesHistory(steamId)
      );
    } catch (error) {
      logger.warn({ error }, 'Failed to fetch played games history');
    }

    // Merge all game sources, deduplicating by appId.
    // Priority: owned games first (have full data), then play-time history, then recent, then known.
    const gameMap = new Map<number, SteamGame>();
    const ownershipSourceMap = new Map<number, 'owned' | 'family_shared' | 'played_history'>();
    for (const g of ownedGames) {
      gameMap.set(g.appid, g);
      ownershipSourceMap.set(g.appid, g.family_shared ? 'family_shared' : 'owned');
    }
    for (const g of playedGamesHistory) {
      if (!gameMap.has(g.appid)) {
        gameMap.set(g.appid, g);
        ownershipSourceMap.set(g.appid, 'played_history');
      }
    }
    for (const g of recentGames) {
      if (!gameMap.has(g.appid)) {
        gameMap.set(g.appid, g);
        ownershipSourceMap.set(g.appid, 'played_history');
      }
    }
    // Re-check previously-synced games that are no longer in owned/recent (e.g. family-shared played long ago)
    if (knownGameIds) {
      for (const appId of knownGameIds) {
        if (!gameMap.has(appId)) {
          gameMap.set(appId, { appid: appId, name: '', playtime_forever: 0 });
        }
      }
    }
    const games = Array.from(gameMap.values());

    const extraGames = games.length - ownedGames.length;
    if (extraGames > 0) {
      logger.info({ ownedGames: ownedGames.length, recentGames: recentGames.length, playedGamesHistory: playedGamesHistory.length, knownGameIds: knownGameIds?.length ?? 0, extraGames, totalGames: games.length }, 'Discovered extra games beyond owned list');
    }
    
    // Set total games count immediately for progress tracking
    if (syncOperation) {
      syncOperation.totalGames = games.length;
      await syncOperation.save();
      logger.info({ syncOperationId: syncOperation._id, totalGames: games.length }, 'Set totalGames for progress tracking');
    }

    // The library is now known, so the achievement-fetch phase can report an
    // exact denominator for the rest of the discovery work.
    if (progress) {
      await progress.begin(
        'achievements',
        games.length,
        `Fetching achievement data... (0/${games.length})`,
        { totalGames: games.length },
      );
    }
    
    const result: {
      games: Array<{
        appId: number;
        name: string;
        playtimeMinutes: number;
        lastPlayed?: Date;
        totalAchievements: number;
        earnedAchievements: number;
        iconHash?: string;
        ownershipSource?: 'owned' | 'family_shared' | 'played_history';
        achievementsFetchFailed?: boolean;
        hasAchievementGroups?: boolean;
        archivedAchievementIds?: string[];
      }>;
      achievements: Array<{
        appId: number;
        achievementId: string;
        name: string;
        description: string;
        unlocked: boolean;
        unlockTime?: Date;
        icon?: string;
        iconGray?: string;
        groupId?: string;
        groupName?: string;
        groupOrder?: number;
        globalPercent?: number;
        archived?: boolean;
      }>;
    } = { games: [], achievements: [] };

    // Initialize adaptive controllers with shared defaults.
    // Values start at BATCH_SIZE/CONCURRENCY and auto-scale up to MAX values when healthy.
    const batchController = new AdaptiveBatchController(SYNC_DEFAULTS.BATCH_SIZE, SYNC_DEFAULTS.MAX_BATCH_SIZE, SYNC_DEFAULTS.MIN_BATCH_SIZE);
    const throttler = new AdaptiveThrottler(SYNC_DEFAULTS.DELAY);
    const concurrencyController = new AdaptiveConcurrencyController(SYNC_DEFAULTS.CONCURRENCY, SYNC_DEFAULTS.MAX_CONCURRENCY, SYNC_DEFAULTS.MIN_CONCURRENCY);
    
    logger.info({
      startBatchSize: SYNC_DEFAULTS.BATCH_SIZE,
      maxBatchSize: SYNC_DEFAULTS.MAX_BATCH_SIZE,
      startConcurrency: SYNC_DEFAULTS.CONCURRENCY,
      maxConcurrency: SYNC_DEFAULTS.MAX_CONCURRENCY,
    }, 'Adaptive controllers initialized');

    let processedCount = 0;

    // Process games in adaptive batches
    for (let i = 0; i < games.length;) {
      const currentBatchSize = batchController.getBatchSize();
      const batch = games.slice(i, i + currentBatchSize);
      
      const batchStart = Date.now();
      
      // Process batch with performance monitoring
      const batchResults = await performanceMonitor.measureBatchOperation(
        'steam.processBatch',
        currentBatchSize,
        async () => {
          return Promise.all(
            batch.map(async (game) => {
              try {
                const ownershipSource = ownershipSourceMap.get(game.appid);

                // Prefer the modern group-aware IPlayerService endpoints. They are
                // the only source of achievement sets (base game vs DLC/updates).
                // Falls back to the legacy schema + player-achievement path when
                // the modern data isn't available.
                const modern = await concurrencyController.execute(async () =>
                  performanceMonitor.measureApiCall(
                    `steam.getAchievementsWithGroups:${game.appid}`,
                    async () => this.getAchievementsWithGroups(steamId, game.appid)
                  )
                );

                if (modern) {
                  // Games with no unlocked achievements are normally filtered out
                  // (matching the legacy path). Exceptions:
                  // - games the player has in their play history but no longer
                  //   owns (refunded, limited-time free-to-play, or removed from
                  //   family sharing), surfaced with a "revoked license" notice;
                  // - games with archived achievements the player earned;
                  // - games with locally known historical unlocks, so previous
                  //   progress is not lost when Steam stops exposing it.
                  const fetchFailed =
                    modern.earnedAchievements === 0 &&
                    modern.archivedEarnedAchievements === 0 &&
                    modern.totalAchievements > 0 &&
                    ownershipSource === 'played_history';
                  const hasHistoricalUnlocks = historicalGameIdSet.has(game.appid);
                  const hasEarnedAchievements =
                    modern.earnedAchievements > 0 || modern.archivedEarnedAchievements > 0;

                  if (!hasEarnedAchievements && !fetchFailed && !hasHistoricalUnlocks) {
                    return null;
                  }

                  const gameName = await this.resolveGameName(game);

                  logger.debug({
                    appId: game.appid,
                    name: gameName,
                    totalAchievements: modern.totalAchievements,
                    earnedAchievements: modern.earnedAchievements,
                    archivedEarnedAchievements: modern.archivedEarnedAchievements,
                    hasAchievementGroups: modern.hasGroups,
                    ownershipSource,
                    achievementsFetchFailed: fetchFailed,
                    hasHistoricalUnlocks,
                  }, 'Found game with unlocked achievements (group-aware)');

                  const gameData = {
                    appId: game.appid,
                    name: gameName,
                    playtimeMinutes: game.playtime_forever,
                    lastPlayed: game.rtime_last_played ? new Date(game.rtime_last_played * 1000) : undefined,
                    totalAchievements: modern.totalAchievements,
                    earnedAchievements: modern.earnedAchievements,
                    iconHash: game.img_icon_url,
                    ownershipSource,
                    hasAchievementGroups: modern.hasGroups || undefined,
                    achievementsFetchFailed: fetchFailed || undefined,
                    archivedAchievementIds: modern.archivedAchievementIds,
                  };

                  return { game: gameData, achievements: modern.achievementsData };
                }

                // ---- Legacy path (no achievement-set support) ----
                // Fetch achievements and schema with performance monitoring and adaptive concurrency
                const [playerAchievements, gameSchema, globalPercentages] = await Promise.all([
                  concurrencyController.execute(async () => 
                    performanceMonitor.measureApiCall(
                      `steam.getPlayerAchievements:${game.appid}`,
                      async () => this.getPlayerAchievements(steamId, game.appid)
                    )
                  ),
                  concurrencyController.execute(async () => 
                    performanceMonitor.measureApiCall(
                      `steam.getGameSchema:${game.appid}`,
                      async () => this.getGameSchema(game.appid)
                    )
                  ),
                  concurrencyController.execute(async () =>
                    performanceMonitor.measureApiCall(
                      `steam.getGlobalAchievementPercentages:${game.appid}`,
                      async () => this.getGlobalAchievementPercentages(game.appid)
                    )
                  ),
                ]);

                const schemaTotalAchievements = gameSchema?.availableGameStats?.achievements?.length || 0;
                const earnedAchievements = playerAchievements.filter((a) => a.achieved === 1).length;

                // Achievement fetch failed: the game has a schema with achievements but we
                // couldn't retrieve any player achievement data (e.g. refunded/expired license).
                const achievementsFetchFailed = playerAchievements.length === 0 && schemaTotalAchievements > 0;

                // Skip games where the user hasn't unlocked any achievements AND the
                // achievement fetch didn't fail. When the fetch failed (revoked license)
                // or the game has known historical unlocks, we still want the game to
                // appear so the user gets feedback / keeps earned history.
                const hasHistoricalUnlocks = historicalGameIdSet.has(game.appid);
                if (earnedAchievements === 0 && !achievementsFetchFailed && !hasHistoricalUnlocks) {
                  return null;
                }

                // Use schema count when available; fall back to playerAchievements length
                // (the player API returns ALL achievements, earned + unearned).
                // Schema can be null for delisted/region-locked games while player data is still valid.
                const totalAchievements = schemaTotalAchievements > 0
                  ? schemaTotalAchievements
                  : playerAchievements.length;

                logger.debug({ 
                  appId: game.appid, 
                  name: game.name, 
                  totalAchievements, 
                  earnedAchievements 
                }, 'Found game with unlocked achievements');

                // Game name resolution — priority chain:
                // 1. Owned game list name (most reliable, from GetOwnedGames/GetRecentlyPlayedGames)
                // 2. Steam Store API (reliable for F2P, early access, family-shared games)
                // 3. Steam Community hub page (persists for delisted/removed games)
                // 4. GetSchemaForGame (last resort — may return outdated or test names)
                const gameName = await this.resolveGameName(game, gameSchema?.gameName);

                const gameData = {
                  appId: game.appid,
                  name: gameName,
                  playtimeMinutes: game.playtime_forever,
                  lastPlayed: game.rtime_last_played ? new Date(game.rtime_last_played * 1000) : undefined,
                  totalAchievements,
                  earnedAchievements,
                  iconHash: game.img_icon_url,
                  ownershipSource,
                  achievementsFetchFailed: achievementsFetchFailed || undefined,
                };

                // Map achievements with metadata from schema
                const schemaMap = new Map(
                  gameSchema?.availableGameStats?.achievements?.map((a) => [a.name, a]) || []
                );

                // When achievement fetch failed but schema is available, create locked
                // achievement entries from the schema so the game page shows the full list.
                let achievementsData;
                if (achievementsFetchFailed && gameSchema?.availableGameStats?.achievements) {
                  achievementsData = gameSchema.availableGameStats.achievements.map((schemaAch) => ({
                    appId: game.appid,
                    achievementId: schemaAch.name,
                    name: schemaAch.displayName || schemaAch.name,
                    description: schemaAch.description || '',
                    unlocked: false,
                    unlockTime: undefined,
                    icon: schemaAch.icon,
                    iconGray: schemaAch.icongray,
                    globalPercent: globalPercentages.get(schemaAch.name),
                  }));
                } else {
                  achievementsData = playerAchievements.map((achievement) => {
                    const metadata = schemaMap.get(achievement.apiname);
                    return {
                      appId: game.appid,
                      achievementId: achievement.apiname,
                      name: metadata?.displayName || achievement.name || achievement.apiname,
                      description: metadata?.description || achievement.description || '',
                      unlocked: achievement.achieved === 1,
                      unlockTime: achievement.unlocktime ? new Date(achievement.unlocktime * 1000) : undefined,
                      icon: metadata?.icon,
                      iconGray: metadata?.icongray,
                      globalPercent: globalPercentages.get(achievement.apiname),
                    };
                  });
                }

                return { game: gameData, achievements: achievementsData };
              } catch (error) {
                logger.warn({ err: error instanceof Error ? error.message : String(error), appId: game.appid, name: game.name }, 'Failed to process game');
                return null;
              }
            })
          );
        }
      );

      const batchDuration = Date.now() - batchStart;
      
      // Collect results
      for (const batchResult of batchResults.result) {
        if (batchResult) {
          result.games.push(batchResult.game);
          result.achievements.push(...batchResult.achievements);
        }
      }

      processedCount += batch.length;
      i += currentBatchSize;
      
      // Update sync operation progress and check for cancellation
      if (syncOperation) {
        // Reload from database to check if cancelled
        const currentOp = await SyncOperation.findById(syncOperation._id);
        if (currentOp && (currentOp.status === 'cancelled' || currentOp.status === 'failed')) {
          logger.info({ syncOperationId: syncOperation._id }, 'Sync operation cancelled, stopping');
          throw new Error('Sync cancelled by user');
        }
        
        // Update in-memory copy for accurate final stats
        syncOperation.gamesProcessed = processedCount;

        if (progress) {
          await progress.update(
            processedCount,
            `Fetching achievement data... (${processedCount}/${games.length})`,
            { gamesProcessed: processedCount },
          );
        } else {
          // Atomic update after every batch for real-time progress tracking
          // (legacy callers that do not use the progress tracker)
          await SyncOperation.findByIdAndUpdate(syncOperation._id, {
            gamesProcessed: processedCount
          });
        }
        
        logger.debug({ 
          syncOperationId: syncOperation._id,
          processed: processedCount,
          total: games.length,
          progress: `${Math.round((processedCount / games.length) * 100)}%`,
        }, 'Updated sync progress');
      }
      
      // Log adaptive controller stats
      const batchStats = batchController.getStats();
      const concurrencyStats = concurrencyController.getStats();
      logger.info({ 
        processed: processedCount, 
        total: games.length,
        batchSize: currentBatchSize,
        batchDuration,
        concurrency: concurrencyStats.currentConcurrency,
        avgResponseTime: batchStats.averageResponseTime,
      }, 'Batch processing progress with adaptive parameters');

      // Adjust batch size based on performance
      batchController.adjustBatchSize(batchDuration);

      // Keep concurrency in sync — never exceed batch size
      concurrencyController.capConcurrency(batchController.getBatchSize());

      // Adaptive throttling between batches
      if (i < games.length) {
        await throttler.throttle(batchDuration);
      }
    }
    
    // Log final adaptive parameters
    const finalStats = {
      finalBatchSize: batchController.getBatchSize(),
      finalConcurrency: concurrencyController.getConcurrency(),
      finalDelay: throttler.getCurrentDelay(),
    };
    
    logger.info({
      ...finalStats,
      totalGames: result.games.length,
      totalAchievements: result.achievements.length,
    }, 'Sync completed with final adaptive parameters');

    return {
      ...result,
      adaptiveStats: finalStats,
    };
  }

  /**
   * Download game cover images with adaptive concurrency control.
   * Handles the full fallback chain: local cache → Steam CDN → SteamGridDB → IGDB → Steam Store API.
   */
  async downloadGameImages(
    games: Array<{ appId: number; name: string }>,
    syncOperation: any,
    steamGridDBAdapter: SteamGridDBAdapter | null,
    progress?: SyncProgressTracker,
  ): Promise<Map<number, { capsuleImagePath?: string; iconImagePath?: string; heroImagePath?: string }>> {
    const concurrencyController = new AdaptiveConcurrencyController(
      syncOperation.adaptiveParams.concurrency,
    );
    const hasSteamGridDB = steamGridDBAdapter !== null;

    logger.info({ total: games.length, syncOperationId: syncOperation._id }, 'Starting Steam game image downloads');

    // Pre-flight: check the local cache for every game before starting the
    // phase. This lets us report exactly how many games actually need a
    // network download, and avoids saying "Downloading game images..." on a
    // repeat sync where every image is already cached.
    let gamesToDownload = games;
    const cachedGameImages = new Map<number, {
      capsuleImagePath?: string;
      iconImagePath?: string;
      heroImagePath?: string;
    }>();

    if (progress) {
      const missing: typeof games = [];
      logger.info(
        { total: games.length, syncOperationId: syncOperation._id },
        'Checking local Steam game image cache',
      );

      for (let index = 0; index < games.length; index++) {
        const game = games[index];
        const cached = imageStorage.checkCachedGameImages('steam', game.appId.toString());
        if (cached.capsuleImagePath && cached.iconImagePath && cached.heroImagePath) {
          cachedGameImages.set(game.appId, cached);
        } else {
          missing.push(game);
        }

        if ((index + 1) % 100 === 0 && index + 1 < games.length) {
          logger.info(
            { checked: index + 1, total: games.length, cached: cachedGameImages.size },
            'Steam game image cache check progress',
          );
          // Yield so logs flush and the event loop stays responsive on large
          // libraries / slow NAS storage.
          await new Promise<void>((resolve) => setImmediate(resolve));
        }
      }

      logger.info(
        {
          total: games.length,
          cached: cachedGameImages.size,
          missing: missing.length,
          syncOperationId: syncOperation._id,
        },
        'Steam game image cache check complete',
      );

      gamesToDownload = missing;

      await progress.begin(
        'game-images',
        missing.length,
        missing.length === 0
          ? 'Game images already up to date'
          : `Downloading game images... (0/${missing.length})`,
        { imagesCompleted: cachedGameImages.size },
      );

      if (missing.length === 0) {
        await progress.complete('Game images already up to date', {
          imagesCompleted: games.length,
        });
        return new Map(games.map((game) => [game.appId, cachedGameImages.get(game.appId)!]));
      }
    }

    let imagesCompleted = 0;

    const gameImageResults = await Promise.all(
      gamesToDownload.map(async (game) => {
        const result = await concurrencyController.execute(async () => {
          let imagePath: string | undefined;

          // Priority 1: Check for any existing local files first (grid, header, or capsule)
          imagePath = imageStorage.checkLocalFile('steam', game.appId.toString(), 'game', 'grid');
          if (!imagePath) {
            imagePath = imageStorage.checkLocalFile('steam', game.appId.toString(), 'game', 'header');
          }
          if (!imagePath) {
            imagePath = imageStorage.checkLocalFile('steam', game.appId.toString(), 'game', 'capsule');
          }

          // Priority 2: Try direct Steam CDN library grid URL
          if (!imagePath) {
            try {
              const steamCdnUrl = `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appId}/library_600x900.jpg`;
              imagePath = await imageStorage.downloadAndStore(
                steamCdnUrl, 'steam', game.appId.toString(), 'game', 'grid',
              );
              logger.info({ appId: game.appId }, 'Downloaded image from Steam CDN (library grid)');
            } catch {
              logger.debug({ appId: game.appId }, 'Steam CDN library grid not available');
            }
          }

          // Fallback 1: SteamGridDB (if API key configured)
          if (!imagePath && hasSteamGridDB) {
            try {
              imagePath = await steamGridDBAdapter.downloadGameImage(game.appId) || undefined;
              if (imagePath) {
                logger.info({ appId: game.appId }, 'Downloaded image from SteamGridDB');
              }
            } catch (error) {
              logger.warn({ error, appId: game.appId }, 'SteamGridDB download failed');
            }
          }

          // Fallback 2: IGDB (if credentials configured)
          if (!imagePath) {
            try {
              const igdb = await createIGDBAdapter();
              if (igdb) {
                imagePath = await igdb.downloadGameImage(game.name, 'steam', game.appId.toString()) || undefined;
                if (imagePath) {
                  logger.info({ appId: game.appId }, 'Downloaded image from IGDB');
                }
              }
            } catch (error) {
              logger.warn({ error, appId: game.appId }, 'IGDB download failed');
            }
          }

          // Fallback 3: Steam Store API for header or capsule image (last resort)
          if (!imagePath) {
            try {
              const gameDetails = await this.getGameDetails(game.appId);

              if (gameDetails?.headerImage) {
                try {
                  imagePath = await imageStorage.downloadAndStore(
                    gameDetails.headerImage, 'steam', game.appId.toString(), 'game', 'header',
                  );
                  logger.info({ appId: game.appId }, 'Downloaded header image from Steam Store API');
                } catch {
                  logger.debug({ appId: game.appId }, 'Failed to download header image');
                }
              }

              if (!imagePath && gameDetails?.capsuleImage) {
                try {
                  imagePath = await imageStorage.downloadAndStore(
                    gameDetails.capsuleImage, 'steam', game.appId.toString(), 'game', 'capsule',
                  );
                  logger.info({ appId: game.appId }, 'Downloaded capsule image from Steam Store API');
                } catch {
                  logger.debug({ appId: game.appId }, 'Failed to download capsule image');
                }
              }
            } catch (error) {
              logger.warn({ error, appId: game.appId }, 'Steam Store API failed');
            }
          }

          // Download hero and icon images in parallel (non-blocking — failures are OK)
          const [heroImagePath, iconImagePath] = await Promise.all([
            // Hero: Steam CDN library_hero.jpg
            (async (): Promise<string | undefined> => {
              try {
                const cached = imageStorage.checkLocalFile('steam', game.appId.toString(), 'game', 'hero');
                if (cached) return cached;
                return await imageStorage.downloadAndStore(
                  `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appId}/library_hero.jpg`,
                  'steam', game.appId.toString(), 'game', 'hero',
                );
              } catch {
                logger.debug({ appId: game.appId }, 'Steam CDN hero image not available');
                return undefined;
              }
            })(),
            // Icon: SteamGridDB icon → Steam CDN header.jpg fallback (resized to 64×64 by imageStorage)
            (async (): Promise<string | undefined> => {
              try {
                const cached = imageStorage.checkLocalFile('steam', game.appId.toString(), 'game', 'icon');
                if (cached) return cached;

                // 1. SteamGridDB icon (proper game icons designed for icon display)
                if (hasSteamGridDB) {
                  const sgdbGame = await steamGridDBAdapter.searchGameBySteamId(game.appId);
                  if (sgdbGame) {
                    const icons = await steamGridDBAdapter.getIconImages(sgdbGame.id);
                    // Icons are pre-sorted PNG-first; try each until one succeeds
                    for (const icon of icons) {
                      try {
                        const iconPath = await imageStorage.downloadAndStore(
                          icon.url, 'steam', game.appId.toString(), 'game', 'icon',
                        );
                        if (iconPath) {
                          logger.info({ appId: game.appId }, '[ICON] Downloaded from SteamGridDB');
                          return iconPath;
                        }
                      } catch {
                        logger.debug({ appId: game.appId, iconUrl: icon.url }, 'SteamGridDB icon variant failed, trying next');
                      }
                    }
                  }
                }

                // 2. Steam CDN header.jpg fallback (wide banner cropped to 64×64)
                try {
                  const path = await imageStorage.downloadAndStore(
                    `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appId}/header.jpg`,
                    'steam', game.appId.toString(), 'game', 'icon',
                  );
                  if (path) return path;
                } catch {
                  logger.debug({ appId: game.appId }, 'Steam CDN icon image not available');
                }

                return undefined;
              } catch {
                logger.debug({ appId: game.appId }, 'Icon image not available from any source');
                return undefined;
              }
            })(),
          ]);

          return { appId: game.appId, capsuleImagePath: imagePath, heroImagePath, iconImagePath };
        });

        imagesCompleted++;
        if (progress && (imagesCompleted % 10 === 0 || imagesCompleted === gamesToDownload.length)) {
          await progress.update(
            imagesCompleted,
            `Downloading game images... (${imagesCompleted}/${gamesToDownload.length})`,
            { imagesCompleted: cachedGameImages.size + imagesCompleted },
          );
        }

        return result;
      }),
    );

    // Update imagesCompleted count on the sync operation
    const imagesDownloaded = gameImageResults.filter((r) => r.capsuleImagePath).length + cachedGameImages.size;
    const gameImageMap = new Map<number, {
      capsuleImagePath?: string;
      iconImagePath?: string;
      heroImagePath?: string;
    }>();

    for (const [appId, paths] of cachedGameImages) {
      gameImageMap.set(appId, paths);
    }
    for (const result of gameImageResults) {
      gameImageMap.set(result.appId, {
        capsuleImagePath: result.capsuleImagePath,
        iconImagePath: result.iconImagePath,
        heroImagePath: result.heroImagePath,
      });
    }

    if (progress) {
      await progress.complete('Game images ready', { imagesCompleted: imagesDownloaded });
    } else {
      await SyncOperation.updateOne(
        { _id: syncOperation._id },
        { $set: { imagesCompleted: imagesDownloaded } },
      );
    }

    logger.info({ total: games.length, syncOperationId: syncOperation._id }, 'All Steam game images downloaded');
    return gameImageMap;
  }

  /**
   * Convert a current shared community-asset URL back to the legacy CDN path.
   * Steam serves modern achievement icons from
   * `shared.akamai.steamstatic.com/community_assets/images/apps/...`, while
   * older icons may only exist on the legacy
   * `cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/...` path.
   */
  private toLegacySteamCommunityImageUrl(url: string, appId: number): string | undefined {
    try {
      const parsed = new URL(url);
      const marker = '/community_assets/images/apps/';
      const index = parsed.pathname.indexOf(marker);
      if (index === -1) return undefined;

      const filename = parsed.pathname.slice(index + marker.length).split('/').pop();
      if (!filename) return undefined;

      return `https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/${appId}/${filename}`;
    } catch {
      return undefined;
    }
  }

  /**
   * Download a Steam achievement image, trying the current shared CDN first
   * and falling back to the legacy community image path when needed.
   */
  private async downloadSteamAchievementImage(
    url: string,
    appId: number,
    achievementId: string,
    imageType: 'icon' | 'iconGray',
  ): Promise<string | undefined> {
    try {
      return await imageStorage.downloadAndStore(
        url, 'steam', appId.toString(), achievementId, imageType,
      );
    } catch (primaryError) {
      const primaryMessage = primaryError instanceof Error ? primaryError.message : String(primaryError);
      const legacyUrl = this.toLegacySteamCommunityImageUrl(url, appId);

      if (legacyUrl) {
        try {
          logger.debug(
            { appId, achievementId, imageType, primaryUrl: url, legacyUrl },
            'Current Steam image URL failed — retrying legacy CDN path',
          );
          return await imageStorage.downloadAndStore(
            legacyUrl, 'steam', appId.toString(), achievementId, imageType,
          );
        } catch (fallbackError) {
          const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
          logger.warn(
            {
              appId,
              achievementId,
              imageType,
              primaryUrl: url,
              legacyUrl,
              primaryError: primaryMessage,
              fallbackError: fallbackMessage,
            },
            'Failed to download Steam image from both CDN paths',
          );
          return imageStorage.checkLocalFile('steam', appId.toString(), achievementId, imageType);
        }
      }

      logger.warn({ appId, achievementId, imageType, error: primaryMessage }, 'Failed to download Steam image');
      return imageStorage.checkLocalFile('steam', appId.toString(), achievementId, imageType);
    }
  }

  /**
   * Download achievement icons with adaptive concurrency control.
   *
   * The local cache is checked before the phase starts so the reported total is
   * the number of achievement icons that actually need downloading. A repeat
   * sync with a warm cache therefore completes this phase instantly instead of
   * pretending to download every icon again.
   */
  async downloadAchievementIcons(
    achievements: Array<{ appId: number; achievementId: string; icon?: string; iconGray?: string }>,
    syncOperation: any,
    progress?: SyncProgressTracker,
  ): Promise<{
    iconMap: Map<string, { iconPath?: string; iconGrayPath?: string }>;
    completed: number;
    failed: number;
  }> {
    const concurrencyController = new AdaptiveConcurrencyController(
      syncOperation.adaptiveParams.concurrency,
    );

    logger.info({ total: achievements.length, syncOperationId: syncOperation._id }, 'Starting Steam achievement icon downloads');

    let completed = 0;
    let failed = 0;
    const iconMap = new Map<string, { iconPath?: string; iconGrayPath?: string }>();

    let achievementsToDownload = achievements;
    if (progress) {
      const missing: typeof achievements = [];
      logger.info(
        { total: achievements.length, syncOperationId: syncOperation._id },
        'Checking Steam achievement icon cache',
      );

      // Group by app so we read each game image directory only once. A Steam
      // library can easily contain tens of thousands of achievements; doing
      // two directory scans per achievement made this preflight very slow on
      // NAS/WSL setups.
      const achievementsByApp = new Map<number, typeof achievements>();
      for (const achievement of achievements) {
        const appAchievements = achievementsByApp.get(achievement.appId);
        if (appAchievements) {
          appAchievements.push(achievement);
        } else {
          achievementsByApp.set(achievement.appId, [achievement]);
        }
      }

      for (const [appId, appAchievements] of achievementsByApp) {
        const checks: Array<{ achievementId: string; imageType: 'icon' | 'iconGray' }> = [];
        for (const achievement of appAchievements) {
          checks.push({ achievementId: achievement.achievementId, imageType: 'icon' });
          checks.push({ achievementId: achievement.achievementId, imageType: 'iconGray' });
        }

        const cachedPaths = imageStorage.checkLocalFiles('steam', appId.toString(), checks);

        appAchievements.forEach((achievement, index) => {
          const key = `${achievement.appId}:${achievement.achievementId}`;
          const iconPath = cachedPaths[index * 2];
          const iconGrayPath = cachedPaths[index * 2 + 1];

          const needsIcon = !!achievement.icon && !iconPath;
          const needsGray = !!achievement.iconGray && !iconGrayPath;

          if (needsIcon || needsGray) {
            missing.push(achievement);
          } else {
            iconMap.set(key, { iconPath, iconGrayPath });
          }
        });
      }

      achievementsToDownload = missing;

      logger.info(
        {
          total: achievements.length,
          applications: achievementsByApp.size,
          cachedAchievements: iconMap.size,
          missingAchievements: missing.length,
          syncOperationId: syncOperation._id,
        },
        'Steam achievement icon cache check complete',
      );

      await progress.begin(
        'icons',
        missing.length,
        missing.length === 0
          ? 'Achievement icons already up to date'
          : `Downloading achievement icons... (0/${missing.length})`,
        {
          iconDownloadsPending: achievements.length,
          iconDownloadsCompleted: iconMap.size,
          iconDownloadsFailed: 0,
        },
      );

      if (missing.length === 0) {
        await progress.complete('Achievement icons already up to date', {
          iconDownloadsPending: achievements.length,
          iconDownloadsCompleted: achievements.length,
          iconDownloadsFailed: 0,
        });
        return { iconMap, completed: achievements.length, failed: 0 };
      }
    }

    const iconResults = await Promise.all(
      achievementsToDownload.map(async (achievement) => {
        const result = await concurrencyController.execute(async () => {
          const downloads: Promise<string | undefined>[] = [];

          if (achievement.icon) {
            downloads.push(
              this.downloadSteamAchievementImage(
                achievement.icon,
                achievement.appId,
                achievement.achievementId,
                'icon',
              ),
            );
          } else {
            downloads.push(Promise.resolve(undefined));
          }

          if (achievement.iconGray) {
            downloads.push(
              this.downloadSteamAchievementImage(
                achievement.iconGray,
                achievement.appId,
                achievement.achievementId,
                'iconGray',
              ),
            );
          } else {
            downloads.push(Promise.resolve(undefined));
          }

          try {
            const [iconPath, iconGrayPath] = await Promise.all(downloads);
            return {
              key: `${achievement.appId}:${achievement.achievementId}`,
              iconPath,
              iconGrayPath,
            };
          } catch {
            failed++;
            return null;
          }
        });

        completed++;
        if (progress && (completed % 50 === 0 || completed === achievementsToDownload.length)) {
          await progress.update(
            completed,
            `Downloading achievement icons... (${completed}/${achievementsToDownload.length})`,
            {
              iconDownloadsCompleted: iconMap.size + completed,
              iconDownloadsFailed: failed,
            },
          );
        } else if (!progress && (completed % 50 === 0 || completed === achievements.length)) {
          await SyncOperation.findByIdAndUpdate(syncOperation._id, {
            iconDownloadsCompleted: completed,
            iconDownloadsFailed: failed,
          });
          logger.info({
            completed,
            total: achievements.length,
            progress: `${Math.round((completed / achievements.length) * 100)}%`,
            syncOperationId: syncOperation._id,
          }, 'Achievement icon download progress');
        }

        return result;
      }),
    );

    for (const result of iconResults) {
      if (!result) continue;
      iconMap.set(result.key, {
        iconPath: result.iconPath,
        iconGrayPath: result.iconGrayPath,
      });
    }

    if (progress) {
      await progress.complete('Achievement icons ready', {
        iconDownloadsPending: achievements.length,
        iconDownloadsCompleted: Math.max(0, achievements.length - failed),
        iconDownloadsFailed: failed,
      });
    }

    logger.info({
      totalAchievements: achievements.length,
      iconMapSize: iconMap.size,
      iconsCompleted: completed,
      iconsFailed: failed,
      syncOperationId: syncOperation._id,
    }, 'Steam achievement icon download completed');

    return { iconMap, completed: Math.max(0, achievements.length - failed), failed };
  }

  /**
   * Get game details from Steam Store API including all available images
   * This is a public API and doesn't require authentication
   */
  async getGameDetails(appId: number): Promise<{
    headerImage?: string;
    libraryAsset?: string;
    capsuleImage?: string;
    screenshots?: string[];
  } | null> {
    const url = `https://store.steampowered.com/api/appdetails?appids=${appId}`;
    
    return rateLimiter.executeWithRetry(
      'steam-store',
      async () => {
        try {
          const response = await fetch(url);
          const data = await response.json() as any;
          
          if (!data[appId]?.success || !data[appId]?.data) {
            return null;
          }

          const gameData = data[appId].data;
          
          return {
            headerImage: gameData.header_image, // 460x215
            libraryAsset: gameData.library_assets?.library_hero, // Large library image
            capsuleImage: gameData.capsule_image, // Store capsule
            screenshots: gameData.screenshots?.map((s: any) => s.path_full) || [],
          };
        } catch (error) {
          logger.warn({ error, appId }, 'Failed to fetch game details from Steam Store API');
          return null;
        }
      },
      appId.toString()
    );
  }
}

export async function createSteamAdapter(apiKey?: string): Promise<SteamAdapter> {
  // Steam API key is configured per-profile, not globally
  if (!apiKey) {
    throw new Error('Steam API key not configured. Please set it in the Profile settings.');
  }
  return new SteamAdapter(apiKey);
}
