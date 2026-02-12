import { logger } from '../utils/logger.js';

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  retryAfterMs: number;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class RateLimiterService {
  private limits: Map<string, RateLimitEntry> = new Map();
  private platformConfigs: Record<string, RateLimitConfig> = {
    steam: {
      maxRequests: parseInt(process.env.STEAM_RATE_LIMIT || '100', 10),
      windowMs: 60000, // 1 minute
      retryAfterMs: parseInt(process.env.STEAM_RETRY_DELAY || '200', 10),
    },
    'steam-store': {
      maxRequests: parseInt(process.env.STEAM_STORE_RATE_LIMIT || '200', 10),
      windowMs: 60000, // 1 minute (Steam Store API is more permissive)
      retryAfterMs: 100,
    },
    xbox: {
      maxRequests: parseInt(process.env.XBOX_RATE_LIMIT || '60', 10),
      windowMs: 60000,
      retryAfterMs: 1000,
    },
    playstation: {
      maxRequests: parseInt(process.env.PS_RATE_LIMIT || '60', 10),
      windowMs: 60000,
      retryAfterMs: 1000,
    },
  };

  /**
   * Check if request is allowed under rate limit
   */
  canMakeRequest(platform: string, identifier: string = 'default'): boolean {
    const key = `${platform}:${identifier}`;
    const config = this.platformConfigs[platform];

    if (!config) {
      logger.warn(`[RateLimiter] No config for platform: ${platform}`);
      return true;
    }

    const now = Date.now();
    const entry = this.limits.get(key);

    if (!entry || now >= entry.resetTime) {
      // Reset or create new window
      this.limits.set(key, {
        count: 1,
        resetTime: now + config.windowMs,
      });
      return true;
    }

    if (entry.count < config.maxRequests) {
      entry.count++;
      return true;
    }

    // Rate limit exceeded
    return false;
  }

  /**
   * Get retry delay for platform
   */
  getRetryDelay(platform: string): number {
    return this.platformConfigs[platform]?.retryAfterMs || 1000;
  }

  /**
   * Wait for rate limit delay
   */
  async waitForDelay(platform: string): Promise<void> {
    const delay = this.getRetryDelay(platform);
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * Execute function with rate limiting and retry logic
   */
  async executeWithRetry<T>(
    platform: string,
    fn: () => Promise<T>,
    identifier: string = 'default',
    maxRetries: number = 3
  ): Promise<T> {
    let attempt = 0;

    while (attempt < maxRetries) {
      if (this.canMakeRequest(platform, identifier)) {
        try {
          return await fn();
        } catch (error) {
          // Check if error is retryable (e.g., 429 Too Many Requests)
          if (this.isRetryableError(error)) {
            attempt++;
            if (attempt < maxRetries) {
              logger.warn(
                `[RateLimiter] Retryable error for ${platform}, attempt ${attempt}/${maxRetries}`
              );
              await this.waitForDelay(platform);
              continue;
            }
          }
          throw error;
        }
      } else {
        // Rate limit exceeded, wait and retry
        attempt++;
        if (attempt < maxRetries) {
          logger.warn(
            `[RateLimiter] Rate limit exceeded for ${platform}, waiting...`
          );
          await this.waitForDelay(platform);
          continue;
        }
        throw new Error(`Rate limit exceeded for ${platform} after ${maxRetries} attempts`);
      }
    }

    throw new Error(`Failed after ${maxRetries} attempts for ${platform}`);
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      // Common retryable errors
      if (
        message.includes('429') ||
        message.includes('too many requests') ||
        message.includes('rate limit') ||
        message.includes('timeout') ||
        message.includes('econnreset') ||
        message.includes('enotfound')
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Clear all rate limits (useful for testing)
   */
  clearLimits(): void {
    this.limits.clear();
  }

  /**
   * Get current rate limit status for platform
   */
  getStatus(platform: string, identifier: string = 'default'): {
    remaining: number;
    resetTime: number | null;
  } {
    const key = `${platform}:${identifier}`;
    const config = this.platformConfigs[platform];
    const entry = this.limits.get(key);

    if (!config) {
      return { remaining: 0, resetTime: null };
    }

    if (!entry || Date.now() >= entry.resetTime) {
      return { remaining: config.maxRequests, resetTime: null };
    }

    return {
      remaining: Math.max(0, config.maxRequests - entry.count),
      resetTime: entry.resetTime,
    };
  }
}

export const rateLimiter = new RateLimiterService();
