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

describe('GET /api/health', () => {
  it('returns 200 with status ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });
});

describe('GET /api/version', () => {
  it('returns 200 with a semver version string', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/version' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ version: string }>();
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
