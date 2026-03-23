import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestServer, teardownTestServer } from '../../helpers/server.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await createTestServer();
});

afterAll(async () => {
  await teardownTestServer();
});

describe('GET /api/export', () => {
  it('returns 200 with application/json content-type', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/export' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('returns a valid export structure with version field', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/export' });
    const body = res.json<{ version: string; profiles: unknown[]; games: unknown[] }>();
    expect(body.version).toBeTruthy();
    expect(Array.isArray(body.profiles)).toBe(true);
    expect(Array.isArray(body.games)).toBe(true);
  });
});

describe('POST /api/import', () => {
  it('returns 400 for malformed JSON payload', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/import',
      payload: { invalid: 'data' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 200 when importing a valid minimal export', async () => {
    const payload = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      profiles: [],
      games: [],
      achievements: [],
      settings: null,
    };
    const res = await app.inject({
      method: 'POST',
      url: '/api/import',
      payload,
    });
    expect(res.statusCode).toBe(200);
  });
});
