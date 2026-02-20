import { config } from '../../utils/config.js';
import { logger } from '../../utils/logger.js';
import { rateLimiter } from '../rateLimiter.js';
import { configService } from '../configService.js';
import { AdaptiveBatchController } from '../adaptiveBatchController.js';
import { AdaptiveThrottler } from '../adaptiveThrottler.js';
import { AdaptiveConcurrencyController } from '../adaptiveConcurrencyController.js';
import { performanceMonitor } from '../performanceMonitor.js';
import { SyncOperation } from '../../models/syncOperation.js';

interface SteamGame {
  appid: number;
  name: string;
  playtime_forever: number;
  img_icon_url?: string;
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
        try {
          const response = await fetch(url);
          const data = await response.json() as any;
          return data.response?.players?.[0] || null;
        } catch (error) {
          logger.error({ error, steamId }, 'Failed to fetch player summary');
          return null;
        }
      },
      steamId
    );
  }

  async getOwnedGames(steamId: string): Promise<SteamGame[]> {
    const url = `${this.baseUrl}/IPlayerService/GetOwnedGames/v1/?key=${this.apiKey}&steamid=${steamId}&include_appinfo=1&include_played_free_games=1`;
    
    return rateLimiter.executeWithRetry(
      'steam',
      async () => {
        try {
          const response = await fetch(url);
          const data = await response.json() as any;
          return data.response?.games || [];
        } catch (error) {
          logger.error({ error, steamId }, 'Failed to fetch owned games');
          return [];
        }
      },
      steamId
    );
  }

  async getPlayerAchievements(steamId: string, appId: number): Promise<SteamAchievement[]> {
    const url = `${this.baseUrl}/ISteamUserStats/GetPlayerAchievements/v1/?key=${this.apiKey}&steamid=${steamId}&appid=${appId}`;
    
    return rateLimiter.executeWithRetry(
      'steam',
      async () => {
        try {
          const response = await fetch(url);
          const data = await response.json() as any;
          if (!data.playerstats?.success) {
            return [];
          }
          return data.playerstats?.achievements || [];
        } catch (error) {
          logger.warn({ error, steamId, appId }, 'Failed to fetch achievements for game');
          return [];
        }
      },
      `${steamId}:${appId}`
    );
  }

  async getGameSchema(appId: number): Promise<SteamGameSchema | null> {
    const url = `${this.baseUrl}/ISteamUserStats/GetSchemaForGame/v2/?key=${this.apiKey}&appid=${appId}`;
    
    return rateLimiter.executeWithRetry(
      'steam',
      async () => {
        try {
          const response = await fetch(url);
          const data = await response.json() as any;
          return data.game || null;
        } catch (error) {
          logger.warn({ error, appId }, 'Failed to fetch game schema');
          return null;
        }
      },
      `schema:${appId}`
    );
  }

  async syncGamesAndAchievements(steamId: string, syncOperation?: any): Promise<{
    games: Array<{
      appId: number;
      name: string;
      playtimeMinutes: number;
      totalAchievements: number;
      earnedAchievements: number;
      iconHash?: string;
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
    const games = await performanceMonitor.measureApiCall(
      'steam.getOwnedGames',
      async () => this.getOwnedGames(steamId)
    );
    logger.info({ steamId, totalGames: games.length }, 'Fetched owned games from Steam');
    
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
        totalAchievements: number;
        earnedAchievements: number;
        iconHash?: string;
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

    // Initialize adaptive controllers with user-configured maximums
    const batchSizeStr = await configService.getSetting('sync_batch_size');
    const userMaxBatchSize = parseInt(batchSizeStr || '10', 10);
    const batchController = new AdaptiveBatchController(userMaxBatchSize);
    const throttler = new AdaptiveThrottler();
    
    const concurrencyStr = await configService.getSetting('sync_image_concurrency');
    const userMaxConcurrency = parseInt(concurrencyStr || '5', 10);
    const concurrencyController = new AdaptiveConcurrencyController(userMaxConcurrency);
    
    logger.info({
      userMaxBatchSize,
      userMaxConcurrency,
    }, 'Adaptive controllers initialized with user settings');

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

                const totalAchievements = gameSchema?.availableGameStats?.achievements?.length || 0;
                const earnedAchievements = playerAchievements.filter((a) => a.achieved === 1).length;

                // Only include games that have achievements AND user has unlocked at least one
                if (totalAchievements === 0 || earnedAchievements === 0) {
                  return null;
                }

                logger.debug({ 
                  appId: game.appid, 
                  name: game.name, 
                  totalAchievements, 
                  earnedAchievements 
                }, 'Found game with unlocked achievements');

                const gameData = {
                  appId: game.appid,
                  name: game.name,
                  playtimeMinutes: game.playtime_forever,
                  totalAchievements,
                  earnedAchievements,
                  iconHash: game.img_icon_url,
                };

                // Map achievements with metadata from schema
                const schemaMap = new Map(
                  gameSchema?.availableGameStats?.achievements?.map((a) => [a.name, a]) || []
                );

                const achievementsData = playerAchievements.map((achievement) => {
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

                return { game: gameData, achievements: achievementsData };
              } catch (error) {
                logger.warn({ error, appId: game.appid, name: game.name }, 'Failed to process game');
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
        
        syncOperation.gamesCompleted = processedCount;
        // Save every 3 batches or on last batch for more frequent updates
        if (processedCount % (currentBatchSize * 3) === 0 || i >= games.length) {
          await syncOperation.save();
          logger.debug({ 
            syncOperationId: syncOperation._id,
            processed: processedCount,
            total: games.length,
            progress: `${Math.round((processedCount / games.length) * 100)}%`,
          }, 'Updated sync progress');
        }
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
