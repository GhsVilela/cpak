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

describe('GET /api/sync/status', () => {
  it('returns 200 with empty activeSyncs when no sync is running', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/sync/status' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ activeSyncs: unknown[] }>();
    expect(body).toHaveProperty('activeSyncs');
    expect(body.activeSyncs).toEqual([]);
  });
});

describe('POST /api/sync/:platform', () => {
  it('returns 400 for invalid platform value', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/sync/unknown' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when no profiles exist for the platform', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/sync/steam' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 when profileId query param does not match a profile', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/sync/steam?profileId=000000000000000000000000',
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /api/sync/cancel/:operationId', () => {
  it('returns 404 for non-existent operation id', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/sync/cancel/000000000000000000000000',
    });
    expect(res.statusCode).toBe(404);
  });
});
