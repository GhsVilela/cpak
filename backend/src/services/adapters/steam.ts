import { config } from '../../utils/config.js';
import { logger } from '../../utils/logger.js';
import { rateLimiter } from '../rateLimiter.js';
import { configService } from '../configService.js';

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

  async syncGamesAndAchievements(steamId: string): Promise<{
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
  }> {
    const games = await this.getOwnedGames(steamId);
    logger.info({ steamId, totalGames: games.length }, 'Fetched owned games from Steam');
    
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

    // Process games in batches for better performance
    const batchSize = parseInt(process.env.SYNC_BATCH_SIZE || '10', 10);
    let processedCount = 0;

    for (let i = 0; i < games.length; i += batchSize) {
      const batch = games.slice(i, i + batchSize);
      
      // Process batch in parallel
      const batchResults = await Promise.all(
        batch.map(async (game) => {
          try {
            // Fetch achievements and schema in parallel
            const [playerAchievements, gameSchema] = await Promise.all([
              this.getPlayerAchievements(steamId, game.appid),
              this.getGameSchema(game.appid),
            ]);

            const totalAchievements = gameSchema?.availableGameStats?.achievements?.length || 0;
            const earnedAchievements = playerAchievements.filter((a) => a.achieved === 1).length;

            // Only include games that have achievements AND user has unlocked at least one
            if (totalAchievements === 0 || earnedAchievements === 0) {
              return null;
            }

            logger.info({ 
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

      // Collect results
      for (const batchResult of batchResults) {
        if (batchResult) {
          result.games.push(batchResult.game);
          result.achievements.push(...batchResult.achievements);
        }
      }

      processedCount += batch.length;
      logger.info({ processed: processedCount, total: games.length }, 'Batch processing progress');

      // Rate limiting: Small delay between batches
      if (i + batchSize < games.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    return result;
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
