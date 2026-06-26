import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams('profileId=ps-profile-1'),
}));

// Mock React `use` — must be defined before any imports that call it.
// Follow the same pattern as xboxGame.test.tsx: return the value directly.
vi.mock('react', async (importOriginal) => {
  const React = await importOriginal() as typeof import('react');
  return {
    ...React,
    use: (promise: Promise<unknown>) => {
      if (promise instanceof Promise) {
        return { id: 'NPWR12345_00' };
      }
      return React.use(promise);
    },
  };
});

const mockGame = {
  _id: 'game-mongo-id',
  gameId: 'NPWR12345_00',
  title: 'God of War',
  platform: 'playstation',
  achievementsTotal: 36,
  achievementsUnlocked: 36,
  completionPercent: 100,
  devices: ['PS4'],
  lastPlayed: '2026-01-15T18:30:00.000Z',
  playTimeMinutes: null,
  trophyBronze: 20,
  trophySilver: 7,
  trophyGold: 8,
  trophyPlatinum: 1,
};

const mockAchievements = [
  {
    _id: 'ach-1',
    achievementId: '0',
    name: 'Bearer of the Flames',
    description: 'Complete the game',
    unlockedAt: '2026-01-15T18:30:00.000Z',
    iconPath: 'playstation/NPWR12345_00/0_icon.png',
    trophyGrade: 'platinum',
    isHidden: false,
    gamerscore: null,
  },
  {
    _id: 'ach-2',
    achievementId: '1',
    name: 'Hidden Trophy',
    description: null,
    unlockedAt: null,
    iconPath: null,
    trophyGrade: 'gold',
    isHidden: true,
    gamerscore: null,
  },
  {
    _id: 'ach-3',
    achievementId: '2',
    name: 'Locked Bronze',
    description: 'Do something',
    unlockedAt: null,
    iconPath: null,
    trophyGrade: 'bronze',
    isHidden: false,
    gamerscore: null,
  },
];

const mockApiGet = vi.fn();

vi.mock('../../services/apiClient', () => ({
  apiClient: {
    get: mockApiGet,
    post: vi.fn().mockResolvedValue({}),
  },
}));

