import {
  demoProfiles,
  demoGames,
  demoAchievements,
  demoSyncStatus,
  demoSettings,
  demoBackupStatus,
  type DemoGame,
  type DemoProfile,
} from './demoData';

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

/**
 * Removes the deployment basePath (e.g. '/cpak') from a pathname so the mock
 * can match the same routes regardless of where the demo is hosted.
 */
function stripBasePath(pathname: string): string {
  if (!BASE_PATH) return pathname;
  if (pathname === BASE_PATH) return '/';
  if (pathname.startsWith(`${BASE_PATH}/`)) {
    return pathname.slice(BASE_PATH.length) || '/';
  }
  return pathname;
}

function createResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { 'Content-Type': 'application/json' },
  });
}

function isGet(init?: RequestInit): boolean {
  return !init?.method || init.method === 'GET';
}

/** localStorage key holding the demo's "favorite" profile per platform. */
function defaultProfileKey(platform: string): string {
  return `cpak-demo-default-${platform}`;
}

function readStoredDefault(platform: string): string | null {
  try {
    return window.localStorage.getItem(defaultProfileKey(platform));
  } catch {
    return null;
  }
}

function storeDefault(platform: string, profileId: string): void {
  try {
    window.localStorage.setItem(defaultProfileKey(platform), profileId);
  } catch {
    // storage unavailable — the favorite is then only kept for this session
  }
}

/**
 * Mirrors the backend: only one profile per platform can be the default one.
 */
function setDefaultProfile(profileId: string): DemoProfile | undefined {
  const profile = demoProfiles.find((p) => p._id === profileId);
  if (!profile) return undefined;
  for (const p of demoProfiles) {
    if (p.platform === profile.platform) {
      p.isDefault = p._id === profileId;
    }
  }
  storeDefault(profile.platform, profileId);
  return profile;
}

/**
 * Restores the favorite profile chosen in a previous session, so the demo
 * keeps it across reloads.
 */
function restoreDefaultProfiles(): void {
  for (const platform of ['steam', 'xbox', 'playstation']) {
    const stored = readStoredDefault(platform);
    if (!stored) continue;
    const target = demoProfiles.find((p) => p._id === stored && p.platform === platform);
    if (!target) continue;
    for (const p of demoProfiles) {
      if (p.platform === platform) {
        p.isDefault = p._id === stored;
      }
    }
  }
}

function parseBody(init?: RequestInit): Record<string, any> {
  try {
    const body = init?.body;
    if (typeof body === 'string') return JSON.parse(body);
    if (body instanceof URLSearchParams) return Object.fromEntries(body.entries());
  } catch {
    return {};
  }
  return {};
}

/** Applies the same filters the backend applies to /api/games. */
function filterGames(searchParams: URLSearchParams): DemoGame[] {
  const platform = searchParams.get('platform');
  const profileId = searchParams.get('profileId');
  const onlyCompleted = searchParams.get('onlyCompleted') === 'true';
  const excludeHidden = searchParams.get('excludeHidden') === 'true';
  const device = searchParams.get('device');
  const search = searchParams.get('search')?.trim().toLowerCase();

  let games = [...demoGames];

  if (platform) games = games.filter((g) => g.platform === platform);
  if (profileId) games = games.filter((g) => g.profileId === profileId);
  if (onlyCompleted) games = games.filter((g) => g.completionPercent === 100);
  if (excludeHidden) {
    games = games.filter(
      (g) =>
        g.isHidden !== true &&
        !(g.ownershipSource === 'played_history' && g.achievementsFetchFailed === true)
    );
  }
  if (device === 'PlayAnywhere') {
    games = games.filter(
      (g) => g.devices?.includes('PC') && g.devices?.some((d) => d.startsWith('Xbox'))
    );
  } else if (device === 'ConsoleOnly') {
    games = games.filter(
      (g) =>
        g.devices?.some((d) => d.startsWith('Xbox')) && !g.devices?.includes('PC')
    );
  } else if (device) {
    games = games.filter((g) => g.devices?.includes(device));
  }
  if (search) {
    games = games.filter(
      (g) =>
        g.title.toLowerCase().includes(search) ||
        (g.customTitle ?? '').toLowerCase().includes(search)
    );
  }

  const validSortFields = [
    'title',
    'completionPercent',
    'lastSyncedAt',
    'achievementsTotal',
    'currentGamerscore',
  ];
  const sortBy = searchParams.get('sortBy') ?? 'title';
  const sortField = validSortFields.includes(sortBy) ? sortBy : 'title';
  const direction = searchParams.get('sortOrder') === 'desc' ? -1 : 1;

  games.sort((a: any, b: any) => {
    let cmp = 0;
    if (sortField === 'title') {
      cmp = String(a.title).localeCompare(String(b.title));
    } else {
      cmp = (a[sortField] ?? 0) - (b[sortField] ?? 0);
    }
    if (cmp === 0 && sortField === 'completionPercent') {
      cmp = (a.achievementsUnlocked ?? 0) - (b.achievementsUnlocked ?? 0);
    }
    return cmp * direction;
  });

  return games;
}

