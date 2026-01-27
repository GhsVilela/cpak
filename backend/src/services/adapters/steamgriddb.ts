import { config } from '../../utils/config.js';
import { logger } from '../../utils/logger.js';
import { iconStorage } from '../../utils/iconStorage.js';
import { Settings } from '../../models/settings.js';

interface SteamGridDBGame {
  id: number;
  name: string;
  types: string[];
  verified: boolean;
}

interface SteamGridDBImage {
  id: number;
  url: string;
  thumb: string;
  tags: string[];
  author: {
    name: string;
    steam64: string;
  };
  width: number;
  height: number;
  score: number;
  style: string;
  notes: string | null;
}

export class SteamGridDBAdapter {
  private apiKey: string;
  private baseUrl = 'https://www.steamgriddb.com/api/v2';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Search for game by Steam App ID
   */
  async searchGameBySteamId(steamAppId: number): Promise<SteamGridDBGame | null> {
    const url = `${this.baseUrl}/games/steam/${steamAppId}`;
    
    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          logger.warn({ steamAppId }, 'Game not found in SteamGridDB');
          return null;
        }
        throw new Error(`SteamGridDB API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as any;
      return data.data || null;
    } catch (error) {
      logger.error({ error, steamAppId }, 'Failed to search SteamGridDB');
      return null;
    }
  }

  /**
   * Get grid images for a game (512x512, 460x215, etc.)
   */
  async getGridImages(gameId: number, dimensions: string[] = ['512x512', '460x215']): Promise<SteamGridDBImage[]> {
    const url = `${this.baseUrl}/grids/game/${gameId}`;
    
    try {
      const params = new URLSearchParams();
      dimensions.forEach((dim) => params.append('dimensions', dim));

      const response = await fetch(`${url}?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`SteamGridDB API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as any;
      return data.data || [];
    } catch (error) {
      logger.error({ error, gameId }, 'Failed to fetch grid images');
      return [];
    }
  }

  /**
   * Get hero images for a game (1920x620, 3840x1240)
   */
  async getHeroImages(gameId: number): Promise<SteamGridDBImage[]> {
    const url = `${this.baseUrl}/heroes/game/${gameId}`;
    
    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`SteamGridDB API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as any;
      return data.data || [];
    } catch (error) {
      logger.error({ error, gameId }, 'Failed to fetch hero images');
      return [];
    }
  }

  /**
   * Download and store the best grid image for a Steam game
   */
  async downloadGameImage(steamAppId: number): Promise<string | null> {
    try {
      // Search for game in SteamGridDB
      const game = await this.searchGameBySteamId(steamAppId);
      if (!game) {
        logger.warn({ steamAppId }, 'Game not found in SteamGridDB');
        return null;
      }

      // Get grid images (prefer 512x512 for consistency)
      const images = await this.getGridImages(game.id, ['512x512', '460x215']);
      if (images.length === 0) {
        logger.warn({ steamAppId, sgdbId: game.id }, 'No grid images found');
        return null;
      }

      // Sort by score (highest first) and take the best one
      const bestImage = images.sort((a, b) => b.score - a.score)[0];

      // Download and store the image
      const imagePath = await iconStorage.downloadAndStore(
        bestImage.url,
        'steam',
        steamAppId.toString(),
        'game',
        'grid'
      );

      logger.info({ 
        steamAppId, 
        sgdbId: game.id, 
        imageId: bestImage.id,
        score: bestImage.score,
        imagePath 
      }, 'Downloaded SteamGridDB image');

      return imagePath;
    } catch (error) {
      logger.error({ error, steamAppId }, 'Failed to download game image');
      return null;
    }
  }

  /**
   * Batch download images for multiple games
   */
  async downloadGameImages(steamAppIds: number[], concurrency: number = 3): Promise<Map<number, string | null>> {
    const results = new Map<number, string | null>();
    const promises: Promise<void>[] = [];

    for (const appId of steamAppIds) {
      const promise = (async () => {
        const imagePath = await this.downloadGameImage(appId);
        results.set(appId, imagePath);
      })();

      promises.push(promise);

      // Process in batches to respect rate limits
      if (promises.length >= concurrency) {
        await Promise.all(promises.splice(0, concurrency));
        // Small delay between batches
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    // Wait for remaining downloads
    await Promise.all(promises);
    return results;
  }
}

export async function createSteamGridDBAdapter(apiKey?: string): Promise<SteamGridDBAdapter | null> {
  // Priority: 1) Provided API key, 2) Database settings, 3) Environment variable
  let key = apiKey;
  
  if (!key) {
    try {
      const settings = await Settings.findById('global');
      key = settings?.steamGridApiKey;
    } catch (error) {
      logger.warn({ error }, 'Failed to load SteamGridDB API key from settings');
    }
  }
  
  if (!key) {
    key = config.STEAMGRID_API_KEY;
  }
  
  if (!key) {
    logger.warn('STEAMGRID_API_KEY not configured, image downloads disabled');
    return null;
  }
  
  return new SteamGridDBAdapter(key);
}
