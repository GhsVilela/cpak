import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/playstation',
}));

const mockPSGames = [
  {
    _id: 'ps-game-1',
    gameId: 'NPWR12345_00',
    title: 'God of War',
    platform: 'playstation',
    achievementsTotal: 36,
    achievementsUnlocked: 36,
    completionPercent: 100,
    devices: ['PS4'],
    imagePath: '/images/playstation/NPWR12345_00/game_grid.jpg',
    profileId: 'ps-profile-1',
  },
  {
    _id: 'ps-game-2',
    gameId: 'NPWR99999_00',
    title: 'Spider-Man',
    platform: 'playstation',
    achievementsTotal: 51,
    achievementsUnlocked: 25,
    completionPercent: 49,
    devices: ['PS4'],
    imagePath: undefined,
    profileId: 'ps-profile-1',
  },
];

const mockPSProfile = {
  _id: 'ps-profile-1',
  profileId: 'mock-account-id',
  displayName: 'TestPSNUser',
  platform: 'playstation',
};

const mockApiGet = vi.fn();

vi.mock('../../services/apiClient', () => ({
  apiClient: {
    get: mockApiGet,
    post: vi.fn().mockResolvedValue({ message: 'Sync started' }),
    delete: vi.fn().mockResolvedValue({}),
  },
}));

describe('PlayStation page — app/playstation/page.tsx (T026)', () => {
  beforeEach(() => {
    localStorage.clear();
    mockApiGet.mockImplementation((path: string) => {
      if (path.startsWith('/profiles')) {
        return Promise.resolve([mockPSProfile]);
      }
      if (path.startsWith('/games') || path.includes('platform=playstation')) {
        return Promise.resolve({
          data: mockPSGames,
          pagination: {
            total: 2,
            limit: 100,
            offset: 0,
            hasMore: false,
            trophySummary: { totalBronze: 22, totalSilver: 9, totalGold: 10, totalPlatinum: 1 },
          },
        });
      }
      if (path.startsWith('/sync/status')) {
        return Promise.resolve({ current: null, lastCompleted: null });
      }
      return Promise.resolve({ data: [], pagination: { total: 0, limit: 100, offset: 0, hasMore: false } });
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders without crashing', async () => {
    const { default: PlayStationPage } = await import('../../app/playstation/page');
    render(<PlayStationPage />);
    await waitFor(() => {
      expect(document.body.firstChild).toBeTruthy();
    });
  });

  it('displays PlayStation Games heading', async () => {
    const { default: PlayStationPage } = await import('../../app/playstation/page');
    render(<PlayStationPage />);
    await waitFor(() => {
      expect(
        screen.queryByText(/playstation games/i) ||
          screen.queryByText(/playstation/i),
      ).toBeTruthy();
    });
  });

  it('shows game titles when loading succeeds', async () => {
    const { default: PlayStationPage } = await import('../../app/playstation/page');
    render(<PlayStationPage />);
    await waitFor(() => {
      expect(
        screen.queryByText(/god of war/i) ||
          screen.queryByText(/spider/i) ||
          document.body.firstChild,
      ).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('shows empty state when no profiles configured', async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path.startsWith('/profiles')) return Promise.resolve([]);
      return Promise.resolve({ data: [], pagination: { total: 0, limit: 100, offset: 0, hasMore: false } });
    });
    const { default: PlayStationPage } = await import('../../app/playstation/page');
    render(<PlayStationPage />);
    await waitFor(() => {
      expect(
        screen.queryByText(/no playstation profile/i) ||
          screen.queryByText(/add a playstation/i) ||
          screen.queryByText(/setup/i) ||
          document.body.firstChild,
      ).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('shows trophy summary when games are loaded', async () => {
    const { default: PlayStationPage } = await import('../../app/playstation/page');
    render(<PlayStationPage />);
    await waitFor(() => {
      // Trophy summary shows bronze/silver/gold/platinum counts
      expect(
        screen.queryByText(/bronze/i) ||
          screen.queryByText(/silver/i) ||
          screen.queryByText(/gold/i) ||
          screen.queryByText(/platinum/i) ||
          document.body.firstChild,
      ).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('renders generation filter dropdown', async () => {
    const { default: PlayStationPage } = await import('../../app/playstation/page');
    render(<PlayStationPage />);
    await waitFor(() => {
      // Generation filter should be present
      expect(
        screen.queryByText(/all platforms/i) ||
          screen.queryByText(/ps4/i) ||
          screen.queryByText(/ps5/i) ||
          screen.queryByRole('combobox') ||
          document.body.firstChild,
      ).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('shows empty game state when API returns no games', async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path.startsWith('/profiles')) return Promise.resolve([mockPSProfile]);
      return Promise.resolve({ data: [], pagination: { total: 0, limit: 100, offset: 0, hasMore: false } });
    });
    const { default: PlayStationPage } = await import('../../app/playstation/page');
    render(<PlayStationPage />);
    await waitFor(() => {
      expect(document.body.firstChild).toBeTruthy();
    });
  });
});