function buildPagination(
  allGames: DemoGame[],
  page: DemoGame[],
  searchParams: URLSearchParams
) {
  const platform = searchParams.get('platform');
  const profileId = searchParams.get('profileId');
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 1), 500);
  const offset = Math.max(parseInt(searchParams.get('offset') ?? '0', 10) || 0, 0);

  const pagination: Record<string, any> = {
    total: allGames.length,
    limit,
    offset,
    hasMore: offset + page.length < allGames.length,
  };
  if (platform === 'steam' && profileId) {
    pagination.totalAchievementsUnlocked = allGames.reduce(
      (sum, g) => sum + (g.achievementsUnlocked ?? 0),
      0
    );
    pagination.completedTotal = allGames.filter((g) => g.completionPercent === 100).length;
  }

  if (platform === 'xbox' && profileId) {
    pagination.totalCurrentGamerscore = allGames.reduce(
      (sum, g) => sum + (g.currentGamerscore ?? 0),
      0
    );
    pagination.totalMaxGamerscore = allGames.reduce((sum, g) => sum + (g.maxGamerscore ?? 0), 0);
  }

  if (platform === 'playstation' && profileId) {
    pagination.trophySummary = {
      totalBronze: allGames.reduce((sum, g) => sum + (g.trophyBronze ?? 0), 0),
      totalSilver: allGames.reduce((sum, g) => sum + (g.trophySilver ?? 0), 0),
      totalGold: allGames.reduce((sum, g) => sum + (g.trophyGold ?? 0), 0),
      totalPlatinum: allGames.reduce((sum, g) => sum + (g.trophyPlatinum ?? 0), 0),
    };
  }

  return pagination;
}

