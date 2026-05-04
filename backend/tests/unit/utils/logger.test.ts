import { describe, it, expect, vi } from 'vitest';

vi.mock('pino', () => {
  const fakeLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(),
  };
  const pino = vi.fn(() => fakeLogger);
  return { default: pino };
});

import { logger } from '../../../src/utils/logger.js';

describe('logger', () => {
  it('exports a logger instance', () => {
    expect(logger).toBeDefined();
  });

  it('has standard log methods', () => {
    expect(logger.info).toBeDefined();
    expect(logger.error).toBeDefined();
    expect(logger.warn).toBeDefined();
    expect(logger.debug).toBeDefined();
  });
});
