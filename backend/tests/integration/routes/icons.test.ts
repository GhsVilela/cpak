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

describe('GET /api/icons/:platform/:gameId/:filename', () => {
  it('returns 404 when the icon file does not exist', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/icons/steam/99999/icon.png',
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toHaveProperty('error');
  });
});
