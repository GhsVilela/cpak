import { logger } from '../../utils/logger.js';
import { imageStorage } from '../../utils/imageStorage.js';
import { configService } from '../configService.js';

interface IGDBGame {
  id: number;
  name: string;
  cover?: { id: number; image_id: string };
  artworks?: Array<{ id: number; image_id: string }>;
}

/**
 * IGDB Adapter — fetches game cover art and artwork via the IGDB API (Twitch).
 *
 * Requires a free Twitch application (Client ID + Client Secret) registered at
 * https://dev.twitch.tv/console/apps. Uses the OAuth2 client_credentials grant
 * to obtain an access token, which is cached in-memory until expiry.
 */
export class IGDBAdapter {
  private clientId: string;
  private clientSecret: string;
  private accessToken: string | null = null;
  private tokenExpiry = 0;

  constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  /**
   * Obtain (or reuse) an OAuth2 access token from the Twitch identity endpoint.
   */
  private async authenticate(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const url = new URL('https://id.twitch.tv/oauth2/token');
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('client_secret', this.clientSecret);
    url.searchParams.set('grant_type', 'client_credentials');

    const response = await fetch(url.toString(), { method: 'POST' });
    if (!response.ok) {
      throw new Error(`IGDB auth failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { access_token: string; expires_in: number };
    this.accessToken = data.access_token;
    // Refresh 60 s before actual expiry to avoid edge-case failures
    this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return this.accessToken;
  }

  /**
   * Send a request to the IGDB API v4 (Apicalypse query language).
   * Auto-refreshes the token on 401.
   */
  private async apiRequest<T>(endpoint: string, body: string, retry = true): Promise<T[]> {
    const token = await this.authenticate();
    const response = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
      method: 'POST',
      headers: {
        'Client-ID': this.clientId,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'text/plain',
      },
      body,
    });

    if (response.status === 401 && retry) {
      this.accessToken = null;
      this.tokenExpiry = 0;
      return this.apiRequest<T>(endpoint, body, false);
    }

    if (!response.ok) {
      throw new Error(`IGDB API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T[]>;
  }

  /**
   * Search for a game by name. Returns the best match with cover and artwork refs.
   */
  async searchGame(name: string): Promise<IGDBGame | null> {
    try {
      // Escape double quotes in game name for the Apicalypse query
      const safeName = name.replace(/"/g, '\\"');
      const results = await this.apiRequest<IGDBGame>(
        'games',
        `search "${safeName}"; fields name,cover.image_id,artworks.image_id; limit 5;`,
      );
      if (results.length === 0) return null;

      // Prefer exact match (case-insensitive), fall back to first result
      const lower = name.toLowerCase();
      return results.find((g) => g.name.toLowerCase() === lower) ?? results[0];
    } catch (error) {
      logger.warn({ error, name }, 'IGDB game search failed');
      return null;
    }
  }

  /**
   * Build a cover image URL from an IGDB game record.
   * Uses `t_cover_big_2x` size (528×748) — ideal for grid/capsule art.
   */
  getCoverUrl(game: IGDBGame): string | null {
    if (!game.cover?.image_id) return null;
    return `https://images.igdb.com/igdb/image/upload/t_cover_big_2x/${game.cover.image_id}.jpg`;
  }

  /**
   * Get an artwork (screenshot/promotional) URL for hero images.
   * Uses `t_1080p` size (1920×1080).
   */
  getArtworkUrl(game: IGDBGame): string | null {
    if (!game.artworks || game.artworks.length === 0) return null;
    const art = game.artworks[0];
    return `https://images.igdb.com/igdb/image/upload/t_1080p/${art.image_id}.jpg`;
  }

  /**
   * Search for a game and download its cover as a grid image.
   */
  async downloadGameImage(
    gameName: string,
    platform: string,
    gameId: string,
  ): Promise<string | null> {
    try {
      const cached = imageStorage.checkLocalFile(platform, gameId, 'game', 'grid');
      if (cached) return cached;

      const game = await this.searchGame(gameName);
      if (!game) return null;

      const coverUrl = this.getCoverUrl(game);
      if (!coverUrl) {
        logger.debug({ gameName, igdbId: game.id }, 'IGDB game has no cover image');
        return null;
      }

      const imagePath = await imageStorage.downloadAndStore(
        coverUrl, platform, gameId, 'game', 'grid',
      );

      logger.info({ gameName, platform, gameId, igdbId: game.id }, 'Downloaded IGDB cover image');
      return imagePath;
    } catch (error) {
      logger.warn({ error, gameName, platform, gameId }, 'IGDB cover download failed');
      return null;
    }
  }

  /**
   * Search for a game and download its artwork as a hero image.
   */
  async downloadHeroImage(
    gameName: string,
    platform: string,
    gameId: string,
  ): Promise<string | null> {
    try {
      const cached = imageStorage.checkLocalFile(platform, gameId, 'game', 'hero');
      if (cached) return cached;

      const game = await this.searchGame(gameName);
      if (!game) return null;

      const artworkUrl = this.getArtworkUrl(game);
      if (!artworkUrl) {
        logger.debug({ gameName, igdbId: game.id }, 'IGDB game has no artwork');
        return null;
      }

      const imagePath = await imageStorage.downloadAndStore(
        artworkUrl, platform, gameId, 'game', 'hero',
      );

      logger.info({ gameName, platform, gameId, igdbId: game.id }, 'Downloaded IGDB hero image');
      return imagePath;
    } catch (error) {
      logger.warn({ error, gameName, platform, gameId }, 'IGDB hero download failed');
      return null;
    }
  }
}

/**
 * Factory: create an IGDBAdapter if credentials are configured, otherwise null.
 */
export async function createIGDBAdapter(): Promise<IGDBAdapter | null> {
  try {
    const clientId = await configService.getSetting('igdb_client_id');
    const clientSecret = await configService.getSetting('igdb_client_secret');
    if (!clientId || !clientSecret) {
      logger.debug('IGDB credentials not configured in settings, images from this source are disabled');
      return null;
    }
    return new IGDBAdapter(clientId, clientSecret);
  } catch (error) {
    logger.debug({ error }, 'Failed to load IGDB credentials from settings');
    return null;
  }
}
