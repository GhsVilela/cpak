import { logger } from '../../utils/logger.js';
import { rateLimiter } from '../rateLimiter.js';
import { configService } from '../configService.js';
import { AdaptiveBatchController } from '../adaptiveBatchController.js';
import { AdaptiveThrottler } from '../adaptiveThrottler.js';
import { AdaptiveConcurrencyController } from '../adaptiveConcurrencyController.js';
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
      lastPlayed?: Date;
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
        lastPlayed?: Date;
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
    
    const concurrencyStr = await configService.getSetting('sync_concurrency');
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
                  lastPlayed: game.rtime_last_played ? new Date(game.rtime_last_played * 1000) : undefined,
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
        
        // Atomic update after every batch for real-time progress tracking
        // This ensures the most up-to-date progress is visible to users via polling
        await SyncOperation.findByIdAndUpdate(syncOperation._id, {
          gamesCompleted: processedCount
        });
        
        // Update in-memory copy for accurate final stats
        syncOperation.gamesCompleted = processedCount;
        
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