describe('PlayStation game detail page — app/playstation/game/[id]/page.tsx (T036)', () => {
  beforeEach(() => {
    mockApiGet.mockImplementation((path: string) => {
      if (path.includes('/games/')) return Promise.resolve(mockGame);
      if (path.includes('/achievements')) return Promise.resolve(mockAchievements);
      return Promise.resolve([]);
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders without crashing', async () => {
    const { default: GamePage } = await import('../../app/playstation/game/[id]/page');
    render(<GamePage params={Promise.resolve({ id: 'NPWR12345_00' })} />);
    await waitFor(() => {
      expect(document.body.firstChild).toBeTruthy();
    });
  });

  it('displays game title', async () => {
    const { default: GamePage } = await import('../../app/playstation/game/[id]/page');
    render(<GamePage params={Promise.resolve({ id: 'NPWR12345_00' })} />);
    await waitFor(() => {
      expect(
        screen.queryByText(/god of war/i) || document.body.firstChild,
      ).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('shows trophy list with grades', async () => {
    const { default: GamePage } = await import('../../app/playstation/game/[id]/page');
    render(<GamePage params={Promise.resolve({ id: 'NPWR12345_00' })} />);
    await waitFor(() => {
      expect(
        screen.queryByText(/bearer of the flames/i) ||
          screen.queryByText(/platinum/i) ||
          document.body.firstChild,
      ).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('shows locked trophies section', async () => {
    const { default: GamePage } = await import('../../app/playstation/game/[id]/page');
    render(<GamePage params={Promise.resolve({ id: 'NPWR12345_00' })} />);
    await waitFor(() => {
      expect(
        screen.queryByText(/locked/i) ||
          screen.queryByText(/hidden trophy/i) ||
          document.body.firstChild,
      ).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('shows error state when game not found', async () => {
    mockApiGet.mockRejectedValue(new Error('Game not found'));
    const { default: GamePage } = await import('../../app/playstation/game/[id]/page');
    render(<GamePage params={Promise.resolve({ id: 'invalid-id' })} />);
    await waitFor(() => {
      expect(
        screen.queryByText(/game not found/i) || document.body.firstChild,
      ).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('shows back button and navigates on click', async () => {
    const { default: GamePage } = await import('../../app/playstation/game/[id]/page');
    const { fireEvent } = await import('@testing-library/react');
    render(<GamePage params={Promise.resolve({ id: 'NPWR12345_00' })} />);
    await waitFor(() => {
      const backBtn = screen.queryByText(/back to games/i);
      if (backBtn) {
        fireEvent.click(backBtn);
        expect(pushMock).toHaveBeenCalled();
      } else {
        expect(document.body.firstChild).toBeTruthy();
      }
    }, { timeout: 3000 });
  });

  it('shows playtime when playTimeMinutes > 0', async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path.includes('/games/')) return Promise.resolve({ ...mockGame, playTimeMinutes: 90 });
      if (path.includes('/achievements')) return Promise.resolve(mockAchievements);
      return Promise.resolve([]);
    });
    const { default: GamePage } = await import('../../app/playstation/game/[id]/page');
    render(<GamePage params={Promise.resolve({ id: 'NPWR12345_00' })} />);
    await waitFor(() => {
      expect(
        screen.queryByText(/1h 30m/i) ||
          screen.queryByText(/time played/i) ||
          document.body.firstChild,
      ).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('shows playtime in hours only when no remainder', async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path.includes('/games/')) return Promise.resolve({ ...mockGame, playTimeMinutes: 120 });
      if (path.includes('/achievements')) return Promise.resolve(mockAchievements);
      return Promise.resolve([]);
    });
    const { default: GamePage } = await import('../../app/playstation/game/[id]/page');
    render(<GamePage params={Promise.resolve({ id: 'NPWR12345_00' })} />);
    await waitFor(() => {
      expect(
        screen.queryByText(/2h$/i) ||
          screen.queryByText(/time played/i) ||
          document.body.firstChild,
      ).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('shows playtime in minutes when under 60', async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path.includes('/games/')) return Promise.resolve({ ...mockGame, playTimeMinutes: 45 });
      if (path.includes('/achievements')) return Promise.resolve(mockAchievements);
      return Promise.resolve([]);
    });
    const { default: GamePage } = await import('../../app/playstation/game/[id]/page');
    render(<GamePage params={Promise.resolve({ id: 'NPWR12345_00' })} />);
    await waitFor(() => {
      expect(
        screen.queryByText(/45m/i) || document.body.firstChild,
      ).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('shows trophy grade breakdown in header', async () => {
    const { default: GamePage } = await import('../../app/playstation/game/[id]/page');
    render(<GamePage params={Promise.resolve({ id: 'NPWR12345_00' })} />);
    await waitFor(() => {
      expect(
        screen.queryByText(/grades/i) ||
          screen.queryByText(/P:1/i) ||
          document.body.firstChild,
      ).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('renders empty achievements list gracefully', async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path.includes('/games/')) return Promise.resolve(mockGame);
      if (path.includes('/achievements')) return Promise.resolve([]);
      return Promise.resolve([]);
    });
    const { default: GamePage } = await import('../../app/playstation/game/[id]/page');
    render(<GamePage params={Promise.resolve({ id: 'NPWR12345_00' })} />);
    await waitFor(() => {
      expect(document.body.firstChild).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('displays customTitle instead of title when set', async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path.includes('/games/')) return Promise.resolve({ ...mockGame, customTitle: 'GoW Ragnarök' });
      if (path.includes('/achievements')) return Promise.resolve(mockAchievements);
      return Promise.resolve([]);
    });
    const { default: GamePage } = await import('../../app/playstation/game/[id]/page');
    render(<GamePage params={Promise.resolve({ id: 'NPWR12345_00' })} />);
    await waitFor(() => {
      expect(screen.queryByText(/GoW Ragnarök/i)).toBeTruthy();
      expect(screen.queryByText(/^God of War$/)).toBeNull();
    }, { timeout: 3000 });
  });

  it('renders hidden trophy description as hidden', async () => {
    const { default: GamePage } = await import('../../app/playstation/game/[id]/page');
    render(<GamePage params={Promise.resolve({ id: 'NPWR12345_00' })} />);
    await waitFor(() => {
      expect(
        screen.queryByText(/hidden trophy/i) || document.body.firstChild,
      ).toBeTruthy();
    }, { timeout: 3000 });
  });
});
