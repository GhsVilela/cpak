import { config } from '../../utils/config.js';
import { logger } from '../../utils/logger.js';

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
    try {
      const response = await fetch(url);
      const data = await response.json() as any;
      return data.response?.players?.[0] || null;
    } catch (error) {
      logger.error({ error, steamId }, 'Failed to fetch player summary');
      return null;
    }
  }

  async getOwnedGames(steamId: string): Promise<SteamGame[]> {
    const url = `${this.baseUrl}/IPlayerService/GetOwnedGames/v1/?key=${this.apiKey}&steamid=${steamId}&include_appinfo=1&include_played_free_games=1`;
    try {
      const response = await fetch(url);
      const data = await response.json() as any;
      return data.response?.games || [];
    } catch (error) {
      logger.error({ error, steamId }, 'Failed to fetch owned games');
      return [];
    }
  }

  async getPlayerAchievements(steamId: string, appId: number): Promise<SteamAchievement[]> {
    const url = `${this.baseUrl}/ISteamUserStats/GetPlayerAchievements/v1/?key=${this.apiKey}&steamid=${steamId}&appid=${appId}`;
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
  }

  async getGameSchema(appId: number): Promise<SteamGameSchema | null> {
    const url = `${this.baseUrl}/ISteamUserStats/GetSchemaForGame/v2/?key=${this.apiKey}&appid=${appId}`;
    try {
      const response = await fetch(url);
      const data = await response.json() as any;
      return data.game || null;
    } catch (error) {
      logger.warn({ error, appId }, 'Failed to fetch game schema');
      return null;
    }
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

    for (const game of games) {
      // Fetch achievements for this game
      const playerAchievements = await this.getPlayerAchievements(steamId, game.appid);
      const gameSchema = await this.getGameSchema(game.appid);

      const totalAchievements = gameSchema?.availableGameStats?.achievements?.length || 0;
      const earnedAchievements = playerAchievements.filter((a) => a.achieved === 1).length;

      // Log progress for debugging
      if (earnedAchievements > 0) {
        logger.info({ 
          appId: game.appid, 
          name: game.name, 
          totalAchievements, 
          earnedAchievements 
        }, 'Found game with unlocked achievements');
      }

      // Only include games that have achievements AND user has unlocked at least one
      if (totalAchievements === 0 || earnedAchievements === 0) {
        continue;
      }

      result.games.push({
        appId: game.appid,
        name: game.name,
        playtimeMinutes: game.playtime_forever,
        totalAchievements,
        earnedAchievements,
        iconHash: game.img_icon_url,
      });

      // Map achievements with metadata from schema
      const schemaMap = new Map(
        gameSchema?.availableGameStats?.achievements?.map((a) => [a.name, a]) || []
      );

      for (const achievement of playerAchievements) {
        const metadata = schemaMap.get(achievement.apiname);
        result.achievements.push({
          appId: game.appid,
          achievementId: achievement.apiname,
          name: metadata?.displayName || achievement.name || achievement.apiname,
          description: metadata?.description || achievement.description || '',
          unlocked: achievement.achieved === 1,
          unlockTime: achievement.unlocktime ? new Date(achievement.unlocktime * 1000) : undefined,
          icon: metadata?.icon,
          iconGray: metadata?.icongray,
        });
      }

      // Rate limiting: Steam allows ~200 requests per 5 minutes
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    return result;
  }
}

export function createSteamAdapter(apiKey?: string): SteamAdapter {
  const key = apiKey || config.STEAM_API_KEY;
  if (!key) {
    throw new Error('STEAM_API_KEY not configured');
  }
  return new SteamAdapter(key);
}
