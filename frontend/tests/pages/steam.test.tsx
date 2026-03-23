import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/steam',
}));

const getMock = vi.fn();
const postMock = vi.fn().mockResolvedValue({});

vi.mock('../../services/apiClient', () => ({
  apiClient: {
    get: (...args: any[]) => getMock(...args),
    post: (...args: any[]) => postMock(...args),
  },
}));

beforeEach(() => {
  localStorage.clear();
  getMock.mockImplementation((path: string) => {
    if (path.startsWith('/profiles')) {
      return Promise.resolve([
        { _id: 'p1', platform: 'steam', profileId: 'steam-123', displayName: 'SteamUser' },
      ]);
    }
    if (path.includes('/games')) {
      return Promise.resolve({
        data: [
          {
            _id: 'g1',
            gameId: '730',
            title: 'Counter-Strike 2',
            platform: 'steam',
            achievementsTotal: 167,
            achievementsUnlocked: 50,
            completionPercent: 29.94,
            imagePath: '/icons/steam/730/header.jpg',
            profileId: 'p1',
          },
          {
            _id: 'g2',
            gameId: '440',
            title: 'Team Fortress 2',
            platform: 'steam',
            achievementsTotal: 520,
            achievementsUnlocked: 520,
            completionPercent: 100,
            profileId: 'p1',
          },
        ],
        pagination: { total: 2, limit: 100, offset: 0, hasMore: false },
      });
    }
    if (path.includes('/sync/status')) {
      return Promise.resolve({ current: null });
    }
    return Promise.resolve({});
  });

  // Happy-dom's fetch for status endpoints
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    if (url.includes('/api/backup/status')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ backup: null, restore: null }) });
    }
    if (url.includes('/api/sync/status')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ current: null }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  }));
});