function handleRequest(url: string, init?: RequestInit): Response | Promise<Response> {
  const parsedUrl = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
  const path = stripBasePath(parsedUrl.pathname);
  const searchParams = parsedUrl.searchParams;

  // Profiles
  if (path === '/api/profiles' && isGet(init)) {
    restoreDefaultProfiles();
    const platform = searchParams.get('platform');
    const profiles = platform
      ? demoProfiles.filter((p) => p.platform === platform)
      : demoProfiles;
    return createResponse(profiles.map((p) => ({ ...p })));
  }
  if (path.match(/^\/api\/profiles\/[^/]+$/) && isGet(init)) {
    const id = decodeURIComponent(path.split('/').pop()!);
    const profile = demoProfiles.find((p) => p._id === id);
    if (!profile) return createResponse({ error: 'Profile not found' }, 404);
    return createResponse({ ...profile });
  }
  if (path.match(/^\/api\/profiles\/[^/]+\/default$/) && init?.method === 'PATCH') {
    const id = decodeURIComponent(path.split('/').slice(3, 4)[0]);
    const profile = setDefaultProfile(id);
    if (!profile) return createResponse({ error: 'Profile not found' }, 404);
    return createResponse({ ...profile });
  }
  if (path.match(/^\/api\/profiles\/[^/]+$/) && init?.method === 'PATCH') {
    const id = decodeURIComponent(path.split('/').pop()!);
    const profile = demoProfiles.find((p) => p._id === id);
    if (!profile) return createResponse({ error: 'Profile not found' }, 404);
    const body = parseBody(init);
    Object.assign(profile, body, { updatedAt: new Date().toISOString() });
    return createResponse({ ...profile });
  }
  if (path.match(/^\/api\/profiles\/[^/]+$/) && init?.method === 'DELETE') {
    return createResponse({ success: true, message: 'Demo mode - operation simulated' });
  }

  // Games
  if (path === '/api/games' && isGet(init)) {
    const games = filterGames(searchParams);
    const limit = Math.min(
      Math.max(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 1),
      500
    );
    const offset = Math.max(parseInt(searchParams.get('offset') ?? '0', 10) || 0, 0);
    const page = games.slice(offset, offset + limit);
    const pagination = buildPagination(games, page, searchParams);
    return createResponse({ data: page, pagination });
  }
  if (path.match(/^\/api\/games\/[^/]+\/hidden$/) && init?.method === 'PATCH') {
    const id = decodeURIComponent(path.split('/')[3]);
    const game = demoGames.find((g) => g._id === id);
    if (!game) return createResponse({ error: 'Game not found' }, 404);
    game.isHidden = !game.isHidden;
    return createResponse({ ...game });
  }
  if (path.match(/^\/api\/games\/[^/]+\/images\/[^/]+$/) && init?.method === 'DELETE') {
    return createResponse({ success: true, message: 'Demo mode - operation simulated' });
  }
  if (path.match(/^\/api\/games\/[^/]+$/) && isGet(init)) {
    const id = decodeURIComponent(path.split('/').pop()!);
    const game = demoGames.find((g) => g._id === id || g.gameId === id);
    if (!game) return createResponse({ error: 'Game not found' }, 404);
    return createResponse({ ...game });
  }
  if (path.match(/^\/api\/games\/[^/]+$/) && init?.method === 'PATCH') {
    const id = decodeURIComponent(path.split('/').pop()!);
    const game = demoGames.find((g) => g._id === id);
    if (!game) return createResponse({ error: 'Game not found' }, 404);
    const body = parseBody(init);
    Object.assign(game, body, { updatedAt: new Date().toISOString() });
    return createResponse({ ...game });
  }

  // Achievements — the backend returns a plain array
  if (path === '/api/achievements' && isGet(init)) {
    const gameId = searchParams.get('gameId');
    const profileId = searchParams.get('profileId');
    let achievements = [...demoAchievements];
    if (gameId) achievements = achievements.filter((a) => a.gameId === gameId);
    if (profileId) achievements = achievements.filter((a) => a.profileId === profileId);
    achievements.sort((a: any, b: any) => {
      const groupOrder = (a.groupOrder ?? 0) - (b.groupOrder ?? 0);
      if (groupOrder !== 0) return groupOrder;
      const unlockedDiff =
        new Date(b.unlockedAt ?? 0).getTime() - new Date(a.unlockedAt ?? 0).getTime();
      if (unlockedDiff !== 0) return unlockedDiff;
      return a.name.localeCompare(b.name);
    });
    return createResponse(achievements);
  }

  // Icons — the frontend requests /api/icons/<path>; redirect to the real image
  if (path.startsWith('/api/icons/')) {
    const target = decodeURIComponent(path.slice('/api/icons/'.length));
    if (/^https?:\/\//.test(target)) {
      return new Response(null, { status: 302, headers: { Location: target } });
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="100%" height="100%" fill="#374151"/><circle cx="32" cy="32" r="20" fill="#6b7280"/></svg>`;
    return new Response(svg, {
      status: 200,
      headers: { 'Content-Type': 'image/svg+xml' },
    });
  }

  // Sync
  if (path === '/api/sync/status' && isGet(init)) {
    const profileId = searchParams.get('profileId');
    const status = profileId ? demoSyncStatus[profileId] : undefined;
    return createResponse(status ?? {});
  }
  if (path.match(/^\/api\/sync\/runs$/) && isGet(init)) {
    return createResponse([]);
  }
  if (path.match(/^\/api\/sync\/cancel\/[^/]+$/) && init?.method === 'DELETE') {
    return createResponse({ success: true, message: 'Demo mode - operation simulated' });
  }
  if (path.match(/^\/api\/sync\/[^/]+$/) && init?.method === 'POST') {
    return createResponse({ message: 'Sync started (demo mode)' });
  }

  // Backup
  if (path === '/api/backup/status' && isGet(init)) {
    return createResponse(JSON.parse(JSON.stringify(demoBackupStatus)));
  }
  if (path === '/api/backup/restore/status' && isGet(init)) {
    return createResponse([]);
  }
  if (path.match(/^\/api\/backup\/[^/]+$/) && init?.method !== 'GET') {
    return createResponse({ success: true, message: 'Demo mode - operation simulated' });
  }

  // Settings
  if (path === '/api/settings' && isGet(init)) {
    return createResponse(JSON.parse(JSON.stringify(demoSettings)));
  }

  // Xbox auth — the demo cannot complete the OAuth flow
  if (path === '/api/auth/xbox/url' && isGet(init)) {
    return createResponse({
      url: 'https://login.live.com/oauth20_authorize.srf?demo=true',
    });
  }

  // Default: return empty success for POST/PUT/PATCH/DELETE in demo
  if (init?.method && init.method !== 'GET') {
    return createResponse({ success: true, message: 'Demo mode - operation simulated' });
  }

  // Fallback
  return createResponse({ error: 'Not found in demo mode' }, 404);
}

export function setupMockApi(): void {
  if (typeof window === 'undefined') return;
  if ((window as any).__DEMO_MOCK_INSTALLED__) return;

  const originalFetch = window.fetch;
  window.fetch = function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    // Intercept API calls. The path is matched on the pathname (minus the
    // deployment basePath) instead of a substring check, so requests are
    // caught no matter how the '/api' prefix is spelled.
    const parsedUrl = new URL(url, window.location.origin);
    const path = stripBasePath(parsedUrl.pathname);
    if (path === '/api' || path.startsWith('/api/')) {
      try {
        const response = handleRequest(url, init);
        if (response instanceof Promise) {
          return response;
        }
        return Promise.resolve(response);
      } catch (error) {
        console.error('Mock API error:', error);
        return Promise.resolve(createResponse({ error: 'Mock API error' }, 500));
      }
    }

    return originalFetch.call(this, input, init);
  };

  (window as any).__DEMO_MOCK_INSTALLED__ = true;
  console.log('%c🎮 CPAK Demo Mode - Using mocked data (no backend required)', 'color: #4ade80; font-weight: bold; font-size: 14px;');
}

// Install the mock as soon as this module is evaluated in the browser, so that
// every request is intercepted — including the ones fired from page effects
// that run before React finishes hydrating the tree.
if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_DEMO_MODE === 'true') {
  setupMockApi();
}
