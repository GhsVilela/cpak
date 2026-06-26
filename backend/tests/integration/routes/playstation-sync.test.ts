/**
 * Integration tests for PlayStation sync endpoint
 * POST /api/sync/playstation
 */
import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import mongoose from 'mongoose';
import { createTestServer, teardownTestServer } from '../../helpers/server.js';
import { Profile } from '../../../src/models/profile.js';
import { Game } from '../../../src/models/game.js';
import { Achievement } from '../../../src/models/achievement.js';

vi.mock('psn-api', () => ({
  exchangeNpssoForAccessCode: vi.fn(),
  exchangeAccessCodeForAuthTokens: vi.fn(),
  exchangeRefreshTokenForAuthTokens: vi.fn(),
  getProfileFromAccountId: vi.fn(),
  getUserTitles: vi.fn(),
  getTitleTrophies: vi.fn(),
  getUserTrophiesEarnedForTitle: vi.fn(),
}));

vi.mock('../../../src/utils/imageStorage.js', () => ({
  imageStorage: {
    downloadAndStore: vi.fn().mockResolvedValue(undefined),
    downloadAndStoreViaWget: vi.fn().mockResolvedValue(undefined),
    checkLocalFile: vi.fn().mockReturnValue(null),
  },
}));

let app: FastifyInstance;

beforeAll(async () => {
  app = await createTestServer();
});

afterAll(async () => {
  await teardownTestServer();
});

beforeEach(async () => {
  await Profile.deleteMany({ platform: 'playstation' });
  await Game.deleteMany({ platform: 'playstation' });
  await Achievement.deleteMany({ platform: 'playstation' });
});

describe('POST /api/sync/playstation', () => {
  it('returns 400 for invalid platform value', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/sync/invalidplatform' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when no PlayStation profiles exist', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/sync/playstation' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 when profileId does not match a real profile', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await app.inject({
      method: 'POST',
      url: `/api/sync/playstation?profileId=${fakeId}`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 200 when sync is triggered for an existing PlayStation profile', async () => {
    // Create a PlayStation profile with encrypted OAuth credentials
    const profile = new Profile({
      platform: 'playstation',
      profileId: 'test-psn-account-id',
      displayName: 'TestPSNUser',
      credentials: {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: new Date(Date.now() + 3_600_000),
        tokenType: 'bearer',
      },
    });
    await profile.save();

    const res = await app.inject({
      method: 'POST',
      url: `/api/sync/playstation?profileId=${profile._id}`,
    });

    // Sync is fire-and-forget; it acknowledges with 200
    expect([200, 202]).toContain(res.statusCode);
    const body = res.json();
    expect(body).toHaveProperty('message');
  });
});
