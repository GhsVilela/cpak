/**
 * Integration tests for PlayStation authentication endpoint
 * POST /api/auth/playstation/validate
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestServer, teardownTestServer } from '../../helpers/server.js';

// Mock psn-api at the module level so the auth route uses our mocks
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

describe('POST /api/auth/playstation/validate', () => {
  it('returns 200 with accountId and onlineId for a valid NPSSO token', async () => {
    vi.mocked(exchangeNpssoForAccessCode).mockResolvedValue('v3.MOCK_CODE');
    vi.mocked(exchangeAccessCodeForAuthTokens).mockResolvedValue({
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
      expiresIn: 3600,
      refreshTokenExpiresIn: 5184000,
      idToken: 'mock-id-token',
      scope: 'psn:clientapp',
      tokenType: 'bearer',
    } as any);
    vi.mocked(getUserTrophyProfileSummary).mockResolvedValue({
      accountId: '123456789',
      trophyLevel: '999',
      progress: 100,
      tier: 10,
      earnedTrophies: { bronze: 0, silver: 0, gold: 0, platinum: 0 },
    } as any);
    vi.mocked(getProfileFromAccountId).mockResolvedValue({
      onlineId: 'TestPSNUser',
      aboutMe: '',
      avatars: [{ size: 'xl', url: 'https://example.com/avatar.jpg' }],
      languages: ['en-US'],
      isPlus: false,
      isOfficiallyVerified: false,
      isMe: true,
    } as any);

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/playstation/validate',
      payload: { npssoToken: 'valid-npsso-token' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.valid).toBe(true);
    expect(body.onlineId).toBe('TestPSNUser');
    expect(body.accountId).toBeDefined();
  });

  it('returns 400 with error message for invalid/expired NPSSO token', async () => {
    vi.mocked(exchangeNpssoForAccessCode).mockRejectedValue(new Error('NPSSO token invalid'));

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/playstation/validate',
      payload: { npssoToken: 'invalid-npsso-token' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.valid).toBe(false);
    expect(body.error).toBeDefined();
  });

  it('returns 400 when npssoToken is missing from request body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/playstation/validate',
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });
});
