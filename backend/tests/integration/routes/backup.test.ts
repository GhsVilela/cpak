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

describe('GET /api/backup/status', () => {
  it('returns 200 with a backup status object', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/backup/status' });
    expect(res.statusCode).toBe(200);
  });
});

describe('POST /api/backup/start', () => {
  it('returns 200 or 202 when backup is initiated', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/backup/start' });
    expect([200, 202]).toContain(res.statusCode);
    const body = res.json<{ jobId?: string }>();
    expect(body).toHaveProperty('jobId');
  });
});

describe('GET /api/backup/progress/:jobId', () => {
  it('returns 404 for unknown job id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/backup/progress/000000000000000000000000',
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /api/backup/cancel/:jobId', () => {
  it('returns 404 for unknown job id', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/backup/cancel/000000000000000000000000',
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/backup/restore/status', () => {
  it('returns 200 with restore jobs list', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/backup/restore/status' });
    expect(res.statusCode).toBe(200);
  });
});
