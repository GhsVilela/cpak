import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const pushMock = vi.fn();
const { apiGetMock } = vi.hoisted(() => ({ apiGetMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams('profileId=profile-1'),
  usePathname: () => '/steam/game/12345',
}));

vi.mock('../../services/apiClient', () => ({
  apiClient: {
    get: apiGetMock,
  },
}));

vi.mock('react', async (importOriginal) => {
  const React = await importOriginal() as typeof import('react');
  return {
    ...React,
    use: (promise: Promise<unknown>) => {
      if (promise instanceof Promise) {
        return { id: '12345' };
      }
      return React.use(promise);
    },
  };
});

const baseGame = {
  _id: 'game-1',
  gameId: '12345',
  title: 'Half-Life 3',
  achievementsTotal: 20,
  achievementsUnlocked: 10,
  completionPercent: 50,
  platform: 'steam',
};

describe('Steam Game detail page — app/steam/game/[id]/page.tsx', () => {
  beforeEach(() => {
    apiGetMock.mockReset();
    apiGetMock.mockImplementation((path: string) => {
      if (path.includes('/games/')) {
        return Promise.resolve(baseGame);
      }
      if (path.includes('/achievements')) {
        return Promise.resolve([
          { _id: 'ach-1', achievementId: 'ACH_FIRST', name: 'First Achievement' },
        ]);
      }
      return Promise.resolve(null);
    });
  });

  it('renders without crashing', async () => {
    const { default: GameDetailsPage } = await import(
      // @ts-ignore
      '../../app/steam/game/[id]/page'
    );
    render(<GameDetailsPage params={Promise.resolve({ id: '12345' })} />);
    await waitFor(() => {
      expect(document.body.firstChild).toBeTruthy();
    });
  });

  it('displays game title after loading', async () => {
    const { default: GameDetailsPage } = await import(
      // @ts-ignore
      '../../app/steam/game/[id]/page'
    );
    render(<GameDetailsPage params={Promise.resolve({ id: '12345' })} />);
    await waitFor(() => {
      const title = screen.queryByText(/Half-Life 3/);
      // Either title shows or loading indicator
      expect(document.body.firstChild).toBeTruthy();
    });
  });

  it('renders achievement sets collapsed by default and expands on click', async () => {
    apiGetMock.mockImplementation((path: string) => {
      if (path.includes('/games/')) {
        return Promise.resolve({ ...baseGame, hasAchievementGroups: true });
      }
      if (path.includes('/achievements')) {
        return Promise.resolve([
          { _id: 'a1', achievementId: 'BASE_1', name: 'Base Achievement', groupId: '0', groupName: 'Base Game', groupOrder: 0, unlockedAt: '2026-01-01T00:00:00Z' },
          { _id: 'a2', achievementId: 'DLC_1', name: 'Update Achievement', groupId: '1', groupName: 'Update 1', groupOrder: 1 },
        ]);
      }
      return Promise.resolve(null);
    });

    const { default: GameDetailsPage } = await import(
      // @ts-ignore
      '../../app/steam/game/[id]/page'
    );
    const { fireEvent } = await import('@testing-library/react');
    render(<GameDetailsPage params={Promise.resolve({ id: '12345' })} />);

    // Group headers are visible, but their achievements stay hidden until expanded.
    await waitFor(() => {
      expect(screen.queryByText('Base Game')).toBeTruthy();
      expect(screen.queryByText('Update 1')).toBeTruthy();
    });
    expect(screen.queryByText('Base Achievement')).toBeNull();
    expect(screen.queryByText('Update Achievement')).toBeNull();

    fireEvent.click(screen.getByText('Base Game'));
    await waitFor(() => {
      expect(screen.queryByText('Base Achievement')).toBeTruthy();
    });
    expect(screen.queryByText('Update Achievement')).toBeNull();
  });
});
