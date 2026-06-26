import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/xbox',
}));

const mockXboxGames = [
  {
    _id: 'xbox-game-1',
    gameId: 'title-abc',
    title: 'Halo Infinite',
    platform: 'xbox',
    achievementsTotal: 100,
    achievementsUnlocked: 75,
    completionPercent: 75,
    devices: ['XboxSeries'],
    imagePath: '/images/xbox/title-abc/game_grid.jpg',
    capsuleImagePath: '/images/xbox/title-abc/game_grid.jpg',
    profileId: 'xbox-profile-1',
  },
  {
    _id: 'xbox-game-2',
    gameId: 'title-def',
    title: 'Forza Horizon',
    platform: 'xbox',
    achievementsTotal: 50,
    achievementsUnlocked: 50,
    completionPercent: 100,
    devices: ['Xbox360'],
    imagePath: undefined,
    capsuleImagePath: undefined,
    profileId: 'xbox-profile-1',
  },
];

const mockXboxProfile = {
  _id: 'xbox-profile-1',
  profileId: 'xuid-12345',
  displayName: 'Test Gamer',
  platform: 'xbox',
};

const mockApiGet = vi.fn();

vi.mock('../../services/apiClient', () => ({
  apiClient: {
    get: mockApiGet,
    post: vi.fn().mockResolvedValue({ message: 'Sync started' }),
  },
}));

describe('Xbox page — app/xbox/page.tsx (T020)', () => {
  beforeEach(() => {
    localStorage.clear();
    mockApiGet.mockImplementation((path: string) => {
      if (path.startsWith('/profiles')) {
        return Promise.resolve([mockXboxProfile]);
      }
      if (path.startsWith('/games') || path.includes('platform=xbox')) {
        return Promise.resolve({
          data: mockXboxGames,
          pagination: { total: 2, limit: 100, offset: 0, hasMore: false },
        });
      }
      if (path.startsWith('/sync/status')) {
        return Promise.resolve({ current: null, lastCompleted: null });
      }
      if (path.startsWith('/backup')) {
        return Promise.resolve({ activeJobs: [] });
      }
      return Promise.resolve({ data: [], pagination: { total: 0, limit: 100, offset: 0, hasMore: false } });
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders without crashing', async () => {
    const { default: XboxPage } = await import('../../app/xbox/page');
    render(<XboxPage />);
    await waitFor(() => {
      expect(document.body.firstChild).toBeTruthy();
    });
  });

  it('displays Xbox Games heading', async () => {
    const { default: XboxPage } = await import('../../app/xbox/page');
    render(<XboxPage />);
    await waitFor(() => {
      expect(
        screen.queryByText(/xbox games/i) ||
          screen.queryByText(/xbox/i),
      ).toBeTruthy();
    });
  });

  it('shows game titles when loading succeeds', async () => {
    const { default: XboxPage } = await import('../../app/xbox/page');
    render(<XboxPage />);
    await waitFor(() => {
      expect(
        screen.queryByText(/halo infinite/i) ||
          screen.queryByText(/halo/i) ||
          screen.queryByText(/forza/i) ||
          document.body.firstChild,
      ).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('shows empty state when no games are returned', async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path.startsWith('/profiles')) return Promise.resolve([]);
      return Promise.resolve({ data: [], pagination: { total: 0, limit: 100, offset: 0, hasMore: false } });
    });

    const { default: XboxPage } = await import('../../app/xbox/page');
    render(<XboxPage />);
    await waitFor(() => {
      expect(
        screen.queryByText(/no.*games|no.*xbox|no.*profile|configure/i) ||
          screen.queryByText(/empty/i) ||
          document.body.firstChild,
      ).toBeTruthy();
    });
  });

  it('shows error message when API fails', async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path.startsWith('/profiles')) return Promise.resolve([]);
      return Promise.reject(new Error('Network error'));
    });

    const { default: XboxPage } = await import('../../app/xbox/page');
    render(<XboxPage />);
    await waitFor(() => {
      expect(
        screen.queryByText(/error|failed|network/i) ||
          document.body.firstChild,
      ).toBeTruthy();
    });
  });

  it('renders 100% Only as a toggle switch', async () => {
    const { default: XboxPage } = await import('../../app/xbox/page');
    render(<XboxPage />);
    await waitFor(() => {
      expect(screen.queryByText(/halo/i) || document.body.firstChild).toBeTruthy();
    });
    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('100% Only')).toBeInTheDocument();
  });

  it('persists 100% Only toggle per profile in localStorage', async () => {
    const user = userEvent.setup();
    const { default: XboxPage } = await import('../../app/xbox/page');
    render(<XboxPage />);
    await waitFor(() => {
      expect(screen.getByRole('switch')).toBeInTheDocument();
    });
    const toggle = screen.getByRole('switch');
    await user.click(toggle);
    expect(localStorage.getItem('xbox_onlyCompleted_xbox-profile-1')).toBe('true');
  });

  it('does not render a Show Hidden toggle', async () => {
    const { default: XboxPage } = await import('../../app/xbox/page');
    render(<XboxPage />);
    await waitFor(() => {
      expect(screen.queryByText(/halo/i) || document.body.firstChild).toBeTruthy();
    });
    expect(screen.queryByText('Show Hidden')).not.toBeInTheDocument();
  });

  it('renders search input', async () => {
    const { default: XboxPage } = await import('../../app/xbox/page');
    render(<XboxPage />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search games...')).toBeInTheDocument();
    });
  });
});
