import { logger } from '../utils/logger.js';

/**
 * Adaptive Batch Controller
 * 
 * Implements feedback-controlled batch sizing to maintain optimal API performance.
 * Starts at user-configured maximum and dynamically adjusts based on response times.
 * 
 * Algorithm:
 * - If avg response time > 1000ms (2x target): Reduce batch size by 25%
 * - If avg response time < 350ms (0.7x target): Increase batch size by 15%
 * - Never exceed user-configured maximum (backwards compatible)
 * - Never go below minimum of 5 items
 * 
 * Target: 500ms average response time (balanced between speed and reliability)
 */
export class AdaptiveBatchController {
  private currentBatchSize: number;
  private readonly minBatchSize = 5;
  private readonly maxBatchSize: number;
  private readonly targetResponseTime = 500; // ms - balanced target
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
    if (avgResponseTime > this.targetResponseTime * 2) {
      // Performance degrading: reduce batch size by 25% (aggressive response to slowdowns)
      this.currentBatchSize = Math.max(
        this.minBatchSize,
        Math.floor(this.currentBatchSize * 0.75)
      );
      
      if (this.currentBatchSize !== previousBatchSize) {
        logger.info({
          avgResponseTime,
          threshold: this.targetResponseTime * 2,
          previousBatchSize,
          newBatchSize: this.currentBatchSize,
          action: 'decreased',
        }, 'Batch size adjusted due to slow response times');
      }
    } else if (avgResponseTime < this.targetResponseTime * 0.7 && this.currentBatchSize < this.maxBatchSize) {
      // Performing well: increase batch size by 15% (conservative growth)
      this.currentBatchSize = Math.min(
        this.maxBatchSize,
        Math.ceil(this.currentBatchSize * 1.15)
      );
      
      if (this.currentBatchSize !== previousBatchSize) {
        logger.info({
          avgResponseTime,
          threshold: this.targetResponseTime * 0.7,
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
