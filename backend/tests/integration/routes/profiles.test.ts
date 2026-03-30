import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestServer, teardownTestServer } from '../../helpers/server.js';

// Mock psn-api so PlayStation profile creation works without live API calls
vi.mock('psn-api', () => ({
  exchangeNpssoForAccessCode: vi.fn(),
  exchangeAccessCodeForAuthTokens: vi.fn(),
  exchangeRefreshTokenForAuthTokens: vi.fn(),
  getProfileFromAccountId: vi.fn(),
  getUserTrophyProfileSummary: vi.fn(),
  getUserTitles: vi.fn(),
  getTitleTrophies: vi.fn(),
  getUserTrophiesEarnedForTitle: vi.fn(),
}));

import {
  exchangeNpssoForAccessCode,
  exchangeAccessCodeForAuthTokens,
  getProfileFromAccountId,
  getUserTrophyProfileSummary,
} from 'psn-api';

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

describe('POST /api/profiles — update existing profile', () => {
  it('updates credentials when profile already exists', async () => {
    // Create the profile first
    await app.inject({
      method: 'POST',
      url: '/api/profiles',
      payload: { platform: 'steam', profileId: 'update-creds-test', credentials: { steamApiKey: 'old-key' } },
    });
    // POST again with same profileId + new credentials — should update
    const res = await app.inject({
      method: 'POST',
      url: '/api/profiles',
      payload: { platform: 'steam', profileId: 'update-creds-test', credentials: { steamApiKey: 'new-key' } },
    });
    expect(res.statusCode).toBe(201);
  });
});

describe('POST /api/profiles — PlayStation NPSSO', () => {
  it('creates a PlayStation profile with valid NPSSO token', async () => {
    vi.mocked(exchangeNpssoForAccessCode).mockResolvedValue('v3.ACCESS_CODE');
    vi.mocked(exchangeAccessCodeForAuthTokens).mockResolvedValue({
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
      expiresIn: 3600,
      refreshTokenExpiresIn: 5184000,
      idToken: '',
      scope: 'psn:clientapp',
      tokenType: 'bearer',
    } as any);
    vi.mocked(getUserTrophyProfileSummary).mockResolvedValue({
      accountId: 'psn-account-new-id',
      trophyLevel: '10', progress: 100, tier: 1,
      earnedTrophies: { bronze: 0, silver: 0, gold: 0, platinum: 0 },
    } as any);
    vi.mocked(getProfileFromAccountId).mockResolvedValue({
      onlineId: 'TestPSNUser',
      accountId: 'psn-account-new-id',
      aboutMe: '',
      avatars: [],
      languages: ['en-US'],
      isPlus: false,
      isOfficiallyVerified: false,
      isMe: true,
    } as any);

    const res = await app.inject({
      method: 'POST',
      url: '/api/profiles',
      payload: { platform: 'playstation', npssoToken: 'valid-npsso-token' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<{ platform: string; profileId: string }>();
    expect(body.platform).toBe('playstation');
    expect(body.profileId).toBe('psn-account-new-id');
  });

  it('returns 400 for invalid NPSSO token', async () => {
    vi.mocked(exchangeNpssoForAccessCode).mockRejectedValue(new Error('NPSSO token invalid'));

    const res = await app.inject({
      method: 'POST',
      url: '/api/profiles',
      payload: { platform: 'playstation', npssoToken: 'bad-npsso-token' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json<{ error: string }>();
    expect(body.error).toMatch(/NPSSO/i);
  });

  it('returns 409 when PlayStation profile already exists', async () => {
    // Create the profile directly first (within this test — afterEach clears DB between tests)
    const { Profile } = await import('../../../src/models/profile.js');
    await Profile.create({
      platform: 'playstation',
      profileId: 'psn-dup-account-id',
      displayName: 'Existing PSN User',
      credentials: {},
    });

    vi.mocked(exchangeNpssoForAccessCode).mockResolvedValue('v3.CODE2');
    vi.mocked(exchangeAccessCodeForAuthTokens).mockResolvedValue({
      accessToken: 'token2', refreshToken: 'refresh2', expiresIn: 3600,
      refreshTokenExpiresIn: 0, idToken: '', scope: '', tokenType: 'bearer',
    } as any);
    vi.mocked(getUserTrophyProfileSummary).mockResolvedValue({
      accountId: 'psn-dup-account-id',
      trophyLevel: '10', progress: 100, tier: 1,
      earnedTrophies: { bronze: 0, silver: 0, gold: 0, platinum: 0 },
    } as any);
    vi.mocked(getProfileFromAccountId).mockResolvedValue({
      onlineId: 'ExistingUser', accountId: 'psn-dup-account-id',
      aboutMe: '', avatars: [], languages: [], isPlus: false,
      isOfficiallyVerified: false, isMe: true,
    } as any);

    // Second attempt with the same accountId should conflict
    const res = await app.inject({
      method: 'POST',
      url: '/api/profiles',
      payload: { platform: 'playstation', npssoToken: 'another-npsso-token' },
    });

    expect(res.statusCode).toBe(409);
  });
});
