import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { logger } from './logger.js';

const ICONS_BASE_DIR = process.env.ICONS_DIR || './data/icons';

export class IconStorage {
  /**
   * Download an icon from a URL and store it locally
   * @param url - The URL of the icon to download
   * @param platform - The platform (steam, xbox, playstation)
   * @param gameId - The game identifier
   * @param achievementId - The achievement identifier (or 'game' for game images)
   * @param iconType - Either 'icon', 'iconGray', or 'grid' for game grid images
   * @returns The relative path to the stored icon
   */
  async downloadAndStore(
    url: string,
    platform: string,
    gameId: string,
    achievementId: string,
    iconType: 'icon' | 'iconGray' | 'grid'
  ): Promise<string> {
    try {
      // Create directory structure: icons/{platform}/{gameId}/
      const gameDir = path.join(ICONS_BASE_DIR, platform, gameId);
      await fs.promises.mkdir(gameDir, { recursive: true });

      // Generate filename: {achievementId}_{iconType}.{ext}
      const urlObj = new URL(url);
      const ext = path.extname(urlObj.pathname) || '.jpg';
      const filename = `${this.sanitizeFilename(achievementId)}_${iconType}${ext}`;
      const filePath = path.join(gameDir, filename);

      // Check if file already exists
      if (fs.existsSync(filePath)) {
        logger.debug({ filePath }, 'Image already exists, skipping download');
        return this.getRelativePath(filePath);
      }

      // Download the icon
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download icon: ${response.statusText}`);
      }

      const buffer = await response.arrayBuffer();
      await fs.promises.writeFile(filePath, Buffer.from(buffer));

      logger.debug({ url, filePath }, 'Icon downloaded and stored');
      return this.getRelativePath(filePath);
    } catch (error) {
      logger.error({ error, url }, 'Failed to download icon');
      throw error;
    }
  }

  /**
   * Get the relative path from the base icons directory
   */
  private getRelativePath(absolutePath: string): string {
    return path.relative(ICONS_BASE_DIR, absolutePath);
  }

  /**
   * Sanitize a filename to remove invalid characters
   */
  private sanitizeFilename(filename: string): string {
    return filename.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  /**
   * Get the absolute path for serving an icon
   */
  getAbsolutePath(relativePath: string): string {
    return path.join(ICONS_BASE_DIR, relativePath);
  }

  /**
   * Check if an icon file exists
   */
  exists(relativePath: string): boolean {
    const absolutePath = this.getAbsolutePath(relativePath);
    return fs.existsSync(absolutePath);
  }
}

export const iconStorage = new IconStorage();
