import { logger } from '../utils/logger.js';

/**
 * Adaptive Batch Controller
 * 
 * Implements feedback-controlled batch sizing to maintain optimal API performance.
 * Starts at a configured starting value and dynamically adjusts based on response times.
 * Can grow beyond the starting value up to maxBatchSize when performance is good.
 * 
 * Algorithm:
 * - If avg response time > targetResponseTime * 2.5: Reduce batch size by 25%
 * - If avg response time < targetResponseTime * 1.2: Increase batch size by 20%
 * - Never exceed maxBatchSize
 * - Never go below minBatchSize
 */
export class AdaptiveBatchController {
  private currentBatchSize: number;
  private readonly startingBatchSize: number;
  private readonly minBatchSize: number;
  private readonly maxBatchSize: number;
  private readonly targetResponseTime = 800; // ms - More tolerant for network latency
  private recentResponseTimes: number[] = [];
  private readonly windowSize = 5; // Track last 5 responses
  
  /**
   * @param startingBatchSize - Initial batch size to begin with
   * @param maxBatchSize - Ceiling the controller can scale up to
   * @param minBatchSize - Floor the controller will never go below
   */
  constructor(startingBatchSize: number, maxBatchSize?: number, minBatchSize?: number) {
    this.minBatchSize = minBatchSize ?? 20;
    this.maxBatchSize = Math.max(maxBatchSize ?? startingBatchSize, this.minBatchSize);
    this.startingBatchSize = Math.min(Math.max(startingBatchSize, this.minBatchSize), this.maxBatchSize);
    this.currentBatchSize = this.startingBatchSize;
    
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
    if (avgResponseTime > this.targetResponseTime * 2.5) {
      // Performance degrading severely: reduce batch size by 25%
      this.currentBatchSize = Math.max(
        this.minBatchSize,
        Math.floor(this.currentBatchSize * 0.75)
      );
      
      if (this.currentBatchSize !== previousBatchSize) {
        logger.info({
          avgResponseTime,
          threshold: this.targetResponseTime * 2.5,
          previousBatchSize,
          newBatchSize: this.currentBatchSize,
          action: 'decreased',
        }, 'Batch size adjusted due to slow response times');
      }
    } else if (avgResponseTime < this.targetResponseTime * 1.2 && this.currentBatchSize < this.maxBatchSize) {
      // Performing well: increase batch size by 20% (more aggressive growth)
      this.currentBatchSize = Math.min(
        this.maxBatchSize,
        Math.ceil(this.currentBatchSize * 1.20)
      );
      
      if (this.currentBatchSize !== previousBatchSize) {
        logger.info({
          avgResponseTime,
          threshold: this.targetResponseTime * 1.2,
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
    this.currentBatchSize = this.startingBatchSize;
    this.recentResponseTimes = [];
    logger.debug('AdaptiveBatchController reset to initial state');
  }
}
