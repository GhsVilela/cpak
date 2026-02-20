import { logger } from '../utils/logger.js';

/**
 * Adaptive Batch Controller
 * 
 * Implements feedback-controlled batch sizing to maintain optimal API performance.
 * Starts at user-configured maximum and dynamically adjusts based on response times.
 * 
 * Algorithm:
 * - If avg response time > 750ms (1.5x target): Reduce batch size by 20%
 * - If avg response time < 250ms (0.5x target): Increase batch size by 10%
 * - Never exceed user-configured maximum (backwards compatible)
 * - Never go below minimum of 5 items
 * 
 * Target: 500ms average response time
 */
export class AdaptiveBatchController {
  private currentBatchSize: number;
  private readonly minBatchSize = 5;
  private readonly maxBatchSize: number;
  private readonly targetResponseTime = 500; // ms
  private recentResponseTimes: number[] = [];
  private readonly windowSize = 5; // Track last 5 responses
  
  /**
   * @param userConfiguredMax - Maximum batch size from user settings
   */
  constructor(userConfiguredMax: number) {
    this.maxBatchSize = Math.max(userConfiguredMax, this.minBatchSize);
    this.currentBatchSize = this.maxBatchSize;
    
    logger.debug({
      initialBatchSize: this.currentBatchSize,
      maxBatchSize: this.maxBatchSize,
      minBatchSize: this.minBatchSize,
    }, 'AdaptiveBatchController initialized');
  }
  
  /**
   * Adjust batch size based on response time feedback
   * 
   * @param responseTime - Time taken to process last batch (in milliseconds)
   */
  adjustBatchSize(responseTime: number): void {
    // Add to sliding window
    this.recentResponseTimes.push(responseTime);
    if (this.recentResponseTimes.length > this.windowSize) {
      this.recentResponseTimes.shift();
    }
    
    // Calculate average response time
    const avgResponseTime = this.recentResponseTimes.reduce((a, b) => a + b, 0) / this.recentResponseTimes.length;
    
    const previousBatchSize = this.currentBatchSize;
    
    // Adjust batch size based on performance
    if (avgResponseTime > this.targetResponseTime * 1.5) {
      // Performance degrading: reduce batch size by 20%
      this.currentBatchSize = Math.max(
        this.minBatchSize,
        Math.floor(this.currentBatchSize * 0.8)
      );
      
      if (this.currentBatchSize !== previousBatchSize) {
        logger.info({
          avgResponseTime,
          threshold: this.targetResponseTime * 1.5,
          previousBatchSize,
          newBatchSize: this.currentBatchSize,
          action: 'decreased',
        }, 'Batch size adjusted due to slow response times');
      }
    } else if (avgResponseTime < this.targetResponseTime * 0.5 && this.currentBatchSize < this.maxBatchSize) {
      // Performing well: increase batch size by 10%
      this.currentBatchSize = Math.min(
        this.maxBatchSize,
        Math.ceil(this.currentBatchSize * 1.1)
      );
      
      if (this.currentBatchSize !== previousBatchSize) {
        logger.info({
          avgResponseTime,
          threshold: this.targetResponseTime * 0.5,
          previousBatchSize,
          newBatchSize: this.currentBatchSize,
          action: 'increased',
        }, 'Batch size adjusted due to good response times');
      }
    }
  }
  
  /**
   * Get current batch size
   */
  getBatchSize(): number {
    return this.currentBatchSize;
  }
  
  /**
   * Get statistics about batch controller performance
   */
  getStats() {
    return {
      currentBatchSize: this.currentBatchSize,
      maxBatchSize: this.maxBatchSize,
      minBatchSize: this.minBatchSize,
      recentResponseTimes: [...this.recentResponseTimes],
      averageResponseTime: this.recentResponseTimes.length > 0
        ? this.recentResponseTimes.reduce((a, b) => a + b, 0) / this.recentResponseTimes.length
        : null,
    };
  }
  
  /**
   * Reset controller to initial state
   */
  reset(): void {
    this.currentBatchSize = this.maxBatchSize;
    this.recentResponseTimes = [];
    logger.debug('AdaptiveBatchController reset to initial state');
  }
}
