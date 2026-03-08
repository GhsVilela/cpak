import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const {
  getSettingMock, profileFindByIdMock, profileFindOneMock, profileSaveMock,
  exchangeCodeMock, refreshTokensMock, getXboxProfileMock, getAuthorizeUrlMock,
  syncProfileMock,
} = vi.hoisted(() => ({
  getSettingMock: vi.fn(),
  profileFindByIdMock: vi.fn(),
  profileFindOneMock: vi.fn(),
  profileSaveMock: vi.fn(),
  exchangeCodeMock: vi.fn(),
  refreshTokensMock: vi.fn(),
  getXboxProfileMock: vi.fn(),
  getAuthorizeUrlMock: vi.fn().mockReturnValue('https://login.live.com/auth'),
  syncProfileMock: vi.fn(),
}));

vi.mock('../../../src/services/configService.js', () => ({
  configService: { getSetting: getSettingMock },
}));

vi.mock('../../../src/models/profile.js', () => {
  function ProfileCtor(this: any, data: any) {
    Object.assign(this, data, { _id: 'new-profile-id' });
    this.save = profileSaveMock.mockResolvedValue(undefined);
  }
  ProfileCtor.findById = profileFindByIdMock;
  ProfileCtor.findOne = profileFindOneMock;
  return { Profile: ProfileCtor };
});

vi.mock('../../../src/services/adapters/xbox.js', () => ({
  createXboxAdapter: () => ({
    exchangeCodeForTokens: exchangeCodeMock,
    refreshXboxTokens: refreshTokensMock,
    getXboxProfile: getXboxProfileMock,
    getAuthorizeUrl: getAuthorizeUrlMock,
  }),
}));

