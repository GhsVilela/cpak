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

describe('GET /api/settings', () => {
  it('returns 200 with a settings array', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ settings: unknown[] }>();
    expect(body).toHaveProperty('settings');
    expect(Array.isArray(body.settings)).toBe(true);
  });
});

describe('GET /api/settings/:key', () => {
  it('returns 400 for invalid key format (uppercase letters)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/settings/INVALID_KEY' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 for unknown setting key', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/settings/unknown_key' });
    expect(res.statusCode).toBe(404);
  });
});

describe('PUT /api/settings/:key', () => {
  it('returns 400 for missing value in body', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/settings/some_key',
      payload: { category: 'general' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for invalid category enum value', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/settings/some_key',
      payload: { value: 'true', category: 'not_a_real_category' },
    });
    expect(res.statusCode).toBe(400);
  });
});
