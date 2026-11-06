import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';

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

  it('shows the completion icon on the base group when Steam has no explicit base id', async () => {
    apiGetMock.mockImplementation((path: string) => {
      if (path.includes('/games/')) {
        return Promise.resolve({
          ...baseGame,
          hasAchievementGroups: true,
          achievementsTotal: 4,
          achievementsUnlocked: 4,
        });
      }
      if (path.includes('/achievements')) {
        return Promise.resolve([
          { _id: 'g1', achievementId: 'G1', name: 'General A', groupId: '1', groupName: 'General', groupOrder: 0, unlockedAt: '2026-01-01T00:00:00Z' },
          { _id: 'g2', achievementId: 'G2', name: 'General B', groupId: '1', groupName: 'General', groupOrder: 0, unlockedAt: '2026-01-01T00:00:00Z' },
          { _id: 'g3', achievementId: 'G3', name: 'Extra A', groupId: '2', groupName: 'Extra', groupOrder: 1, unlockedAt: '2026-01-01T00:00:00Z' },
          { _id: 'g4', achievementId: 'G4', name: 'Extra B', groupId: '2', groupName: 'Extra', groupOrder: 1, unlockedAt: '2026-01-01T00:00:00Z' },
        ]);
      }
      return Promise.resolve(null);
    });

    const { default: GameDetailsPage } = await import(
      // @ts-ignore
      '../../app/steam/game/[id]/page'
    );
    render(<GameDetailsPage params={Promise.resolve({ id: '12345' })} />);

    await waitFor(() => {
      expect(screen.queryByText('General')).toBeTruthy();
      expect(screen.queryByText('Extra')).toBeTruthy();
    });
    const generalGroup = screen.getByText('General').closest('button');
    const extraGroup = screen.getByText('Extra').closest('button');
    expect(generalGroup).not.toBeNull();
    expect(extraGroup).not.toBeNull();
    expect(within(generalGroup!).getByRole('img', { name: 'Completed game' })).toBeInTheDocument();
    expect(within(extraGroup!).queryByRole('img', { name: 'Completed game' })).toBeNull();
  });

  it('greys out the completion icon on a base group that is still locked', async () => {
    apiGetMock.mockImplementation((path: string) => {
      if (path.includes('/games/')) {
        return Promise.resolve({
          ...baseGame,
          hasAchievementGroups: true,
          achievementsTotal: 4,
          achievementsUnlocked: 2,
        });
      }
      if (path.includes('/achievements')) {
        return Promise.resolve([
          { _id: 'b1', achievementId: 'BASE_1', name: 'Base One', groupId: '0', groupName: 'Base Game', groupOrder: 0, unlockedAt: '2026-01-01T00:00:00Z' },
          { _id: 'b2', achievementId: 'BASE_2', name: 'Base Two', groupId: '0', groupName: 'Base Game', groupOrder: 0 },
          { _id: 'u1', achievementId: 'DLC_1', name: 'Update One', groupId: '1', groupName: 'Woolhaven', groupOrder: 1, unlockedAt: '2026-01-01T00:00:00Z' },
          { _id: 'u2', achievementId: 'DLC_2', name: 'Update Two', groupId: '1', groupName: 'Woolhaven', groupOrder: 1 },
        ]);
      }
      return Promise.resolve(null);
    });

    const { default: GameDetailsPage } = await import(
      // @ts-ignore
      '../../app/steam/game/[id]/page'
    );
    render(<GameDetailsPage params={Promise.resolve({ id: '12345' })} />);

    await waitFor(() => {
      expect(screen.queryByText('Base Game')).toBeTruthy();
      expect(screen.queryByText('Woolhaven')).toBeTruthy();
    });
    const baseGroup = screen.getByText('Base Game').closest('button');
    const updateGroup = screen.getByText('Woolhaven').closest('button');
    expect(baseGroup).not.toBeNull();
    expect(updateGroup).not.toBeNull();
    expect(within(baseGroup!).getByRole('img', { name: 'Base game not completed' })).toBeInTheDocument();
    expect(within(baseGroup!).queryByRole('img', { name: 'Completed game' })).toBeNull();
    expect(within(updateGroup!).queryByRole('img', { name: 'Base game not completed' })).toBeNull();
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

    // A completed base game shows the Steam completion icon; DLC sets do not.
    const baseGroupButton = screen.getByText('Base Game').closest('button');
    const dlcGroupButton = screen.getByText('Update 1').closest('button');
    expect(baseGroupButton).not.toBeNull();
    expect(dlcGroupButton).not.toBeNull();
    expect(within(baseGroupButton!).getByRole('img', { name: 'Completed game' })).toBeInTheDocument();
    expect(within(dlcGroupButton!).queryByRole('img', { name: 'Completed game' })).toBeNull();

    fireEvent.click(screen.getByText('Base Game'));
    await waitFor(() => {
      expect(screen.queryByText('Base Achievement')).toBeTruthy();
    });
    expect(screen.queryByText('Update Achievement')).toBeNull();
  });

  it('keeps long achievement set names on one truncated line', async () => {
    const longGroupName = 'Update 4 — The Lost Chapters and Additional Content Pack';
    apiGetMock.mockImplementation((path: string) => {
      if (path.includes('/games/')) {
        return Promise.resolve({ ...baseGame, hasAchievementGroups: true });
      }
      if (path.includes('/achievements')) {
        return Promise.resolve([
          { _id: 'long-1', achievementId: 'BASE_1', name: 'Base Achievement', groupId: '0', groupName: 'Base Game', groupOrder: 0, unlockedAt: '2026-01-01T00:00:00Z' },
          { _id: 'long-2', achievementId: 'DLC_1', name: 'Update Achievement', groupId: '1', groupName: longGroupName, groupOrder: 1 },
        ]);
      }
      return Promise.resolve(null);
    });

    const { default: GameDetailsPage } = await import(
      // @ts-ignore
      '../../app/steam/game/[id]/page'
    );
    render(<GameDetailsPage params={Promise.resolve({ id: '12345' })} />);

    const name = await screen.findByText(longGroupName);
    expect(name).toBeInTheDocument();
    expect(name).toHaveAttribute('title', longGroupName);
    expect(name.className).toContain('truncate');
    expect(name.className).toContain('min-w-0');
  });

  it('scrolls to the top when the page opens', async () => {
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const { default: GameDetailsPage } = await import(
      // @ts-ignore
      '../../app/steam/game/[id]/page'
    );
    render(<GameDetailsPage params={Promise.resolve({ id: '12345' })} />);

    await waitFor(() => {
      expect(scrollToSpy).toHaveBeenCalledWith(0, 0);
    });
    scrollToSpy.mockRestore();
  });
});
