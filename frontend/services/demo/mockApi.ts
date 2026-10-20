import { demoProfiles, demoGames, demoAchievements, demoSyncStatus, demoSettings, demoBackupStatus } from './demoData';
import { getPlaceholderIcon } from './demoImages';

function createResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { 'Content-Type': 'application/json' },
  });
}

function handleRequest(url: string, init?: RequestInit): Response | Promise<Response> {
  const parsedUrl = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
  const path = parsedUrl.pathname;
  const searchParams = parsedUrl.searchParams;

  // Profiles
  if (path === '/api/profiles' && (!init || init.method === 'GET' || init.method === undefined)) {
    return createResponse(demoProfiles.map(p => ({ ...p })));
  }
  if (path.match(/^\/api\/profiles\/[^/]+$/) && (!init || init.method === 'GET')) {
    const id = path.split('/').pop();
    const profile = demoProfiles.find(p => p._id === id);
    if (!profile) return createResponse({ error: 'Profile not found' }, 404);
    return createResponse(profile);
  }

  // Games
  if (path === '/api/games' && (!init || init.method === 'GET')) {
    const platform = searchParams.get('platform');
    const profileId = searchParams.get('profileId');
    const onlyCompleted = searchParams.get('onlyCompleted') === 'true';
    const showHidden = searchParams.get('showHidden') === 'true';
    const sortBy = searchParams.get('sortBy') || 'completionPercent';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    const search = (searchParams.get('search') || '').toLowerCase();
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    let games = demoGames.filter(g => {
      if (platform && g.platform !== platform) return false;
      if (profileId && g.profileId !== profileId) return false;
      if (onlyCompleted && g.completionPercent < 100) return false;
      if (!showHidden && g.isHidden) return false;
      if (search && !g.title.toLowerCase().includes(search)) return false;
      return true;
    });

    // Sort
    games.sort((a: any, b: any) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    const totalCount = games.length;
    const totalAchievementsUnlocked = games.reduce((sum, g) => sum + g.achievementsUnlocked, 0);
    const paged = games.slice(offset, offset + limit);

    return createResponse({
      games: paged,
      pagination: { totalCount, totalAchievementsUnlocked, limit, offset },
    });
  }

  if (path.match(/^\/api\/games\/[^/]+$/) && (!init || init.method === 'GET')) {
    const id = path.split('/').pop();
    const game = demoGames.find(g => g._id === id);
    if (!game) return createResponse({ error: 'Game not found' }, 404);
    return createResponse(game);
  }

  // Achievements
  if (path === '/api/achievements' && (!init || init.method === 'GET')) {
    const gameId = searchParams.get('gameId');
    const profileId = searchParams.get('profileId');
    let achievements = demoAchievements.filter(a => {
      if (gameId && a.gameId !== gameId) return false;
      if (profileId && a.profileId !== profileId) return false;
      return true;
    });
    return createResponse({ achievements });
  }

  // Sync status
  if (path === '/api/sync/status') {
    const profileId = searchParams.get('profileId');
    if (profileId && demoSyncStatus[profileId]) {
      return createResponse(demoSyncStatus[profileId]);
    }
    return createResponse({ status: 'idle', progress: 100, message: 'Ready' });
  }

  // Backup status
  if (path === '/api/backup/status') {
    return createResponse(demoBackupStatus);
  }

  // Settings
  if (path === '/api/settings') {
    return createResponse(demoSettings);
  }
  if (path.match(/^\/api\/settings\/.+$/)) {
    const key = path.split('/api/settings/')[1];
    const setting = demoSettings.settings.find(s => s.key === key);
    if (!setting) return createResponse({ error: 'Setting not found' }, 404);
    return createResponse(setting);
  }

  // Icons
  if (path.startsWith('/api/icons/')) {
    const seed = path.split('/api/icons/')[1] || 'icon';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="100%" height="100%" fill="#374151"/><circle cx="32" cy="32" r="20" fill="#6b7280"/></svg>`;
    return new Response(svg, {
      status: 200,
      headers: { 'Content-Type': 'image/svg+xml' },
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
    
    // Intercept API calls
    if (url.includes('/api/')) {
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
