import { logger } from '../utils/logger.js';

/**
 * Event emitted when a database query exceeds threshold
 */
export interface SlowQueryEvent {
  type: 'slow_query';
  operation: string;
  duration: number;
  threshold: number;
  timestamp: Date;
}

/**
 * Event emitted when an API response exceeds threshold
 */
export interface ApiResponseEvent {
  type: 'slow_api_call';
  operation: string;
  duration: number;
  threshold: number;
  timestamp: Date;
}

/**
 * Metrics for batch operations
 */
export interface BatchMetrics {
  batchSize: number;
  itemsProcessed: number;
  duration: number;
  averageItemTime: number;
  timestamp: Date;
}

/**
 * Performance thresholds (in milliseconds)
 */
export interface PerformanceThresholds {
  dbQuery: number;      // Database query threshold
  apiResponse: number;  // API response threshold
  batchOperation: number; // Batch operation threshold
}

/**
 * Performance monitoring service for tracking slow operations
 * 
 * Monitors:
 * - Database queries that exceed 500ms
 * - API calls that exceed 2000ms
 * - Batch operations that exceed 5000ms
 */
export class PerformanceMonitor {
  private readonly thresholds: PerformanceThresholds = {
    dbQuery: 500,      // ms
    apiResponse: 5000, // ms
    batchOperation: 10000 // ms
  };
  
  /**
   * Measure the duration of a database query
   * Logs warning if query exceeds threshold
   * 
   * @param operation - Description of the query operation
   * @param fn - Async function to measure
   * @returns Query result
   */
  async measureDbQuery<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      
      if (duration > this.thresholds.dbQuery) {
        const event: SlowQueryEvent = {
          type: 'slow_query',
          operation,
          duration,
          threshold: this.thresholds.dbQuery,
          timestamp: new Date(),
        };
        logger.warn(event, 'Database query exceeded threshold');
      } else {
        logger.debug({ operation, duration }, 'Database query completed');
      }
      
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      logger.error({ type: 'query_error', operation, duration, error }, 'Database query failed');
      throw error;
    }
  }
  
  /**
   * Measure the duration of an API call
   * Logs warning if call exceeds threshold
   * 
   * @param operation - Description of the API operation
   * @param fn - Async function to measure
   * @returns API call result
   */
  async measureApiCall<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      
      if (duration > this.thresholds.apiResponse) {
        const event: ApiResponseEvent = {
          type: 'slow_api_call',
          operation,
          duration,
          threshold: this.thresholds.apiResponse,
          timestamp: new Date(),
        };
        logger.warn(event, 'API call exceeded threshold');
      } else {
        logger.debug({ operation, duration }, 'API call completed');
      }
      
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      logger.error({ type: 'api_error', operation, duration, err: error instanceof Error ? error.message : String(error) }, 'API call failed');
      throw error;
    }
  }
  
  /**
   * Measure batch operation performance
   * 
   * @param operation - Description of the batch operation
   * @param batchSize - Number of items in the batch
   * @param fn - Async function to measure
   * @returns Batch operation result and metrics
   */
  async measureBatchOperation<T>(
    operation: string,
    batchSize: number,
    fn: () => Promise<T>
  ): Promise<{ result: T; metrics: BatchMetrics }> {
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      
      const metrics: BatchMetrics = {
        batchSize,
        itemsProcessed: batchSize,
        duration,
        averageItemTime: duration / batchSize,
        timestamp: new Date(),
      };
      
      if (duration > this.thresholds.batchOperation) {
        logger.warn({ operation, metrics }, 'Batch operation exceeded threshold');
      } else {
        logger.debug({ operation, metrics }, 'Batch operation completed');
      }
      
      return { result, metrics };
    } catch (error) {
      const duration = Date.now() - start;
      logger.error({ type: 'batch_error', operation, batchSize, duration, error }, 'Batch operation failed');
      throw error;
    }
  }
  
  /**
   * Get current performance thresholds
   */
  getThresholds(): PerformanceThresholds {
    return { ...this.thresholds };
  }
  
  /**
   * Update performance thresholds (for testing or dynamic adjustment)
   */
  setThresholds(thresholds: Partial<PerformanceThresholds>): void {
    Object.assign(this.thresholds, thresholds);
    logger.info({ thresholds: this.thresholds }, 'Performance thresholds updated');
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();
