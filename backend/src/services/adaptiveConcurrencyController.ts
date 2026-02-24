import pLimit, { LimitFunction } from 'p-limit';
import { logger } from '../utils/logger.js';

/**
 * Adaptive Concurrency Controller
 * 
 * Dynamically adjusts the maximum number of concurrent operations based on API performance.
 * Uses p-limit to enforce concurrency limits with adaptive adjustment.
 * 
 * Algorithm:
 * - Starts at user-configured maximum concurrency
 * - If operations take > 2000ms: Reduce concurrency by 1
 * - If operations take < 500ms: Increase concurrency by 1
 * - Never exceed user-configured maximum (backwards compatible)
 * - Never go below minimum of 1
 * 
 * Target: Keep API response times under 2s
 */
export class AdaptiveConcurrencyController {
  private currentConcurrency: number;
  private readonly minConcurrency = 1;
  private readonly maxConcurrency: number;
  private limiter: LimitFunction;
  private recentOperationTimes: number[] = [];
  private readonly windowSize = 10; // Track last 10 operations
  private readonly slowThreshold = 2000; // ms - reduce concurrency if exceeded
  private readonly fastThreshold = 500; // ms - increase concurrency if under
  
  /**
   * @param userConfiguredMax - Maximum concurrency from user settings
   */
  constructor(userConfiguredMax: number) {
    this.maxConcurrency = Math.max(userConfiguredMax, this.minConcurrency);
    this.currentConcurrency = this.maxConcurrency;
    this.limiter = pLimit(this.currentConcurrency);
    
    logger.debug({
      initialConcurrency: this.currentConcurrency,
      maxConcurrency: this.maxConcurrency,
      minConcurrency: this.minConcurrency,
    }, 'AdaptiveConcurrencyController initialized');
  }
  
  /**
   * Execute an operation with adaptive concurrency control
   * 
   * @param operation - Async function to execute with concurrency control
   * @returns Operation result
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    const start = Date.now();
    
    try {
      const result = await this.limiter(operation);
      const duration = Date.now() - start;
      
      // Track operation duration for adaptive adjustment
      this.recordOperationTime(duration);
      
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.recordOperationTime(duration);
      throw error;
    }
  }
  
  /**
   * Record operation time and adjust concurrency if needed
   */
  private recordOperationTime(duration: number): void {
    this.recentOperationTimes.push(duration);
    if (this.recentOperationTimes.length > this.windowSize) {
      this.recentOperationTimes.shift();
    }
    
    // Only adjust after we have enough samples
    if (this.recentOperationTimes.length >= 5) {
      const avgTime = this.recentOperationTimes.reduce((a, b) => a + b, 0) / this.recentOperationTimes.length;
      this.adjustConcurrency(avgTime);
    }
  }
  
  /**
   * Adjust concurrency based on average operation time
   */
  private adjustConcurrency(avgOperationTime: number): void {
    const previousConcurrency = this.currentConcurrency;
    
    if (avgOperationTime > this.slowThreshold && this.currentConcurrency > this.minConcurrency) {
      // Operations too slow: reduce concurrency
      this.currentConcurrency = Math.max(
        this.minConcurrency,
        this.currentConcurrency - 1
      );
      
      if (this.currentConcurrency !== previousConcurrency) {
        this.limiter = pLimit(this.currentConcurrency);
        logger.info({
          avgOperationTime,
          threshold: this.slowThreshold,
          previousConcurrency,
          newConcurrency: this.currentConcurrency,
          action: 'decreased',
        }, 'Concurrency reduced due to slow operations');
      }
    } else if (avgOperationTime < this.fastThreshold && this.currentConcurrency < this.maxConcurrency) {
      // Operations fast: increase concurrency
      this.currentConcurrency = Math.min(
        this.maxConcurrency,
        this.currentConcurrency + 1
      );
      
      if (this.currentConcurrency !== previousConcurrency) {
        this.limiter = pLimit(this.currentConcurrency);
        logger.info({
          avgOperationTime,
          threshold: this.fastThreshold,
          previousConcurrency,
          newConcurrency: this.currentConcurrency,
          action: 'increased',
        }, 'Concurrency increased due to fast operations');
      }
    }
  }
  
  /**
   * Get current concurrency limit
   */
  getConcurrency(): number {
    return this.currentConcurrency;
  }
  
  /**
   * Get pending and active operation counts
   */
  getStats() {
    return {
      currentConcurrency: this.currentConcurrency,
      maxConcurrency: this.maxConcurrency,
      minConcurrency: this.minConcurrency,
      activeCount: this.limiter.activeCount,
      pendingCount: this.limiter.pendingCount,
      recentOperationTimes: [...this.recentOperationTimes],
      averageOperationTime: this.recentOperationTimes.length > 0
        ? this.recentOperationTimes.reduce((a, b) => a + b, 0) / this.recentOperationTimes.length
        : null,
    };
  }
  
  /**
   * Clear pending operations
   */
  clearQueue(): void {
    this.limiter.clearQueue();
    logger.debug('Cleared pending operations from concurrency limiter');
  }
  
  /**
   * Reset controller to initial state
   */
  reset(): void {
    this.currentConcurrency = this.maxConcurrency;
    this.limiter = pLimit(this.currentConcurrency);
    this.recentOperationTimes = [];
    logger.debug('AdaptiveConcurrencyController reset to initial state');
  }
}
