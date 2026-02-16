import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { logger } from './logger.js';

const IMAGES_BASE_DIR = process.env.IMAGES_DIR || '/app/data/images';

export class ImageStorage {
  /**
   * Download an image from a URL and store it locally
   * @param url - The URL of the image to download
   * @param platform - The platform (steam, xbox, playstation)
   * @param gameId - The game identifier
   * @param achievementId - The achievement identifier (or 'game' for game images)
   * @param imageType - Image type: 'icon', 'iconGray', 'grid', 'header', 'capsule'
   * @returns The relative path to the stored image
   */
  async downloadAndStore(
    url: string,
    platform: string,
    gameId: string,
    achievementId: string,
    imageType: 'icon' | 'iconGray' | 'grid' | 'header' | 'capsule'
  ): Promise<string> {
    try {
      // Validate URL - must have a file extension (not just a directory path)
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const ext = path.extname(pathname);
      
      if (!ext || pathname.endsWith('/')) {
        logger.debug({ url, platform, gameId, imageType }, 'Invalid image URL - no file extension or ends with /');
        throw new Error('Image not available (invalid URL - missing file)');
      }

      // Create directory structure: images/{platform}/{gameId}/
      const gameDir = path.join(IMAGES_BASE_DIR, platform, gameId);
      await fs.promises.mkdir(gameDir, { recursive: true });

      // Generate filename: {achievementId}_{imageType}.{ext}
      const filename = `${this.sanitizeFilename(achievementId)}_${imageType}${ext}`;
      const filePath = path.join(gameDir, filename);

      // Check if file already exists
      if (fs.existsSync(filePath)) {
        const relativePath = this.getRelativePath(filePath);
        logger.debug({ filePath, relativePath, platform, gameId, imageType }, 'Image already exists, returning cached path');
        return relativePath;
      }

      // Download the image
      const response = await fetch(url);
      if (!response.ok) {
        if (response.status === 404) {
          logger.debug({ url, platform, gameId, imageType }, 'Image not found (404)');
          throw new Error('Image not found');
        }
        throw new Error(`Failed to download image: ${response.statusText}`);
      }

      const buffer = await response.arrayBuffer();
      await fs.promises.writeFile(filePath, Buffer.from(buffer));

      const relativePath = this.getRelativePath(filePath);
      logger.debug({ url, filePath, relativePath }, 'Image downloaded and stored');
      return relativePath;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      // Don't log full error for common issues (404s, invalid URLs), just debug
      if (errorMessage.includes('not found') || errorMessage.includes('Not Found') || errorMessage.includes('not available')) {
        logger.debug({ url, platform, gameId, imageType }, 'Image not available');
      } else {
        logger.error({ error: errorMessage, stack: errorStack, url, platform, gameId, imageType }, 'Failed to download image');
      }
      throw error;
    }
  }

  /**
   * Get the relative path from the base images directory
   */
  private getRelativePath(absolutePath: string): string {
    // Ensure forward slashes for cross-platform compatibility
    return path.relative(IMAGES_BASE_DIR, absolutePath).replace(/\\/g, '/');
  }

  /**
   * Sanitize a filename to remove invalid characters
   */
  private sanitizeFilename(filename: string): string {
    return filename.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  /**
   * Get the absolute path for serving an image
   */
  getAbsolutePath(relativePath: string): string {
    return path.join(IMAGES_BASE_DIR, relativePath);
  }

  /**
   * Check if an image file exists
   */
  exists(relativePath: string): boolean {
    const absolutePath = this.getAbsolutePath(relativePath);
    return fs.existsSync(absolutePath);
  }

  /**
   * Check if a local file exists and return its relative path
   * @param platform - The platform (steam, xbox, playstation)
   * @param gameId - The game identifier
   * @param achievementId - The achievement identifier (or 'game' for game images)
   * @param imageType - Image type: 'icon', 'iconGray', 'grid', 'header', 'capsule'
   * @returns The relative path if file exists, undefined otherwise
   */
  checkLocalFile(
    platform: string,
    gameId: string,
    achievementId: string,
    imageType: 'icon' | 'iconGray' | 'grid' | 'header' | 'capsule'
  ): string | undefined {
    // Generate the expected filename and path
    const gameDir = path.join(IMAGES_BASE_DIR, platform, gameId);
    const baseFilename = `${this.sanitizeFilename(achievementId)}_${imageType}`;
    
    // Check for multiple possible extensions
    const extensions = ['.jpg', '.png', '.jpeg'];
    for (const ext of extensions) {
      const filePath = path.join(gameDir, baseFilename + ext);
      if (fs.existsSync(filePath)) {
        return this.getRelativePath(filePath);
      }
    }

    return undefined;
  }
}

export const imageStorage = new ImageStorage();
