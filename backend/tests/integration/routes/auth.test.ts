import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestServer, teardownTestServer } from '../../helpers/server.js';
import { Profile } from '../../../src/models/profile.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../src/services/configService.js', () => ({
  configService: {
    getSetting: vi.fn(),
    getAllSettings: vi.fn().mockResolvedValue([]),
    updateSetting: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@xboxreplay/xboxlive-auth', () => ({
  live: {
    getAuthorizeUrl: vi.fn().mockReturnValue(
      'https://login.live.com/oauth20_authorize.srf?client_id=test-client&scope=XboxLive.signin+XboxLive.offline_access&response_type=code&redirect_uri=http%3A%2F%2Flocalhost%2Fapi%2Fauth%2Fxbox%2Fcallback',
    ),
    exchangeCodeForAccessToken: vi.fn().mockResolvedValue({
      token_type: 'bearer',
      expires_in: 3600,
      access_token: 'mock-live-access-token',
      refresh_token: 'mock-live-refresh-token',
      scope: 'XboxLive.signin XboxLive.offline_access',
      user_id: 'mock-user-id',
    }),
    refreshAccessToken: vi.fn().mockResolvedValue({
      token_type: 'bearer',
      expires_in: 3600,
      access_token: 'mock-live-access-token-refreshed',
      refresh_token: 'mock-live-refresh-token',
      scope: 'XboxLive.signin XboxLive.offline_access',
      user_id: 'mock-user-id',
    }),
  },
  xnet: {
    exchangeRpsTicketForUserToken: vi.fn().mockResolvedValue({
      IssueInstant: new Date().toISOString(),
      NotAfter: new Date(Date.now() + 86400000).toISOString(),
      Token: 'mock-user-token',
      DisplayClaims: { xui: [{ uhs: 'mock-user-hash' }] },
    }),
    exchangeTokenForXSTSToken: vi.fn().mockResolvedValue({
      IssueInstant: new Date().toISOString(),
      NotAfter: new Date(Date.now() + 86400000).toISOString(),
      Token: 'mock-xsts-token',
      DisplayClaims: { xui: [{ xid: 'mock-xuid-12345', uhs: 'mock-user-hash' }] },
    }),
  },
  XSAPIClient: {
    get: vi.fn().mockResolvedValue({
      data: {
        profileUsers: [
          {
            id: 'mock-xuid-12345',
            settings: [
              { id: 'Gamertag', value: 'MockGamertag' },
              { id: 'GameDisplayPicRaw', value: 'https://example.com/avatar.png' },
            ],
          },
        ],
      },
    }),
  },
}));

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

let app: FastifyInstance;

beforeAll(async () => {
  app = await createTestServer();
});

afterAll(async () => {
  await teardownTestServer();
});

