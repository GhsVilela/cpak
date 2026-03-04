import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

// ---------------------------------------------------------------------------
// Default fixture data
// ---------------------------------------------------------------------------

const mockGame = {
  _id: 'game-1',
  name: 'Test Game',
  platform: 'steam',
  appId: '12345',
  coverUrl: null,
  lastSynced: null,
};

const mockProfile = {
  _id: 'profile-1',
  name: 'Test Profile',
  platform: 'steam',
  platformId: 'steam-user-123',
  avatarUrl: null,
};

const mockAchievement = {
  _id: 'achievement-1',
  name: 'First Win',
  description: 'Win your first game',
  unlocked: false,
  gameId: 'game-1',
  profileId: 'profile-1',
};

const mockSetting = {
  key: 'scheduler.enabled',
  value: 'true',
  category: 'scheduler',
  isSecret: false,
};

const mockSyncStatus = {
  isRunning: false,
  jobId: null,
  progress: null,
};

const mockBackup = {
  _id: 'backup-1',
  profileId: 'profile-1',
  createdAt: new Date().toISOString(),
  size: 1024,
  status: 'completed',
};

// Base URL used by apiClient — must be absolute so Node.js fetch doesn't throw
export const TEST_BASE_URL = 'http://localhost';

// ---------------------------------------------------------------------------
// MSW handlers — one per major API surface (absolute URLs for Node.js compat)
// ---------------------------------------------------------------------------

export const handlers = [
  // --- Games ---
  http.get(`${TEST_BASE_URL}/api/games`, () => HttpResponse.json([mockGame])),
  http.get(`${TEST_BASE_URL}/api/games/:id`, ({ params }) =>
    params.id === 'game-1'
      ? HttpResponse.json(mockGame)
      : HttpResponse.json({ error: 'Game not found' }, { status: 404 }),
  ),

  // --- Profiles ---
  http.get(`${TEST_BASE_URL}/api/profiles`, () => HttpResponse.json([mockProfile])),
  http.post(`${TEST_BASE_URL}/api/profiles`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({ ...mockProfile, ...body }, { status: 201 });
  }),
  http.get(`${TEST_BASE_URL}/api/profiles/:id`, ({ params }) =>
    params.id === 'profile-1'
      ? HttpResponse.json(mockProfile)
      : HttpResponse.json({ error: 'Profile not found' }, { status: 404 }),
  ),
  http.delete(`${TEST_BASE_URL}/api/profiles/:id`, () => new HttpResponse(null, { status: 204 })),

  // --- Sync ---
  http.get(`${TEST_BASE_URL}/api/sync/status`, () => HttpResponse.json(mockSyncStatus)),
  http.post(`${TEST_BASE_URL}/api/sync/:platform`, () =>
    HttpResponse.json({ message: 'Sync started' }, { status: 202 }),
  ),
  http.delete(`${TEST_BASE_URL}/api/sync/cancel/:operationId`, () =>
    HttpResponse.json({ message: 'Sync cancelled' }),
  ),
  http.get(`${TEST_BASE_URL}/api/sync/runs`, () => HttpResponse.json([])),
  http.get(`${TEST_BASE_URL}/api/sync/runs/:id`, ({ params }) =>
    HttpResponse.json({ error: 'Sync run not found' }, { status: 404 }),
  ),

  // --- Achievements ---
  http.get(`${TEST_BASE_URL}/api/achievements`, () => HttpResponse.json([mockAchievement])),

  // --- Settings ---
  http.get(`${TEST_BASE_URL}/api/settings`, () => HttpResponse.json({ settings: [mockSetting] })),
  http.get(`${TEST_BASE_URL}/api/settings/:key`, ({ params }) =>
    params.key === 'scheduler.enabled'
      ? HttpResponse.json(mockSetting)
      : HttpResponse.json({ error: 'Setting not found' }, { status: 404 }),
  ),
  http.put(`${TEST_BASE_URL}/api/settings/:key`, async ({ params, request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({ ...mockSetting, key: params.key, ...body });
  }),
  http.delete(`${TEST_BASE_URL}/api/settings/:key`, () => new HttpResponse(null, { status: 204 })),

  // --- Backup ---
  http.get(`${TEST_BASE_URL}/api/backup/status`, () =>
    HttpResponse.json({ activeJobs: [] }),
  ),
  http.post(`${TEST_BASE_URL}/api/backup/start`, () =>
    HttpResponse.json({ jobId: 'backup-job-1', message: 'Backup started' }, { status: 202 }),
  ),
  http.get(`${TEST_BASE_URL}/api/backup/restore/status`, () => HttpResponse.json([])),
  http.post(`${TEST_BASE_URL}/api/backup/restore/start`, () =>
    HttpResponse.json({ jobId: 'restore-job-1', message: 'Restore started' }, { status: 202 }),
  ),

  // --- Export / Import ---
  http.get(`${TEST_BASE_URL}/api/export`, () =>
    new HttpResponse('{}', {
      headers: { 'Content-Type': 'application/json' },
    }),
  ),
  http.post(`${TEST_BASE_URL}/api/import`, () =>
    HttpResponse.json({ message: 'Import started' }, { status: 202 }),
  ),

  // --- Icons ---
  http.get(`${TEST_BASE_URL}/api/icons/:platform/:gameId/:filename`, ({ params }) =>
    new HttpResponse(new Uint8Array([137, 80, 78, 71]), {
      headers: { 'Content-Type': 'image/png' },
    }),
  ),

  // --- System ---
  http.get(`${TEST_BASE_URL}/api/health`, () => HttpResponse.json({ status: 'ok' })),
  http.get(`${TEST_BASE_URL}/api/version`, () => HttpResponse.json({ version: '0.1.0' })),

  // --- Config (frontend fetches this before making API calls) ---
  http.get(`${TEST_BASE_URL}/config.json`, () =>
    HttpResponse.json({ API_BASE_URL: TEST_BASE_URL }),
  ),

  // --- Xbox Auth ---
  http.get(`${TEST_BASE_URL}/api/auth/xbox/url`, ({ request }) => {
    const url = new URL(request.url);
    const configured = url.searchParams.get('configured') !== 'false';
    if (!configured) {
      return HttpResponse.json(
        { error: 'Xbox OAuth not configured. Please set xbox_client_id and xbox_client_secret in Settings.' },
        { status: 400 },
      );
    }
    return HttpResponse.json({
      url: 'https://login.live.com/oauth20_authorize.srf?client_id=test-client-id&scope=XboxLive.signin+XboxLive.offline_access&response_type=code&redirect_uri=http%3A%2F%2Flocalhost%2Fapi%2Fauth%2Fxbox%2Fcallback&state=test-state',
    });
  }),
  http.get(`${TEST_BASE_URL}/api/auth/xbox/callback`, () =>
    new HttpResponse(null, {
      status: 302,
      headers: { Location: '/xbox?profileId=xuid-12345&success=true' },
    }),
  ),
  http.post(`${TEST_BASE_URL}/api/auth/xbox/refresh`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    if (!body.profileId) {
      return HttpResponse.json({ error: 'profileId is required' }, { status: 400 });
    }
    return HttpResponse.json({
      success: true,
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    });
  }),
];

export const server = setupServer(...handlers);
