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
      maxRequests: parseInt(process.env.STEAM_RATE_LIMIT || '300', 10),
      windowMs: 60000, // 1 minute
      retryAfterMs: parseInt(process.env.STEAM_RETRY_DELAY || '1000', 10),
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
   * Check if request is allowed under rate limit.
   * Uses platform-level aggregate tracking to enforce global rate limits.
   */
  canMakeRequest(platform: string, _identifier: string = 'default'): boolean {
    const key = platform;
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
    const baseDelay = this.getRetryDelay(platform);

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if (this.isRetryableError(error) && attempt + 1 < maxRetries) {
          // Exponential backoff: baseDelay * 2^attempt (1s, 2s, 4s …)
          const delay = baseDelay * Math.pow(2, attempt);
          logger.warn(
            `[RateLimiter] Retryable error for ${platform}, attempt ${attempt + 1}/${maxRetries}, backoff ${delay}ms`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw error;
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
        message.includes('enotfound') ||
        message.includes('500') ||
        message.includes('502') ||
        message.includes('503') ||
        message.includes('504')
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
  getStatus(platform: string, _identifier: string = 'default'): {
    remaining: number;
    resetTime: number | null;
  } {
    const key = platform;
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
