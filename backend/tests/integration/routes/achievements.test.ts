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

describe('GET /api/achievements', () => {
  it('returns 200 with empty array when no achievements exist', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/achievements' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it('returns 404 when filtering by non-existent gameId', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/achievements?gameId=000000000000000000000000',
    });
    expect(res.statusCode).toBe(404);
  });
});