vi.mock('../../../src/services/syncService.js', () => ({
  syncService: { syncProfile: syncProfileMock },
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { xboxAuthRoutes } from '../../../src/api/routes/auth.js';

describe('xboxAuthRoutes', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify({ logger: false });
    await app.register(xboxAuthRoutes);
    await app.ready();

    // Default: OAuth settings configured
    getSettingMock.mockImplementation(async (key: string) => {
      if (key === 'xbox_client_id') return 'test-id';
      if (key === 'xbox_client_secret') return 'test-secret';
      if (key === 'xbox_redirect_uri') return 'http://localhost/callback';
      return null;
    });
  });

  // --- GET /url ---

  it('GET /url returns auth URL when settings configured', async () => {
    const res = await app.inject({ method: 'GET', url: '/url' });
    expect(res.statusCode).toBe(200);
    expect(res.json().url).toContain('login.live.com');
  });

  it('GET /url returns 400 when settings not configured', async () => {
    getSettingMock.mockResolvedValue(null);
    const res = await app.inject({ method: 'GET', url: '/url' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Xbox OAuth not configured');
  });

  // --- GET /callback ---

  it('GET /callback redirects on OAuth error', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/callback?error=access_denied&error_description=User+denied',
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('error=xbox_auth_failed');
  });

  it('GET /callback redirects when no code provided', async () => {
    const res = await app.inject({ method: 'GET', url: '/callback' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('No%20authorization%20code');
  });

  it('GET /callback redirects when settings not configured', async () => {
    getSettingMock.mockResolvedValue(null);
    const state = Buffer.from(JSON.stringify({ redirectTo: '/setup', csrf: 'x' })).toString('base64');
    const res = await app.inject({
      method: 'GET',
      url: `/callback?code=auth-code&state=${state}`,
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('Xbox%20OAuth%20not%20configured');
  });

  it('GET /callback updates existing profile on successful auth', async () => {
    exchangeCodeMock.mockResolvedValue({
      xuid: 'xuid-123',
      xstsToken: 'xsts-token',
      userHash: 'uhash',
      refreshToken: 'refresh',
      expiresAt: new Date(),
    });
    getXboxProfileMock.mockResolvedValue({
      xuid: 'xuid-123',
      gamertag: 'TestGamer',
      avatar: 'https://avatar.png',
    });
    // Return existing profile to cover the update path
    profileFindOneMock.mockResolvedValue({
      _id: 'profile-id',
      platform: 'xbox',
      profileId: 'xuid-123',
      displayName: 'OldGamer',
      credentials: {},
      save: vi.fn().mockResolvedValue(undefined),
    });

    const state = Buffer.from(JSON.stringify({ redirectTo: '/setup', csrf: 'x' })).toString('base64');
    const res = await app.inject({
      method: 'GET',
      url: `/callback?code=auth-code&state=${state}`,
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('success=true');
  });

  it('GET /callback creates new profile and triggers auto-sync', async () => {
    exchangeCodeMock.mockResolvedValue({
      xuid: 'xuid-456',
      xstsToken: 'xsts-token',
      userHash: 'uhash',
      refreshToken: 'refresh',
      expiresAt: new Date(),
    });
    getXboxProfileMock.mockResolvedValue({
      xuid: 'xuid-456',
      gamertag: 'NewGamer',
      avatar: 'https://avatar.png',
    });
    profileFindOneMock.mockResolvedValue(null);
    profileSaveMock.mockResolvedValue(undefined);
    syncProfileMock.mockResolvedValue(undefined);

    const state = Buffer.from(JSON.stringify({ redirectTo: '/setup', csrf: 'x' })).toString('base64');
    const res = await app.inject({
      method: 'GET',
      url: `/callback?code=auth-code&state=${state}`,
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('success=true');
    // Auto-sync should have been called for the new profile
    expect(syncProfileMock).toHaveBeenCalled();
  });

  it('GET /callback redirects on auth failure', async () => {
    exchangeCodeMock.mockRejectedValue(new Error('token exchange failed'));
    const state = Buffer.from(JSON.stringify({ redirectTo: '/setup', csrf: 'x' })).toString('base64');
    const res = await app.inject({
      method: 'GET',
      url: `/callback?code=auth-code&state=${state}`,
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('token%20exchange%20failed');
  });

  // --- POST /refresh ---

  it('POST /refresh returns 400 for invalid body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/refresh',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /refresh returns 404 when profile not found', async () => {
    profileFindByIdMock.mockResolvedValue(null);
    const res = await app.inject({
      method: 'POST',
      url: '/refresh',
      payload: { profileId: 'nonexistent' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /refresh returns 400 for non-xbox profile', async () => {
    profileFindByIdMock.mockResolvedValue({ platform: 'steam' });
    const res = await app.inject({
      method: 'POST',
      url: '/refresh',
      payload: { profileId: 'steam-profile' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('not an Xbox profile');
  });

  it('POST /refresh returns 401 when no refreshToken', async () => {
    profileFindByIdMock.mockResolvedValue({
      platform: 'xbox',
      getDecryptedCredentials: () => ({ refreshToken: null }),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/refresh',
      payload: { profileId: 'xbox-profile' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toContain('re-authentication required');
    expect(res.json().authUrl).toBeDefined();
  });

  it('POST /refresh returns 500 when settings not configured', async () => {
    profileFindByIdMock.mockResolvedValue({
      platform: 'xbox',
      getDecryptedCredentials: () => ({ refreshToken: 'rt' }),
    });
    getSettingMock.mockResolvedValue(null);

    const res = await app.inject({
      method: 'POST',
      url: '/refresh',
      payload: { profileId: 'xbox-profile' },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toContain('Xbox OAuth not configured');
  });

  it('POST /refresh returns 401 with authUrl when refresh fails', async () => {
    profileFindByIdMock.mockResolvedValue({
      platform: 'xbox',
      getDecryptedCredentials: () => ({ refreshToken: 'rt' }),
      credentials: {},
      save: vi.fn(),
    });
    // Re-enable settings for the initial check
    getSettingMock.mockImplementation(async (key: string) => {
      if (key === 'xbox_client_id') return 'test-id';
      if (key === 'xbox_client_secret') return 'test-secret';
      if (key === 'xbox_redirect_uri') return 'http://localhost/callback';
      return null;
    });
    refreshTokensMock.mockRejectedValue(new Error('expired'));

    const res = await app.inject({
      method: 'POST',
      url: '/refresh',
      payload: { profileId: 'xbox-profile' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toContain('re-authentication required');
  });

  it('POST /refresh succeeds and returns expiresAt', async () => {
    const expiresAt = new Date('2025-12-31');
    profileFindByIdMock.mockResolvedValue({
      platform: 'xbox',
      getDecryptedCredentials: () => ({ refreshToken: 'rt' }),
      credentials: {},
      save: vi.fn().mockResolvedValue(undefined),
    });
    refreshTokensMock.mockResolvedValue({
      xstsToken: 'new-xsts',
      refreshToken: 'new-rt',
      expiresAt,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/refresh',
      payload: { profileId: 'xbox-profile' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(res.json().expiresAt).toBe(expiresAt.toISOString());
  });
});
