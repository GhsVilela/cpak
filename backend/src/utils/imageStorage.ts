import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import sharp from 'sharp';
import { logger } from './logger.js';

const execFileAsync = promisify(execFile);

const IMAGES_BASE_DIR = process.env.IMAGES_DIR || '/app/data/images';

export class ImageStorage {
  /**
   * Timestamp of the last Wikimedia download request.
   * Used to enforce a minimum 1.5 s gap between requests to avoid 429s.
   */
  private _lastWikimediaDownload = 0;
  private static readonly WIKIMEDIA_MIN_GAP_MS = 3_000;

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
    imageType: 'icon' | 'iconGray' | 'grid' | 'header' | 'capsule',
    /** Optional HTTP headers to include in the download request (e.g. Xbox Live auth) */
    headers?: Record<string, string>,
  ): Promise<string> {
    try {
      // Fast-path: check if ANY previously-saved version of this image already exists
      // (any extension) before doing any network I/O. This is especially important for
      // extension-less CDN URLs (e.g. Xbox: /image?url=...) where the URL-based pre-check
      // below would be skipped, causing unnecessary re-downloads every sync.
      const existingPath = this.checkLocalFile(platform, gameId, achievementId, imageType);
      if (existingPath) {
        logger.debug({ existingPath, platform, gameId, achievementId, imageType }, 'Image already cached locally, skipping download');
        return existingPath;
      }

      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      // Only treat the URL path extension as valid if it is a known image format.
      // CDN URLs like store-images.s-microsoft.com end in a GUID segment
      // (e.g. ".ed9482e8-90c6-4198-952b-9a084078cb92") which path.extname()
      // would otherwise extract as the extension, producing an unreadable
      // filename and bypassing Content-Type detection on every subsequent run.
      const rawUrlExt = path.extname(pathname).toLowerCase();
      const KNOWN_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);
      const urlExt = KNOWN_IMAGE_EXTS.has(rawUrlExt) ? rawUrlExt : '';

      // URLs without a path extension (e.g. Xbox image CDN: /image?url=...)
      // are still valid — we resolve the extension from Content-Type after fetching.
      if (pathname.endsWith('/')) {
        logger.debug({ url, platform, gameId, imageType }, 'Invalid image URL - ends with /');
        throw new Error('Image not available (invalid URL - ends with /)');
      }

      // Create directory structure: images/{platform}/{gameId}/
      const gameDir = path.join(IMAGES_BASE_DIR, platform, gameId);
      await fs.promises.mkdir(gameDir, { recursive: true });

      // If the URL has an extension we can pre-check the cache before fetching.
      if (urlExt) {
        const filename = `${this.sanitizeFilename(achievementId)}_${imageType}${urlExt}`;
        const filePath = path.join(gameDir, filename);
        if (fs.existsSync(filePath)) {
          const relativePath = this.getRelativePath(filePath);
          logger.debug({ filePath, relativePath, platform, gameId, imageType }, 'Image already exists, returning cached path');
          return relativePath;
        }
      }

      // Download the image with up to 3 attempts (exponential backoff).
      // Transient CDN errors (5xx, connection resets, timeouts) should not
      // exhaust a fallback source — a quick retry resolves them reliably.
      // 4xx errors (403/404) are terminal and thrown immediately without retry.
      const defaultHeaders: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      };
      const MAX_ATTEMPTS = 3;
      const RETRY_BASE_MS = 500;
      let response!: Response;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        let fetchErr: unknown;
        try {
          response = await fetch(url, {
            headers: { ...defaultHeaders, ...(headers ?? {}) },
            signal: AbortSignal.timeout(60_000),
          });
          if (response.ok) break;
          // Terminal client errors — no point retrying.
          if (response.status === 404) {
            logger.debug({ url, platform, gameId, imageType }, 'Image not found (404)');
            throw new Error('Image not found');
          }
          if (response.status === 403) {
            throw new Error('Image not found (403 Forbidden)');
          }
          // Rate-limit or server error — retry with backoff.
          if ((response.status === 429 || response.status >= 500) && attempt < MAX_ATTEMPTS) {
            logger.warn({ url, platform, gameId, imageType, status: response.status, attempt }, 'Transient download error — retrying');
          } else {
            throw new Error(`Failed to download image: ${response.statusText}`);
          }
        } catch (err) {
          const msg = (err as any)?.message ?? String(err);
          // Re-throw terminal errors immediately.
          if (msg.includes('Image not found') || msg.includes('403') || msg.includes('invalid URL')) throw err;
          if (attempt === MAX_ATTEMPTS) throw err;
          fetchErr = err;
          logger.warn({ url, platform, gameId, imageType, attempt, err: msg }, 'Fetch error — retrying');
        }
        if (fetchErr || !response.ok) {
          await new Promise((r) => setTimeout(r, RETRY_BASE_MS * 2 ** (attempt - 1)));
        }
      }

      // Determine extension: prefer URL path, fall back to Content-Type header.
      const contentType = response.headers.get('content-type') ?? '';
      let ext = urlExt ||
        (contentType.includes('png') ? '.png' :
         contentType.includes('jpeg') || contentType.includes('jpg') ? '.jpg' :
         contentType.includes('webp') ? '.webp' :
         contentType.includes('gif') ? '.gif' : '.png'); // default .png

      const buffer = await response.arrayBuffer();

      // Resize icon/iconGray images to 512×512 max and normalise to PNG.
      // Achievement icons from Xbox/PlayStation CDNs can be large (1–2 MB originals);
      // resizing here keeps storage uniform regardless of source CDN behaviour.
      const MAX_ICON_DIMENSION = 512;
      // Xbox achievement artwork: the icon is centered within a wide canvas
      // (typically 1920×1080). Center-crop to a square using min(w, h) — i.e. a
      // 1080×1080 region for a 1920×1080 source — so the icon fills the frame
      // with no portrait/landscape distortion, then resize down to 512×512.
      let fileBuffer: Buffer = Buffer.from(buffer) as Buffer;
      if (imageType === 'icon' || imageType === 'iconGray') {
        try {
          let sharpPipeline = sharp(fileBuffer);

          if (platform === 'xbox') {
            const meta = await sharpPipeline.metadata();
            const srcW = meta.width ?? 0;
            const srcH = meta.height ?? 0;
            const side = Math.min(srcW, srcH);
            if (side > 0) {
              sharpPipeline = sharpPipeline.extract({
                left: Math.floor((srcW - side) / 2),
                top: Math.floor((srcH - side) / 2),
                width: side,
                height: side,
              });
            }
          }

          fileBuffer = await sharpPipeline
            .resize(MAX_ICON_DIMENSION, MAX_ICON_DIMENSION, { fit: 'inside', withoutEnlargement: true })
            .png()
            .toBuffer();
          ext = '.png'; // output is always PNG after resize
        } catch (resizeErr) {
          logger.warn({ url, platform, gameId, achievementId, imageType, err: String(resizeErr) }, 'Failed to resize icon image, storing original');
        }
      }

      // Resize grid images to the standard 600×900 cover art size and normalise
      // to JPEG. Sources like PCGamingWiki can return originals up to 3000×4000+
      // (6+ MB); resizing here keeps storage and load times consistent.
      // Skip the resize step (but still normalise to JPEG) when the source is
      // already 600×900 — re-encoding an identically-sized image wastes CPU and
      // introduces unnecessary quality loss.
      if (imageType === 'grid') {
        try {
          const gridMeta = await sharp(fileBuffer).metadata();
          const alreadyCorrectSize = gridMeta.width === 600 && gridMeta.height === 900;
          const alreadyJpeg = gridMeta.format === 'jpeg';

          if (alreadyCorrectSize && alreadyJpeg) {
            // Already 600×900 JPEG — nothing to do.
            ext = '.jpg';
          } else {
            let pipeline = sharp(fileBuffer);
            if (!alreadyCorrectSize) {
              pipeline = pipeline.resize(600, 900, { fit: 'cover', position: 'centre' });
            }
            fileBuffer = await pipeline.jpeg({ quality: 90 }).toBuffer();
            ext = '.jpg';
          }
        } catch (resizeErr) {
          logger.warn({ url, platform, gameId, imageType, err: String(resizeErr) }, 'Failed to resize grid image, storing original');
        }
      }

      // Generate filename: {achievementId}_{imageType}.{ext}
      const filename = `${this.sanitizeFilename(achievementId)}_${imageType}${ext}`;
      const filePath = path.join(gameDir, filename);

      // Check if file already exists (for the extension-less URL path, checked here after fetch)
      if (fs.existsSync(filePath)) {
        const relativePath = this.getRelativePath(filePath);
        logger.debug({ filePath, relativePath, platform, gameId, imageType }, 'Image already exists, returning cached path');
        return relativePath;
      }

      await fs.promises.writeFile(filePath, fileBuffer);

      const relativePath = this.getRelativePath(filePath);
      logger.debug({ url, filePath, relativePath }, 'Image downloaded and stored');
      return relativePath;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      // If the URL carried MS CDN size params (?w=...&h=...) and the download failed,
      // retry once without those params — some CDN edges don't honour resize params
      // and return a 4xx/empty body for the sized URL while serving the original fine.
      const strippedUrl = this.stripMSCDNSizeParams(url);
      if (strippedUrl !== url) {
        logger.warn({ url, strippedUrl, platform, gameId, imageType }, 'MS CDN sized URL failed — retrying without size params');
        return this.downloadAndStore(strippedUrl, platform, gameId, achievementId, imageType, headers);
      }

      // Transient network failures ("fetch failed", ECONNRESET, ETIMEDOUT, etc.)
      // are not actionable per-image — log at WARN, not ERROR.
      const isNetworkError = errorMessage.includes('fetch failed') ||
        errorMessage.includes('ECONNRESET') ||
        errorMessage.includes('ETIMEDOUT') ||
        errorMessage.includes('ENOTFOUND') ||
        errorMessage.includes('socket hang up') ||
        errorMessage.includes('aborted') ||
        errorMessage.includes('timed out') ||
        errorMessage.includes('timeout');

      // Don't log full error for common issues (404s, invalid URLs), just debug
      if (errorMessage.includes('not found') || errorMessage.includes('Not Found') || errorMessage.includes('not available')) {
        logger.debug({ url, platform, gameId, imageType }, 'Image not available');
      } else if (isNetworkError) {
        logger.warn({ url, platform, gameId, imageType, error: errorMessage }, 'Image download failed (network error, will retry on next sync)');
      } else {
        logger.error({ error: errorMessage, stack: errorStack, url, platform, gameId, imageType }, 'Failed to download image');
      }
      throw error;
    }
  }

  /**
   * Download an image using the system `wget` binary and store it locally.
   *
   * Use this instead of `downloadAndStore` when the target CDN blocks Node.js's
   * TLS fingerprint (JA3) but allows wget — e.g. images.pcgamingwiki.com behind
   * Cloudflare bot-protection.
   */
  async downloadAndStoreViaWget(
    url: string,
    platform: string,
    gameId: string,
    achievementId: string,
    imageType: 'icon' | 'iconGray' | 'grid' | 'header' | 'capsule',
  ): Promise<string | undefined> {
    // Cache hit — no download needed.
    const cached = this.checkLocalFile(platform, gameId, achievementId, imageType);
    if (cached) return cached;

    // Rate-limit Wikimedia downloads to avoid 429s.
    const isWikimedia = url.includes('wikimedia.org') || url.includes('wikipedia.org');
    if (isWikimedia) {
      const elapsed = Date.now() - this._lastWikimediaDownload;
      if (elapsed < ImageStorage.WIKIMEDIA_MIN_GAP_MS) {
        await new Promise((r) => setTimeout(r, ImageStorage.WIKIMEDIA_MIN_GAP_MS - elapsed));
      }
      this._lastWikimediaDownload = Date.now();
    }

    const gameDir = path.join(IMAGES_BASE_DIR, platform, gameId);
    await fs.promises.mkdir(gameDir, { recursive: true });

    // Determine extension from URL, defaulting to .jpg.
    const rawExt = path.extname(new URL(url).pathname).toLowerCase();
    const KNOWN = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
    const ext = KNOWN.has(rawExt) ? rawExt : '.jpg';

    const initFilename = `${this.sanitizeFilename(achievementId)}_${imageType}${ext}`;
    let destPath = path.join(gameDir, initFilename);

    try {
      // -q: quiet, -O: write to file, -T: timeout (supported by both GNU and BusyBox wget).
      // User-Agent handling:
      // - Wikimedia (upload.wikimedia.org) REQUIRES a proper UA; bare "Wget/x.y" gets 429.
      // - PCGW CDN REJECTS browser UAs via Cloudflare; must use default "Wget/x.y".
      // Only override UA for Wikimedia domains.
      //
      // Retry up to 3 times on transient server errors (5xx) or 429 (rate limit).
      // Other 4xx errors (403, 404) are terminal and thrown immediately.
      const MAX_WGET_ATTEMPTS = 3;
      const WGET_RETRY_BASE_MS = 2_000;
      // image.xboxlive.com uses a legacy TLS certificate that fails verification
      // in modern TLS stacks (both Node.js and wget). Browsers show an "insecure"
      // warning but still serve the content. Scoped only to that host.
      const skipCertCheck = url.includes('image.xboxlive.com');
      const wgetBaseArgs = [
        '-q', '-T', '60',
        ...(skipCertCheck ? ['--no-check-certificate'] : []),
        ...(isWikimedia ? ['--user-agent', 'cpak/1.0 (game-image-lookup; contact via GitHub)'] : []),
      ];
      let wgetErr: unknown;
      for (let attempt = 1; attempt <= MAX_WGET_ATTEMPTS; attempt++) {
        try {
          await execFileAsync('wget', [...wgetBaseArgs, '-O', destPath, url]);
          wgetErr = undefined;
          break;
        } catch (err) {
          const msg = String(err);
          const is5xx = /HTTP\/[\d.]+ 5\d\d/.test(msg);
          const is429 = /HTTP\/[\d.]+ 429/.test(msg);
          const isTimeout = msg.includes('download timed out') || msg.includes('timed out');
          const isRetryable = is5xx || is429 || isTimeout;
          if (!isRetryable || attempt === MAX_WGET_ATTEMPTS) {
            wgetErr = err;
            break;
          }
          // Clean up partial file before retry.
          fs.rmSync(destPath, { force: true });
          // Use longer backoff for 429 rate limits (3s base vs 2s).
          const retryBase = is429 ? 3_000 : WGET_RETRY_BASE_MS;
          logger.warn({ url, platform, gameId, imageType, attempt, err: msg }, `[wget] ${is429 ? 'Rate limited (429)' : isTimeout ? 'Timeout' : 'Server error (5xx)'} — retrying`);
          await new Promise((r) => setTimeout(r, retryBase * 2 ** (attempt - 1)));
        }
      }
      if (wgetErr) throw wgetErr;

      if (!fs.existsSync(destPath) || fs.statSync(destPath).size === 0) {
        logger.warn({ url, platform, gameId, imageType }, '[wget] Downloaded file is empty or missing');
        fs.rmSync(destPath, { force: true });
        // Fallback: retry without MS CDN size params if they were present.
        const strippedUrl = this.stripMSCDNSizeParams(url);
        if (strippedUrl !== url) {
          logger.warn({ url, strippedUrl, platform, gameId, imageType }, '[wget] Retrying without MS CDN size params');
          return this.downloadAndStoreViaWget(strippedUrl, platform, gameId, achievementId, imageType);
        }
        return undefined;
      }

      // Resize grid images to 600×900 — same standard as downloadAndStore.
      if (imageType === 'grid') {
        try {
          const raw = await fs.promises.readFile(destPath);
          const resized = await sharp(raw)
            .resize(600, 900, { fit: 'cover', position: 'centre' })
            .jpeg({ quality: 90 })
            .toBuffer();
          fs.rmSync(destPath, { force: true });
          destPath = path.join(gameDir, `${this.sanitizeFilename(achievementId)}_${imageType}.jpg`);
          await fs.promises.writeFile(destPath, resized);
        } catch (resizeErr) {
          logger.warn({ url, platform, gameId, imageType, err: String(resizeErr) }, '[wget] Failed to resize grid image, keeping original');
        }
      }

      const relativePath = this.getRelativePath(destPath);
      logger.debug({ url, platform, gameId, imageType, relativePath }, '[wget] Image downloaded successfully');
      return relativePath;
    } catch (err) {
      // Clean up partial file if wget failed.
      fs.rmSync(destPath, { force: true });
      logger.warn({ url, platform, gameId, imageType, err: String(err) }, '[wget] Download failed');
      // Fallback: retry without MS CDN size params if they were present.
      const strippedUrl = this.stripMSCDNSizeParams(url);
      if (strippedUrl !== url) {
        logger.warn({ url, strippedUrl, platform, gameId, imageType }, '[wget] Retrying without MS CDN size params');
        return this.downloadAndStoreViaWget(strippedUrl, platform, gameId, achievementId, imageType);
      }
      return undefined;
    }
  }

  /**
   * Strip `w` and `h` query params from a Microsoft CDN URL so the original
   * (un-resized) image is fetched. Returns the same string if no such params
   * are present, making it safe to use as a "changed?" guard.
   */
  private stripMSCDNSizeParams(url: string): string {
    try {
      const u = new URL(url);
      if (!u.searchParams.has('w') && !u.searchParams.has('h')) return url;
      u.searchParams.delete('w');
      u.searchParams.delete('h');
      return u.toString();
    } catch {
      return url;
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
    const gameDir = path.join(IMAGES_BASE_DIR, platform, gameId);
    // Directory may not exist yet (first sync)
    if (!fs.existsSync(gameDir)) return undefined;

    const baseFilename = `${this.sanitizeFilename(achievementId)}_${imageType}`;

    // Scan the directory for any file whose name starts with baseFilename.
    // Using readdirSync instead of a fixed extension list handles:
    //  - Standard images: game_grid.jpg, game_grid.png, etc.
    //  - CDN files saved with a GUID "extension" from URL path segments
    //    (e.g. game_grid.ed9482e8-90c6-4198-952b-9a084078cb92)
    //  - Any future format without a separate code change.
    try {
      const entries = fs.readdirSync(gameDir);
      const match = entries.find((e) => e === baseFilename || e.startsWith(`${baseFilename}.`));
      if (match) {
        return this.getRelativePath(path.join(gameDir, match));
      }
    } catch {
      // readdirSync can throw if permissions change between the existsSync check
      // and the read — treat as cache-miss so the download chain continues.
    }

    return undefined;
  }
}

export const imageStorage = new ImageStorage();
