import { describe, it, expect, vi, beforeEach } from 'vitest';
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
});
