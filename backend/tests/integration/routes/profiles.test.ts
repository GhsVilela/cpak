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

describe('GET /api/profiles', () => {
  it('returns 200 with empty array when no profiles exist', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/profiles' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });
});

describe('POST /api/profiles', () => {
  it('creates a new profile and returns 200', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/profiles',
      payload: {
        platform: 'steam',
        profileId: 'test-steam-id-123',
        displayName: 'Test User',
        credentials: { steamApiKey: 'fake-api-key' },
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{ profileId: string; platform: string }>();
    expect(body.platform).toBe('steam');
    expect(body.profileId).toBe('test-steam-id-123');
  });

  it('returns 400 when platform is invalid', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/profiles',
      payload: { platform: 'invalid-platform', profileId: 'some-id' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when profileId is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/profiles',
      payload: { platform: 'steam' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/profiles/:id', () => {
  it('returns 404 for non-existent profile id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/profiles/000000000000000000000000',
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns the profile when it exists', async () => {
    // First create a profile
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/profiles',
      payload: { platform: 'steam', profileId: 'get-test-id' },
    });
    const created = createRes.json<{ _id: string }>();

    const res = await app.inject({ method: 'GET', url: `/api/profiles/${created._id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ profileId: string }>().profileId).toBe('get-test-id');
  });
});

describe('DELETE /api/profiles/:id', () => {
  it('returns 404 when deleting non-existent profile', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/profiles/000000000000000000000000',
    });
    expect(res.statusCode).toBe(404);
  });

  it('deletes an existing profile and returns 200', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/profiles',
      payload: { platform: 'xbox', profileId: 'to-delete-id' },
    });
    const created = createRes.json<{ _id: string }>();

    const delRes = await app.inject({ method: 'DELETE', url: `/api/profiles/${created._id}` });
    expect(delRes.statusCode).toBe(204);
  });
});
