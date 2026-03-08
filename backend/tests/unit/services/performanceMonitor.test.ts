import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PerformanceMonitor } from '../../../src/services/performanceMonitor.js';

vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('PerformanceMonitor', () => {
  let monitor: PerformanceMonitor;

  beforeEach(() => {
    monitor = new PerformanceMonitor();
    vi.clearAllMocks();
  });

  describe('getThresholds / setThresholds', () => {
    it('returns default thresholds', () => {
      const t = monitor.getThresholds();
      expect(t.dbQuery).toBe(500);
      expect(t.apiResponse).toBe(2000);
      expect(t.batchOperation).toBe(5000);
    });

    it('returns a copy (not the internal object)', () => {
      const t = monitor.getThresholds();
      t.dbQuery = 9999;
      expect(monitor.getThresholds().dbQuery).toBe(500);
    });

    it('updates partial thresholds', () => {
      monitor.setThresholds({ dbQuery: 100 });
      const t = monitor.getThresholds();
      expect(t.dbQuery).toBe(100);
      expect(t.apiResponse).toBe(2000); // unchanged
    });
  });

  describe('measureDbQuery', () => {
    it('returns the result of the function', async () => {
      const result = await monitor.measureDbQuery('test', async () => 42);
      expect(result).toBe(42);
    });

    it('logs debug for fast queries', async () => {
      const { logger } = await import('../../../src/utils/logger.js');
      await monitor.measureDbQuery('fast-query', async () => 'ok');
      expect(vi.mocked(logger.debug)).toHaveBeenCalled();
    });

    it('logs warning for slow queries', async () => {
      const { logger } = await import('../../../src/utils/logger.js');
      monitor.setThresholds({ dbQuery: -1 }); // threshold=-1 so any duration triggers warning
      await monitor.measureDbQuery('slow-query', async () => 'ok');
      expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'slow_query', operation: 'slow-query' }),
        expect.any(String),
      );
    });

    it('rethrows errors and logs error', async () => {
      const { logger } = await import('../../../src/utils/logger.js');
      await expect(
        monitor.measureDbQuery('fail', async () => { throw new Error('db crash'); }),
      ).rejects.toThrow('db crash');
      expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'query_error' }),
        expect.any(String),
      );
    });
  });

  describe('measureApiCall', () => {
    it('returns the result of the function', async () => {
      const result = await monitor.measureApiCall('test', async () => ({ data: 1 }));
      expect(result).toEqual({ data: 1 });
    });

    it('logs warning for slow API calls', async () => {
      const { logger } = await import('../../../src/utils/logger.js');
      monitor.setThresholds({ apiResponse: -1 });
      await monitor.measureApiCall('slow-api', async () => 'ok');
      expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'slow_api_call' }),
        expect.any(String),
      );
    });

    it('rethrows errors and logs error', async () => {
      const { logger } = await import('../../../src/utils/logger.js');
      await expect(
        monitor.measureApiCall('fail', async () => { throw new Error('timeout'); }),
      ).rejects.toThrow('timeout');
      expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'api_error' }),
        expect.any(String),
      );
    });
  });

  describe('measureBatchOperation', () => {
    it('returns result and metrics', async () => {
      const { result, metrics } = await monitor.measureBatchOperation('batch', 10, async () => 'done');
      expect(result).toBe('done');
      expect(metrics.batchSize).toBe(10);
      expect(metrics.itemsProcessed).toBe(10);
      expect(metrics.duration).toBeGreaterThanOrEqual(0);
      expect(metrics.averageItemTime).toBeGreaterThanOrEqual(0);
      expect(metrics.timestamp).toBeInstanceOf(Date);
    });

    it('logs warning for slow batch operations', async () => {
      const { logger } = await import('../../../src/utils/logger.js');
      monitor.setThresholds({ batchOperation: -1 });
      await monitor.measureBatchOperation('slow-batch', 5, async () => 'ok');
      expect(vi.mocked(logger.warn)).toHaveBeenCalled();
    });

    it('rethrows errors and logs error', async () => {
      const { logger } = await import('../../../src/utils/logger.js');
      await expect(
        monitor.measureBatchOperation('fail', 3, async () => { throw new Error('batch fail'); }),
      ).rejects.toThrow('batch fail');
      expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'batch_error' }),
        expect.any(String),
      );
    });
  });
});
