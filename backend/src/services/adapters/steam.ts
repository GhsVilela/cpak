import { logger } from '../../utils/logger.js';
import { rateLimiter } from '../rateLimiter.js';
import { AdaptiveBatchController } from '../adaptiveBatchController.js';
import { AdaptiveThrottler } from '../adaptiveThrottler.js';
import { AdaptiveConcurrencyController } from '../adaptiveConcurrencyController.js';
import { SYNC_DEFAULTS } from '../syncDefaults.js';
import { performanceMonitor } from '../performanceMonitor.js';
import { SyncOperation } from '../../models/syncOperation.js';
import { imageStorage } from '../../utils/imageStorage.js';
import { fetchPCGamingWikiImageUrl, fetchWikipediaImageUrl } from './gameImageSearch.js';
import type { SteamGridDBAdapter } from './steamgriddb.js';

interface SteamGame {
  appid: number;
  name: string;
  playtime_forever: number;
  img_icon_url?: string;
  rtime_last_played?: number;
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
    const url = `${this.baseUrl}/IPlayerService/GetOwnedGames/v1/?key=${this.apiKey}&steamid=${steamId}&include_appinfo=1&include_played_free_games=1`;
    
    return rateLimiter.executeWithRetry(
      'steam',
      async () => {
        const response = await fetch(url);
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
   * Fetch app details from the Steam Store API.
   * This is the most reliable source for game names — the community API schema
   * occasionally returns placeholder/test names for certain titles.
   * Rate-limited to avoid Store API throttling.
   */
  async getAppDetails(appId: number): Promise<{ name: string } | null> {
    const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&filters=basic`;

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) return null;
      const data = await response.json() as any;
      const appData = data?.[String(appId)];
      if (appData?.success && appData.data?.name) {
        return { name: appData.data.name };
      }
      return null;
    } catch (error) {
      logger.debug({ error: String(error), appId }, 'Steam Store appdetails lookup failed');
      return null;
    }
  }

  /**
   * Look up a game name from the Steam Community hub page.
   * Works for delisted/removed games that the Store API no longer returns,
   * as community hub pages typically persist after delisting.
   */
  private async getAppNameFromCommunity(appId: number): Promise<string | null> {
    const url = `https://steamcommunity.com/app/${appId}`;

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10_000),
        redirect: 'follow',
      });
      if (!response.ok) return null;
      const html = await response.text();
      // The page title follows the pattern: "Steam Community :: Game Name"
      const match = html.match(/<title>\s*Steam Community\s*::\s*(.+?)\s*<\/title>/i);
      if (match?.[1]) {
        const name = match[1].trim();
        // Ignore generic error/redirect pages
        if (name && name !== 'Error' && name !== 'Steam Community') {
          return name;
        }
      }
      return null;
    } catch (error) {
      logger.debug({ error: String(error), appId }, 'Steam Community name lookup failed');
      return null;
    }
  }

  async syncGamesAndAchievements(steamId: string, syncOperation?: any, knownGameIds?: number[]): Promise<{
    games: Array<{
      appId: number;
      name: string;
      playtimeMinutes: number;
      lastPlayed?: Date;
      totalAchievements: number;
      earnedAchievements: number;
      iconHash?: string;
      ownershipSource?: 'owned' | 'played_history' | 'recent';
      achievementsFetchFailed?: boolean;
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
    }>;
    adaptiveStats?: {
      finalBatchSize: number;
      finalConcurrency: number;
      finalDelay: number;
    };
  }> {
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
    const ownershipSourceMap = new Map<number, 'owned' | 'played_history' | 'recent'>();
    for (const g of ownedGames) {
      gameMap.set(g.appid, g);
      ownershipSourceMap.set(g.appid, 'owned');
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
        ownershipSourceMap.set(g.appid, 'recent');
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
    
    const result: {
      games: Array<{
        appId: number;
        name: string;
        playtimeMinutes: number;
        lastPlayed?: Date;
        totalAchievements: number;
        earnedAchievements: number;
        iconHash?: string;
        ownershipSource?: 'owned' | 'played_history' | 'recent';
        achievementsFetchFailed?: boolean;
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
                // Fetch achievements and schema with performance monitoring and adaptive concurrency
                const [playerAchievements, gameSchema] = await Promise.all([
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
                ]);

                const schemaTotalAchievements = gameSchema?.availableGameStats?.achievements?.length || 0;
                const earnedAchievements = playerAchievements.filter((a) => a.achieved === 1).length;
                const ownershipSource = ownershipSourceMap.get(game.appid);

                // Achievement fetch failed: the game has a schema with achievements but we
                // couldn't retrieve any player achievement data (e.g. refunded/expired license).
                const achievementsFetchFailed = playerAchievements.length === 0 && schemaTotalAchievements > 0;

                // Skip games where the user hasn't unlocked any achievements AND the
                // achievement fetch didn't fail.  When the fetch failed (revoked license),
                // we still want the game to appear in the list so the user gets feedback.
                if (earnedAchievements === 0 && !achievementsFetchFailed) {
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
                let gameName = game.name || '';
                if (!gameName) {
                  const storeDetails = await this.getAppDetails(game.appid);
                  if (storeDetails?.name) {
                    logger.info({ appId: game.appid, newName: storeDetails.name }, 'Resolved game name from Steam Store API');
                    gameName = storeDetails.name;
                  }
                }
                if (!gameName) {
                  const communityName = await this.getAppNameFromCommunity(game.appid);
                  if (communityName) {
                    logger.info({ appId: game.appid, newName: communityName }, 'Resolved game name from Steam Community');
                    gameName = communityName;
                  }
                }
                if (!gameName && gameSchema?.gameName) {
                  gameName = gameSchema.gameName;
                  if (gameName.length <= 4 || /^(test|placeholder|unknown|valvetestapp)/i.test(gameName)) {
                    logger.info({ appId: game.appid, schemaName: gameName }, 'Discarding suspicious schema game name');
                    gameName = '';
                  }
                }
                if (!gameName) gameName = `Unknown (${game.appid})`;

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
        
        // Atomic update after every batch for real-time progress tracking
        // This ensures the most up-to-date progress is visible to users via polling
        await SyncOperation.findByIdAndUpdate(syncOperation._id, {
          gamesProcessed: processedCount
        });
        
        // Update in-memory copy for accurate final stats
        syncOperation.gamesProcessed = processedCount;
        
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
   * Handles the full fallback chain: local cache → Steam CDN → SteamGridDB → PCGamingWiki → Wikipedia → Steam Store API.
   */
  async downloadGameImages(
    games: Array<{ appId: number; name: string }>,
    syncOperation: any,
    steamGridDBAdapter: SteamGridDBAdapter | null,
  ): Promise<Map<number, string | undefined>> {
    const concurrencyController = new AdaptiveConcurrencyController(
      syncOperation.adaptiveParams.concurrency,
    );
    const hasSteamGridDB = steamGridDBAdapter !== null;

    logger.info({ total: games.length, syncOperationId: syncOperation._id }, 'Starting Steam game image downloads');

    const gameImageResults = await Promise.all(
      games.map((game) =>
        concurrencyController.execute(async () => {
          let imagePath: string | undefined;

          // Priority 1: Check for any existing local files first (grid, header, or capsule)
          imagePath = imageStorage.checkLocalFile('steam', game.appId.toString(), 'game', 'grid');
          if (imagePath) {
            logger.info({ appId: game.appId, imagePath }, 'Using existing local grid file');
            return { appId: game.appId, imagePath };
          }
          imagePath = imageStorage.checkLocalFile('steam', game.appId.toString(), 'game', 'header');
          if (imagePath) {
            logger.debug({ appId: game.appId }, 'Using existing local file (header)');
            return { appId: game.appId, imagePath };
          }
          imagePath = imageStorage.checkLocalFile('steam', game.appId.toString(), 'game', 'capsule');
          if (imagePath) {
            logger.debug({ appId: game.appId }, 'Using existing local file (capsule)');
            return { appId: game.appId, imagePath };
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

          // Fallback 2: PCGamingWiki (public MediaWiki API, no API key)
          if (!imagePath) {
            logger.info({ appId: game.appId, name: game.name }, '[IMG Steam P2] Trying PCGamingWiki');
            try {
              const pcgwUrl = await fetchPCGamingWikiImageUrl(game.name);
              if (pcgwUrl) {
                logger.info({ appId: game.appId, name: game.name, pcgwUrl }, '[IMG Steam P2] PCGamingWiki URL found — downloading');
                imagePath = await imageStorage.downloadAndStoreViaWget(
                  pcgwUrl, 'steam', game.appId.toString(), 'game', 'grid',
                );
                if (imagePath) {
                  logger.info({ appId: game.appId, name: game.name }, '[IMG Steam P2] PCGamingWiki image downloaded');
                } else {
                  logger.warn({ appId: game.appId, name: game.name, pcgwUrl }, '[IMG Steam P2] PCGamingWiki download returned no path');
                }
              } else {
                logger.info({ appId: game.appId, name: game.name }, '[IMG Steam P2] PCGamingWiki returned no image');
              }
            } catch (error) {
              logger.warn({ error: String(error), appId: game.appId, name: game.name }, '[IMG Steam P2] PCGamingWiki lookup threw');
            }
          }

          // Fallback 3: Wikipedia (public REST API, no API key)
          if (!imagePath) {
            logger.info({ appId: game.appId, name: game.name }, '[IMG Steam P3] Trying Wikipedia');
            try {
              const wikiUrl = await fetchWikipediaImageUrl(game.name);
              if (wikiUrl) {
                logger.info({ appId: game.appId, name: game.name, wikiUrl }, '[IMG Steam P3] Wikipedia URL found — downloading');
                imagePath = await imageStorage.downloadAndStoreViaWget(
                  wikiUrl, 'steam', game.appId.toString(), 'game', 'grid',
                );
                if (imagePath) {
                  logger.info({ appId: game.appId, name: game.name }, '[IMG Steam P3] Wikipedia image downloaded');
                } else {
                  logger.warn({ appId: game.appId, name: game.name, wikiUrl }, '[IMG Steam P3] Wikipedia download returned no path');
                }
              } else {
                logger.info({ appId: game.appId, name: game.name }, '[IMG Steam P3] Wikipedia returned no image');
              }
            } catch (error) {
              logger.warn({ error, appId: game.appId, name: game.name }, '[IMG Steam P3] Wikipedia lookup threw');
            }
          }

          // Fallback 4: Steam Store API for header or capsule image (last resort)
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

          return { appId: game.appId, imagePath };
        }),
      ),
    );

    // Update imagesCompleted count on the sync operation
    const imagesDownloaded = gameImageResults.filter((r) => r.imagePath).length;
    await SyncOperation.updateOne(
      { _id: syncOperation._id },
      { $set: { imagesCompleted: imagesDownloaded } },
    );

    const gameImageMap = new Map(gameImageResults.map((r) => [r.appId, r.imagePath]));
    logger.info({ total: games.length, syncOperationId: syncOperation._id }, 'All Steam game images downloaded');
    return gameImageMap;
  }

  /**
   * Download achievement icons with adaptive concurrency control.
   * Updates syncOperation progress every 50 icons.
   */
  async downloadAchievementIcons(
    achievements: Array<{ appId: number; achievementId: string; icon?: string; iconGray?: string }>,
    syncOperation: any,
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

    const iconResults = await Promise.all(
      achievements.map((achievement) =>
        concurrencyController.execute(async () => {
          const downloads: Promise<string | undefined>[] = [];

          if (achievement.icon) {
            downloads.push(
              imageStorage
                .downloadAndStore(
                  achievement.icon, 'steam', achievement.appId.toString(), achievement.achievementId, 'icon',
                )
                .catch((error) => {
                  const errorMessage = error instanceof Error ? error.message : String(error);
                  logger.warn({ error: errorMessage, appId: achievement.appId, achievementId: achievement.achievementId }, 'Failed to download icon');
                  return imageStorage.checkLocalFile('steam', achievement.appId.toString(), achievement.achievementId, 'icon');
                }),
            );
          } else {
            downloads.push(Promise.resolve(undefined));
          }

          if (achievement.iconGray) {
            downloads.push(
              imageStorage
                .downloadAndStore(
                  achievement.iconGray, 'steam', achievement.appId.toString(), achievement.achievementId, 'iconGray',
                )
                .catch((error) => {
                  const errorMessage = error instanceof Error ? error.message : String(error);
                  logger.warn({ error: errorMessage, appId: achievement.appId, achievementId: achievement.achievementId }, 'Failed to download iconGray');
                  return imageStorage.checkLocalFile('steam', achievement.appId.toString(), achievement.achievementId, 'iconGray');
                }),
            );
          } else {
            downloads.push(Promise.resolve(undefined));
          }

          try {
            const [iconPath, iconGrayPath] = await Promise.all(downloads);
            completed++;

            if (completed % 50 === 0 || completed === achievements.length) {
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

            return {
              key: `${achievement.appId}:${achievement.achievementId}`,
              iconPath,
              iconGrayPath,
            };
          } catch {
            failed++;
            return null;
          }
        }),
      ),
    );

    const iconMap = new Map(
      iconResults
        .filter((r): r is NonNullable<typeof r> => r !== null)
        .map((r) => [r.key, { iconPath: r.iconPath, iconGrayPath: r.iconGrayPath }]),
    );

    logger.info({
      totalAchievements: achievements.length,
      iconMapSize: iconMap.size,
      iconsCompleted: completed,
      iconsFailed: failed,
      syncOperationId: syncOperation._id,
    }, 'Steam achievement icon download completed');

    return { iconMap, completed, failed };
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