describe('GET /api/auth/xbox/url', () => {
  beforeEach(async () => {
    const { configService } = await import('../../../src/services/configService.js');
    vi.mocked(configService.getSetting).mockReset();
  });

  it('returns 400 when xbox_client_id is not configured', async () => {
    const { configService } = await import('../../../src/services/configService.js');
    vi.mocked(configService.getSetting).mockResolvedValue(undefined);

    const res = await app.inject({ method: 'GET', url: '/api/auth/xbox/url' });
    expect(res.statusCode).toBe(400);
    const body = res.json<{ error: string }>();
    expect(body.error).toMatch(/Xbox OAuth not configured/i);
  });

  it('returns 200 with authorization URL when settings are configured', async () => {
    const { configService } = await import('../../../src/services/configService.js');
    vi.mocked(configService.getSetting).mockImplementation(async (key: string) => {
      if (key === 'xbox_client_id') return 'test-client-id';
      if (key === 'xbox_client_secret') return 'test-client-secret';
      if (key === 'xbox_redirect_uri') return 'http://localhost/api/auth/xbox/callback';
      return undefined;
    });

    const res = await app.inject({ method: 'GET', url: '/api/auth/xbox/url' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ url: string }>();
    expect(body.url).toContain('login.live.com');
    expect(body.url).toContain('client_id=test-client-id');
  });

  it('includes redirectTo in state parameter when provided', async () => {
    const { configService } = await import('../../../src/services/configService.js');
    vi.mocked(configService.getSetting).mockImplementation(async (key: string) => {
      if (key === 'xbox_client_id') return 'test-client-id';
      if (key === 'xbox_client_secret') return 'test-client-secret';
      if (key === 'xbox_redirect_uri') return 'http://localhost/api/auth/xbox/callback';
      return undefined;
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/xbox/url?redirectTo=/xbox',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ url: string }>();
    expect(body.url).toContain('state=');
  });
});

describe('GET /api/auth/xbox/callback', () => {
  beforeEach(async () => {
    const { configService } = await import('../../../src/services/configService.js');
    vi.mocked(configService.getSetting).mockReset();
    vi.mocked(configService.getSetting).mockImplementation(async (key: string) => {
      if (key === 'xbox_client_id') return 'test-client-id';
      if (key === 'xbox_client_secret') return 'test-client-secret';
      if (key === 'xbox_redirect_uri') return 'http://localhost/api/auth/xbox/callback';
      return undefined;
    });
  });

  it('redirects to error URL when Microsoft returns an error', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/xbox/callback?error=access_denied&error_description=User+denied+access&state=eyJyZWRpcmVjdFRvIjoiL3NldHVwIn0=',
    });
    expect(res.statusCode).toBe(302);
    const location = res.headers['location'] as string;
    expect(location).toContain('error=xbox_auth_failed');
  });

  it('creates a new profile and redirects on successful OAuth callback', async () => {
    const state = Buffer.from(JSON.stringify({ redirectTo: '/setup', csrf: 'test-token' })).toString('base64');

    const res = await app.inject({
      method: 'GET',
      url: `/api/auth/xbox/callback?code=mock-auth-code&state=${state}`,
    });

    expect(res.statusCode).toBe(302);
    const location = res.headers['location'] as string;
    expect(location).toContain('xboxProfileId=');
    expect(location).toContain('success=true');

    // Verify profile was created with the XUID
    const profile = await Profile.findOne({ platform: 'xbox', profileId: 'mock-xuid-12345' });
    expect(profile).toBeTruthy();
    expect(profile?.displayName).toBe('MockGamertag');
  });

  it('upserts (updates) an existing profile with the same XUID', async () => {
    // Pre-create a profile
    await Profile.create({
      platform: 'xbox',
      profileId: 'mock-xuid-12345',
      displayName: 'Old Gamertag',
      credentials: {},
    });

    const state = Buffer.from(JSON.stringify({ redirectTo: '/setup', csrf: 'test-token' })).toString('base64');

    const res = await app.inject({
      method: 'GET',
      url: `/api/auth/xbox/callback?code=mock-auth-code&state=${state}`,
    });

    expect(res.statusCode).toBe(302);

    // Should still have only one profile with this XUID
    const profiles = await Profile.find({ platform: 'xbox', profileId: 'mock-xuid-12345' });
    expect(profiles).toHaveLength(1);
    expect(profiles[0].displayName).toBe('MockGamertag'); // Updated
  });
});

describe('POST /api/auth/xbox/refresh', () => {
  it('returns 400 when profileId is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/xbox/refresh',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when profile does not exist', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/xbox/refresh',
      payload: { profileId: '000000000000000000000000' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when profile is not an Xbox profile', async () => {
    const profile = await Profile.create({
      platform: 'steam',
      profileId: 'steam-test-id',
      displayName: 'Steam User',
      credentials: {},
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/xbox/refresh',
      payload: { profileId: profile._id.toString() },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json<{ error: string }>();
    expect(body.error).toContain('not an Xbox profile');
  });

  it('returns 200 with new expiry on successful refresh', async () => {
    const { configService } = await import('../../../src/services/configService.js');
    vi.mocked(configService.getSetting).mockImplementation(async (key: string) => {
      if (key === 'xbox_client_id') return 'test-client-id';
      if (key === 'xbox_client_secret') return 'test-client-secret';
      return undefined;
    });

    const profile = await Profile.create({
      platform: 'xbox',
      profileId: 'refresh-test-xuid',
      displayName: 'Refresh Test User',
      credentials: {
        refreshToken: 'old-refresh-token',
        tokenType: 'bearer',
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/xbox/refresh',
      payload: { profileId: profile._id.toString() },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ success: boolean; expiresAt: string }>();
    expect(body.success).toBe(true);
    expect(body.expiresAt).toBeTruthy();
  });
});