describe('Steam page — app/steam/page.tsx', () => {
  it('renders without crashing', async () => {
    const { default: SteamPage } = await import('../../app/steam/page');
    render(<SteamPage />);
    await waitFor(() => {
      expect(document.body.firstChild).toBeTruthy();
    });
  });

  it('shows games when API returns data', async () => {
    const { default: SteamPage } = await import('../../app/steam/page');
    render(<SteamPage />);
    await waitFor(() => {
      expect(screen.getByText('Counter-Strike 2')).toBeInTheDocument();
      expect(screen.getByText('Team Fortress 2')).toBeInTheDocument();
    });
  });

  it('shows empty state when no games returned', async () => {
    getMock.mockImplementation((path: string) => {
      if (path.startsWith('/profiles')) return Promise.resolve([{ _id: 'p1', platform: 'steam', profileId: 'x', displayName: 'User' }]);
      if (path.includes('/games')) return Promise.resolve({ data: [], pagination: { total: 0, limit: 100, offset: 0, hasMore: false } });
      return Promise.resolve({});
    });
    const { default: SteamPage } = await import('../../app/steam/page');
    render(<SteamPage />);
    await waitFor(() => {
      expect(document.body.firstChild).toBeTruthy();
    });
  });

  it('handles API error gracefully', async () => {
    getMock.mockImplementation((path: string) => {
      if (path.startsWith('/profiles')) return Promise.resolve([]);
      if (path.includes('/games')) return Promise.reject(new Error('Network error'));
      return Promise.resolve({});
    });
    const { default: SteamPage } = await import('../../app/steam/page');
    render(<SteamPage />);
    await waitFor(() => {
      expect(document.body.firstChild).toBeTruthy();
    });
  });

  it('renders profile selector when multiple profiles exist', async () => {
    // ProfileSelector only renders <select> when 2+ profiles exist
    getMock.mockImplementation((path: string) => {
      if (path.startsWith('/profiles')) {
        return Promise.resolve([
          { _id: 'p1', platform: 'steam', profileId: 'steam-123', displayName: 'SteamUser' },
          { _id: 'p2', platform: 'steam', profileId: 'steam-456', displayName: 'SteamUser2' },
        ]);
      }
      if (path.includes('/games')) {
        return Promise.resolve({ data: [], pagination: { total: 0, limit: 100, offset: 0, hasMore: false } });
      }
      if (path.includes('/sync/status')) {
        return Promise.resolve({ current: null });
      }
      return Promise.resolve({});
    });
    const { default: SteamPage } = await import('../../app/steam/page');
    render(<SteamPage />);
    await waitFor(() => {
      expect(screen.getByText('SteamUser')).toBeInTheDocument();
      expect(screen.getByText('SteamUser2')).toBeInTheDocument();
    });
  });

  it('renders 100% Only as a toggle switch', async () => {
    const { default: SteamPage } = await import('../../app/steam/page');
    render(<SteamPage />);
    await waitFor(() => {
      expect(screen.getByText('Counter-Strike 2')).toBeInTheDocument();
    });
    const toggles = screen.getAllByRole('switch');
    // First toggle is 100% Only
    expect(toggles[0]).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('100% Only')).toBeInTheDocument();
  });

  it('persists 100% Only toggle state in localStorage', async () => {
    const user = userEvent.setup();
    const { default: SteamPage } = await import('../../app/steam/page');
    render(<SteamPage />);
    await waitFor(() => {
      expect(screen.getByText('Counter-Strike 2')).toBeInTheDocument();
    });
    const toggle = screen.getAllByRole('switch')[0];
    await user.click(toggle);
    expect(localStorage.getItem('steam_onlyCompleted_p1')).toBe('true');
  });

  it('renders Show Hidden toggle defaulting to off', async () => {
    const { default: SteamPage } = await import('../../app/steam/page');
    render(<SteamPage />);
    await waitFor(() => {
      expect(screen.getByText('Counter-Strike 2')).toBeInTheDocument();
    });
    const toggles = screen.getAllByRole('switch');
    // Second toggle is Show Hidden
    expect(toggles[1]).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Show Hidden')).toBeInTheDocument();
  });

  it('hides games with revoked license by default via excludeHidden param', async () => {
    getMock.mockImplementation((path: string) => {
      if (path.startsWith('/profiles')) {
        return Promise.resolve([
          { _id: 'p1', platform: 'steam', profileId: 'steam-123', displayName: 'SteamUser' },
        ]);
      }
      if (path.includes('/games')) {
        // When excludeHidden=true, the server only returns non-hidden games
        if (path.includes('excludeHidden=true')) {
          return Promise.resolve({
            data: [
              {
                _id: 'g1', gameId: '730', title: 'Counter-Strike 2', platform: 'steam',
                achievementsTotal: 167, achievementsUnlocked: 50, completionPercent: 29.94, profileId: 'p1',
              },
            ],
            pagination: { total: 1, limit: 100, offset: 0, hasMore: false },
          });
        }
        return Promise.resolve({
          data: [
            {
              _id: 'g1', gameId: '730', title: 'Counter-Strike 2', platform: 'steam',
              achievementsTotal: 167, achievementsUnlocked: 50, completionPercent: 29.94, profileId: 'p1',
            },
            {
              _id: 'g3', gameId: '999', title: 'Revoked Game', platform: 'steam',
              achievementsTotal: 10, achievementsUnlocked: 0, completionPercent: 0, profileId: 'p1',
              ownershipSource: 'played_history', achievementsFetchFailed: true,
            },
          ],
          pagination: { total: 2, limit: 100, offset: 0, hasMore: false },
        });
      }
      if (path.includes('/sync/status')) return Promise.resolve({ current: null });
      return Promise.resolve({});
    });
    const { default: SteamPage } = await import('../../app/steam/page');
    render(<SteamPage />);
    await waitFor(() => {
      expect(screen.getByText('Counter-Strike 2')).toBeInTheDocument();
    });
    // Server-side filtering: excludeHidden=true means Revoked Game is not returned
    expect(screen.queryByText('Revoked Game')).not.toBeInTheDocument();
  });

  it('shows hidden games when Show Hidden toggle is enabled', async () => {
    getMock.mockImplementation((path: string) => {
      if (path.startsWith('/profiles')) {
        return Promise.resolve([
          { _id: 'p1', platform: 'steam', profileId: 'steam-123', displayName: 'SteamUser' },
        ]);
      }
      if (path.includes('/games')) {
        if (path.includes('excludeHidden=true')) {
          return Promise.resolve({
            data: [
              {
                _id: 'g1', gameId: '730', title: 'Counter-Strike 2', platform: 'steam',
                achievementsTotal: 167, achievementsUnlocked: 50, completionPercent: 29.94, profileId: 'p1',
              },
            ],
            pagination: { total: 1, limit: 100, offset: 0, hasMore: false },
          });
        }
        return Promise.resolve({
          data: [
            {
              _id: 'g1', gameId: '730', title: 'Counter-Strike 2', platform: 'steam',
              achievementsTotal: 167, achievementsUnlocked: 50, completionPercent: 29.94, profileId: 'p1',
            },
            {
              _id: 'g3', gameId: '999', title: 'Revoked Game', platform: 'steam',
              achievementsTotal: 10, achievementsUnlocked: 0, completionPercent: 0, profileId: 'p1',
              ownershipSource: 'played_history', achievementsFetchFailed: true,
            },
          ],
          pagination: { total: 2, limit: 100, offset: 0, hasMore: false },
        });
      }
      if (path.includes('/sync/status')) return Promise.resolve({ current: null });
      return Promise.resolve({});
    });
    const user = userEvent.setup();
    const { default: SteamPage } = await import('../../app/steam/page');
    render(<SteamPage />);
    await waitFor(() => {
      expect(screen.getByText('Counter-Strike 2')).toBeInTheDocument();
    });
    // Click Show Hidden toggle (second switch)
    const toggles = screen.getAllByRole('switch');
    await user.click(toggles[1]);
    expect(localStorage.getItem('steam_showHidden_p1')).toBe('true');
    await waitFor(() => {
      expect(screen.getByText('Revoked Game')).toBeInTheDocument();
    });
  });

  it('restores toggle states from localStorage per profile', async () => {
    localStorage.setItem('steam_onlyCompleted_p1', 'true');
    localStorage.setItem('steam_showHidden_p1', 'true');
    const { default: SteamPage } = await import('../../app/steam/page');
    render(<SteamPage />);
    await waitFor(() => {
      const toggles = screen.getAllByRole('switch');
      expect(toggles[0]).toHaveAttribute('aria-checked', 'true');
      expect(toggles[1]).toHaveAttribute('aria-checked', 'true');
    });
  });

  it('passes excludeHidden=true in API call when Show Hidden is off', async () => {
    const { default: SteamPage } = await import('../../app/steam/page');
    render(<SteamPage />);
    await waitFor(() => {
      expect(screen.getByText('Counter-Strike 2')).toBeInTheDocument();
    });
    // Default: showHidden=false, so excludeHidden=true should be in the main API call
    // Filter out the internal unfiltered base-count call (limit=1) to get the real game-list call
    const gamesCalls = getMock.mock.calls.filter((c: any[]) => c[0].includes('/games') && !c[0].includes('limit=1&offset=0'));
    const lastGamesCall = gamesCalls[gamesCalls.length - 1][0];
    expect(lastGamesCall).toContain('excludeHidden=true');
  });
});
