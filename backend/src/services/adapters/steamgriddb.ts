import { config } from '../../utils/config.js';
import { logger } from '../../utils/logger.js';
import { imageStorage } from '../../utils/imageStorage.js';
import { configService } from '../configService.js';

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
   * Normalise an Xbox (or other platform) game title for SteamGridDB searching.
   *
   * Xbox API titles are often machine-formatted without spaces, e.g.:
   *   "SplinterCellConviction"  → "Splinter Cell Conviction"
   *   "DEADRISING2:CASE WEST"   → "Dead Rising 2 Case West"
   *   "ForzaHorizon5"           → "Forza Horizon 5"
   */
  private normalizeGameName(name: string): string {
    let n = name;

    // 1. Remove content inside parentheses/brackets (editions, SKU suffixes)
    n = n.replace(/\s*[\(\[][^\)\]]*[\)\]]/g, '');

    // 2. Replace colons/hyphens used as subtitle separators with a space
    n = n.replace(/[:\-]/g, ' ');

    // 3. Insert space before a digit that immediately follows a letter: "DEADRISING2" → "DEADRISING 2"
    n = n.replace(/([A-Za-z])(\d)/g, '$1 $2');
    // Insert space before a letter that immediately follows a digit: "2FAST" → "2 FAST"
    n = n.replace(/(\d)([A-Za-z])/g, '$1 $2');

    // 4. Split CamelCase / PascalCase: insert space before an uppercase letter
    //    that is preceded by a lowercase letter or followed by a lowercase letter
    //    (avoids splitting acronyms like "USA" or "RPG").
    //    "SplinterCellConviction" → "Splinter Cell Conviction"
    n = n.replace(/([a-z])([A-Z])/g, '$1 $2');
    n = n.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');

    // 5. Convert fully upper-cased words to title case, leave mixed-case alone
    //    "DEAD RISING" → "Dead Rising"  but "DeadRising" already split → leave alone
    if (n === n.toUpperCase()) {
      n = n.toLowerCase().replace(/(?:^|\s)\S/g, (c) => c.toUpperCase());
    } else {
      // Title-case any remaining all-caps words (≥2 chars) that aren't acronyms context
      n = n.replace(/\b([A-Z]{2,})\b/g, (word) =>
        word.charAt(0) + word.slice(1).toLowerCase(),
      );
    }

    // 6. Collapse multiple spaces and trim
    n = n.replace(/\s{2,}/g, ' ').trim();

    return n;
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
   * Get grid images for a game (all dimensions)
   */
  async getGridImages(gameId: number, styles?: string): Promise<SteamGridDBImage[]> {
    const url = `${this.baseUrl}/grids/game/${gameId}`;
    
    try {
      const params = new URLSearchParams();
      params.append('types', 'static');
      if (styles) {
        params.append('styles', styles);
      }

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
   * Get icon images for a game
   */
  async getIconImages(gameId: number): Promise<SteamGridDBImage[]> {
    const url = `${this.baseUrl}/icons/game/${gameId}`;

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
      logger.error({ error, gameId }, 'Failed to fetch icon images');
      return [];
    }
  }

  /**
   * Search for a game by name (for non-Steam platforms like Xbox, PlayStation)
   * Uses the autocomplete search endpoint.
   * Returns the best (first) verified match or first result if none verified.
   */
  async searchGameByName(name: string): Promise<SteamGridDBGame | null> {
    const url = `${this.baseUrl}/search/autocomplete/${encodeURIComponent(name)}`;

    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });

      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`SteamGridDB search error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as any;
      const results: SteamGridDBGame[] = data.data || [];
      if (results.length === 0) return null;

      // Prefer verified entries, fall back to first result
      return results.find(g => g.verified) ?? results[0];
    } catch (error) {
      logger.warn({ error, name }, 'Failed to search SteamGridDB by name');
      return null;
    }
  }

  /**
   * Download and store the best grid image for a game identified only by name.
   * Used for non-Steam platforms (Xbox, PlayStation) where no Steam App ID is available.
   *
   * @param gameName  Display name of the game (used for SteamGridDB search)
   * @param platform  Platform identifier used in the storage path (e.g. 'xbox')
   * @param gameId    Unique game identifier used in the storage path (e.g. Xbox title ID)
   */
  async downloadGameImageByName(
    gameName: string,
    platform: string,
    gameId: string,
  ): Promise<string | null> {
    try {
      // Check for existing cached image
      const cached = imageStorage.checkLocalFile(platform, gameId, 'game', 'grid');
      if (cached) {
        logger.debug({ gameName, platform, gameId }, 'Grid image already cached for non-Steam game');
        return cached;
      }

      // Normalise the name before searching (handles CamelCase, all-caps, colons, etc.)
      const normalizedName = this.normalizeGameName(gameName);
      if (normalizedName !== gameName) {
        logger.debug({ original: gameName, normalized: normalizedName }, 'Normalized game name for SteamGridDB search');
      }

      // Try normalized name first, then fall back to original if nothing found
      let game = await this.searchGameByName(normalizedName);
      if (!game && normalizedName !== gameName) {
        game = await this.searchGameByName(gameName);
      }

      if (!game) {
        logger.warn({ gameName, normalizedName }, 'Game not found in SteamGridDB by name');
        return null;
      }

      // Try alternate style first, then all styles
      let images = await this.getGridImages(game.id, 'alternate');
      if (images.length === 0) {
        images = await this.getGridImages(game.id);
      }
      if (images.length === 0) return null;

      // Prefer portrait images, sort by score
      const portraitImages = images.filter(img => img.height > img.width);
      const pool: typeof images = portraitImages.length > 0 ? portraitImages : images;
      const best = pool.sort((a: SteamGridDBImage, b: SteamGridDBImage) => b.score - a.score)[0];

      const imagePath = await imageStorage.downloadAndStore(
        best.url,
        platform,
        gameId,
        'game',
        'grid',
      );

      logger.info({ gameName, platform, gameId, sgdbId: game.id }, 'Downloaded SteamGridDB image by name');
      return imagePath;
    } catch (error) {
      logger.warn({ error, gameName, platform, gameId }, 'Failed to download game image by name');
      return null;
    }
  }

  /**
   * Download and store the best grid image for a Steam game
   */
  async downloadGameImage(steamAppId: number): Promise<string | null> {
    try {
      // Check if grid image already exists (avoid unnecessary API calls)
      // The imageStorage creates files as: images/{platform}/{gameId}/{achievementId}_{imageType}.{ext}
      // For grid images: images/steam/{steamAppId}/game_grid.png (or .jpg)
      const gridDir = imageStorage.getAbsolutePath(`steam/${steamAppId}`);
      const fs = await import('fs');
      const path = await import('path');
      
      // Check for existing grid image with common extensions
      if (fs.existsSync(gridDir)) {
        const files = fs.readdirSync(gridDir);
        const existingGrid = files.find(f => f.startsWith('game_grid.'));
        if (existingGrid) {
          const cachedPath = path.join(`steam/${steamAppId}`, existingGrid);
          logger.debug({ steamAppId, cachedPath }, 'Grid image already cached, skipping API call');
          return cachedPath;
        }
      }

      // Search for game in SteamGridDB
      const game = await this.searchGameBySteamId(steamAppId);
      if (!game) {
        logger.warn({ steamAppId }, 'Game not found in SteamGridDB');
        return null;
      }

      // Try to get alternate style images first (cleaner, game-focused covers)
      let images = await this.getGridImages(game.id, 'alternate');
      let source = 'alternate style';
      
      // If no alternate images, get all styles
      if (images.length === 0) {
        logger.info({ steamAppId, sgdbId: game.id }, 'No alternate style images, trying all styles');
        images = await this.getGridImages(game.id);
        source = 'all styles';
      }
      
      if (images.length === 0) {
        logger.warn({ steamAppId, sgdbId: game.id }, 'No grid images found');
        return null;
      }

      // Filter to portrait images only (height > width)
      const portraitImages = images.filter(img => img.height > img.width);
      
      logger.info({
        steamAppId,
        sgdbId: game.id,
        source,
        totalImages: images.length,
        portraitImages: portraitImages.length,
        topImages: portraitImages.slice(0, 5).map(img => ({
          id: img.id,
          score: img.score,
          dimensions: `${img.width}x${img.height}`,
          style: img.style
        }))
      }, 'Available images');

      if (portraitImages.length === 0) {
        logger.warn({ steamAppId, sgdbId: game.id }, 'No portrait images found, using best landscape image');
        // Fall back to any image
        const sortedImages = images.sort((a, b) => b.score - a.score);
        const bestImage = sortedImages[0];
        
        const imagePath = await imageStorage.downloadAndStore(
          bestImage.url,
          'steam',
          steamAppId.toString(),
          'game',
          'grid'
        );

        logger.info({ 
          steamAppId, 
          sgdbId: game.id,
          source,
          imageId: bestImage.id,
          score: bestImage.score,
          dimensions: `${bestImage.width}x${bestImage.height}`,
          style: bestImage.style,
          imagePath 
        }, 'Downloaded SteamGridDB image (landscape fallback)');

        return imagePath;
      }

      // Sort portrait images by quality preferences
      const sortedImages = portraitImages.sort((a, b) => {
        // 1. Prefer higher score
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        
        // 2. Prefer 600x900 dimensions (ideal portrait size)
        const aIs600x900 = a.width === 600 && a.height === 900;
        const bIs600x900 = b.width === 600 && b.height === 900;
        if (aIs600x900 !== bIs600x900) {
          return aIs600x900 ? -1 : 1;
        }
        
        // 3. Prefer larger dimensions
        const aSize = a.width * a.height;
        const bSize = b.width * b.height;
        return bSize - aSize;
      });
      
      const bestImage = sortedImages[0];

      // Download and store the image
      const imagePath = await imageStorage.downloadAndStore(
        bestImage.url,
        'steam',
        steamAppId.toString(),
        'game',
        'grid'
      );

      logger.info({ 
        steamAppId, 
        sgdbId: game.id,
        source,
        imageId: bestImage.id,
        score: bestImage.score,
        dimensions: `${bestImage.width}x${bestImage.height}`,
        style: bestImage.style,
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

export async function createSteamGridDBAdapter(): Promise<SteamGridDBAdapter | null> {
  // SteamGridDB API key is configured in settings
  try {
    const key = await configService.getSetting('steamgrid_api_key');
    if (!key) {
      logger.debug('SteamGridDB API key not configured in settings, images from this source are disabled');
      return null;
    }
    return new SteamGridDBAdapter(key);
  } catch (error) {
    logger.debug({ error }, 'Failed to load SteamGridDB API key from settings');
    return null;
  }
}
