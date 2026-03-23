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

describe('GET /api/games', () => {
  it('returns 200 with empty array when no games exist', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/games' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ games: unknown[] }>();
    // Route returns { data: [], pagination: { ... } }
    const games = Array.isArray(body) ? body : (body.data ?? body.games ?? body);
    expect(games).toEqual([]);
  });

  it('returns 400 for invalid platform query param', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/games?platform=invalid' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when profileId does not exist', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/games?profileId=000000000000000000000000',
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/games/:id', () => {
  it('returns 404 for non-existent game id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/games/000000000000000000000000',
    });
    expect(res.statusCode).toBe(404);
  });
});
