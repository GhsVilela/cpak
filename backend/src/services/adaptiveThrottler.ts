import { logger } from '../utils/logger.js';

/**
 * Adaptive Throttler
 * 
 * Implements adaptive delay between batch operations to prevent API overload.
 * Adjusts delay duration based on recent response times.
 * 
 * Algorithm:
 * - Base delay range: 250-500ms
 * - If last response > 750ms: Use longer delay (500ms)
 * - If last response < 250ms: Use shorter delay (250ms)
 * - Gradual adjustment based on response time trends
 */
export class AdaptiveThrottler {
  private readonly minDelay = 250; // ms
  private readonly maxDelay = 500; // ms
  private currentDelay: number;
  
  constructor() {
    this.currentDelay = this.minDelay;
    logger.debug({
      minDelay: this.minDelay,
      maxDelay: this.maxDelay,
      initialDelay: this.currentDelay,
    }, 'AdaptiveThrottler initialized');
  }
  
  /**
   * Calculate delay duration based on last batch response time
   * 
   * @param lastResponseTime - Time taken to process last batch (in milliseconds)
   * @returns Delay duration in milliseconds
   */
  calculateDelay(lastResponseTime: number): number {
    const previousDelay = this.currentDelay;
    
    if (lastResponseTime > 750) {
      // Response was slow: increase delay to give system time to recover
      this.currentDelay = this.maxDelay;
    } else if (lastResponseTime < 250) {
      // Response was fast: decrease delay to maintain throughput
      this.currentDelay = this.minDelay;
    } else {
      // Response time in acceptable range: interpolate delay
      // Linear interpolation between minDelay and maxDelay based on response time
      // 250ms -> minDelay, 750ms -> maxDelay
      const normalizedTime = (lastResponseTime - 250) / (750 - 250);
      this.currentDelay = Math.round(
        this.minDelay + (this.maxDelay - this.minDelay) * normalizedTime
      );
    }
    
    if (this.currentDelay !== previousDelay) {
      logger.debug({
        lastResponseTime,
        previousDelay,
        newDelay: this.currentDelay,
      }, 'Throttle delay adjusted');
    }
    
    return this.currentDelay;
  }
  
  /**
   * Wait for the calculated delay duration
   * 
   * @param lastResponseTime - Time taken to process last batch (in milliseconds)
   */
  async throttle(lastResponseTime: number): Promise<void> {
    const delay = this.calculateDelay(lastResponseTime);
    
    logger.debug({ delay, lastResponseTime }, 'Throttling before next batch');
    
    return new Promise((resolve) => {
      setTimeout(resolve, delay);
    });
  }
  
  /**
   * Get current delay value
   */
  getCurrentDelay(): number {
    return this.currentDelay;
  }
  
  /**
   * Get throttler statistics
   */
  getStats() {
    return {
      currentDelay: this.currentDelay,
      minDelay: this.minDelay,
      maxDelay: this.maxDelay,
    };
  }
  
  /**
   * Reset throttler to initial state
   */
  reset(): void {
    this.currentDelay = this.minDelay;
    logger.debug('AdaptiveThrottler reset to initial state');
  }
}
