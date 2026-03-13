import { describe, it, expect } from 'vitest';
import { getApiPort, getAllowedOrigins, config } from '../../../src/utils/config.js';

describe('config utils', () => {
  it('getApiPort returns a number', () => {
    const port = getApiPort();
    expect(typeof port).toBe('number');
    expect(port).toBeGreaterThan(0);
  });

  it('getAllowedOrigins returns an array', () => {
    const origins = getAllowedOrigins();
    expect(Array.isArray(origins)).toBe(true);
    expect(origins.length).toBeGreaterThan(0);
  });

  it('getAllowedOrigins returns [*] when ALLOWED_ORIGINS is *', () => {
    // Default in test environment is *
    const origins = getAllowedOrigins();
    expect(origins).toContain('*');
  });

  it('config object has expected keys', () => {
    expect(config).toHaveProperty('API_PORT');
    expect(config).toHaveProperty('MONGO_URI');
    expect(config).toHaveProperty('ALLOWED_ORIGINS');
    expect(config).toHaveProperty('IMAGES_DIR');
    expect(config).toHaveProperty('BACKUP_DIR');
  });

  it('getAllowedOrigins splits comma-separated origins', () => {
    const original = config.ALLOWED_ORIGINS;
    config.ALLOWED_ORIGINS = 'http://localhost:3000,http://localhost:4000';
    const origins = getAllowedOrigins();
    expect(origins).toEqual(['http://localhost:3000', 'http://localhost:4000']);
    config.ALLOWED_ORIGINS = original;
  });
});
