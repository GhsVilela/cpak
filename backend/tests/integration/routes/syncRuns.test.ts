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

describe('GET /api/sync/runs', () => {
  it('returns 200 with empty array when no sync runs exist', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/sync/runs' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it('returns 200 with empty array for unknown profileId (invalid ObjectId ignored)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/sync/runs?profileId=not-a-valid-id',
    });
    // Route silently ignores invalid ObjectId format
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });
});

describe('GET /api/sync/runs/:id', () => {
  it('returns 400 for non-ObjectId run id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/sync/runs/not-a-valid-id',
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 for valid ObjectId that does not exist', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/sync/runs/000000000000000000000000',
    });
    expect(res.statusCode).toBe(404);
  });
});
