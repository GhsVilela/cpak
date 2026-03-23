import pLimit, { LimitFunction } from 'p-limit';
import { logger } from '../utils/logger.js';

/**
 * Adaptive Concurrency Controller
 * 
 * Dynamically adjusts the maximum number of concurrent operations based on API performance.
 * Uses p-limit to enforce concurrency limits with adaptive adjustment.
 * Starts at a configured starting value and can grow up to maxConcurrency.
 * 
 * Algorithm:
 * - If operations take > slowThreshold: Reduce concurrency by 1
 * - If operations take < fastThreshold: Increase concurrency by 1
 * - Never exceed maxConcurrency
 * - Never go below minConcurrency
 */
export class AdaptiveConcurrencyController {
  private currentConcurrency: number;
  private readonly startingConcurrency: number;
  private readonly minConcurrency: number;
  private readonly maxConcurrency: number;
  private limiter: LimitFunction;
  private recentOperationTimes: number[] = [];
  private readonly windowSize = 10; // Track last 10 operations
  private readonly slowThreshold = 5000; // ms - reduce concurrency if exceeded
  private readonly fastThreshold = 500; // ms - increase concurrency if under
  
  /**
   * @param startingConcurrency - Initial concurrency to begin with
   * @param maxConcurrency - Ceiling the controller can scale up to
   * @param minConcurrency - Floor the controller will never go below
   */
  constructor(startingConcurrency: number, maxConcurrency?: number, minConcurrency?: number) {
    this.minConcurrency = minConcurrency ?? 5;
    this.maxConcurrency = Math.max(maxConcurrency ?? startingConcurrency, this.minConcurrency);
    this.startingConcurrency = Math.min(Math.max(startingConcurrency, this.minConcurrency), this.maxConcurrency);
    this.currentConcurrency = this.startingConcurrency;
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
   * Cap concurrency to a maximum value (e.g. current batch size).
   * Ensures concurrency never exceeds the number of items being processed.
   */
  capConcurrency(cap: number): void {
    if (cap < this.currentConcurrency) {
      const prev = this.currentConcurrency;
      this.currentConcurrency = Math.max(this.minConcurrency, cap);
      this.limiter = pLimit(this.currentConcurrency);
      logger.info({ previousConcurrency: prev, newConcurrency: this.currentConcurrency, cap }, 'Concurrency capped to batch size');
    }
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
    this.currentConcurrency = this.startingConcurrency;
    this.limiter = pLimit(this.currentConcurrency);
    this.recentOperationTimes = [];
    logger.debug('AdaptiveConcurrencyController reset to initial state');
  }
}
