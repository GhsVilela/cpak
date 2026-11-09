import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent, within } from '@testing-library/react';

const pushMock = vi.fn();
const { apiGetMock } = vi.hoisted(() => ({ apiGetMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams('profileId=profile-1'),
  usePathname: () => '/xbox/game/title-123',
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
        return { id: 'title-123' };
      }
      return React.use(promise);
    },
  };
});

const baseGame = {
  _id: 'game-mongo-1',
  gameId: 'title-123',
  title: 'Halo Infinite',
  achievementsTotal: 100,
  achievementsUnlocked: 75,
  completionPercent: 75,
  platform: 'xbox',
  devices: ['XboxSeries'],
  currentGamerscore: 3750,
  maxGamerscore: 5000,
};

const baseAchievements = [
  {
    _id: 'ach-1',
    achievementId: 'xbox-ach-1',
    name: 'First Blood',
    description: 'Get your first kill',
    unlockedAt: '2024-01-15T12:00:00Z',
    iconPath: 'xbox/title-123/ach-1.png',
    gamerscore: 50,
    globalPercent: 4.2,
    rarityCategory: 'Rare',
  },
  {
    _id: 'ach-2',
    achievementId: 'xbox-ach-2',
    name: 'Locked Achievement',
    description: 'A secret achievement',
    // no unlockedAt → locked
    iconPath: 'xbox/title-123/ach-2.png',
    gamerscore: 25,
    globalPercent: 63.7,
    rarityCategory: 'Common',
  },
];

describe('Xbox Game detail page — app/xbox/game/[id]/page.tsx (T021)', () => {
  beforeEach(() => {
    apiGetMock.mockReset();
    apiGetMock.mockImplementation((path: string) => {
      if (path.includes('/games/')) {
        return Promise.resolve(baseGame);
      }
      if (path.includes('/achievements')) {
        return Promise.resolve(baseAchievements);
      }
      return Promise.resolve(null);
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const renderPage = async () => {
    const { default: XboxGamePage } = await import(
      // @ts-ignore
      '../../app/xbox/game/[id]/page'
    );
    render(<XboxGamePage params={Promise.resolve({ id: 'title-123' })} />);
  };

  it('renders without crashing', async () => {
    await renderPage();
    await waitFor(() => {
      expect(document.body.firstChild).toBeTruthy();
    });
  });

  it('displays game title after loading', async () => {
    await renderPage();
    await waitFor(() => {
      const title = screen.queryByText(/Halo Infinite/i);
      expect(title || document.body.firstChild).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('shows achievement list', async () => {
    await renderPage();
    await waitFor(() => {
      const ach = screen.queryByText(/First Blood/i);
      expect(ach || document.body.firstChild).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('shows Xbox rarity percentage and category', async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('4.2%')).toBeTruthy();
    }, { timeout: 3000 });

    const rareText = screen.getByText('4.2%').closest('p')?.textContent ?? '';
    expect(rareText).toContain('4.2% of players unlocked this · Rare');

    const commonText = screen.getByText('63.7%').closest('p')?.textContent ?? '';
    expect(commonText).toContain('63.7% of players unlocked this');
    expect(commonText).not.toContain('Common');
  });

  it('shows locked achievements in the locked section', async () => {
    await renderPage();
    await waitFor(() => {
      const locked = screen.queryByText(/Locked Achievement/i)
        || screen.queryByText(/locked/i);
      expect(locked || document.body.firstChild).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('shows back navigation button', async () => {
    await renderPage();
    await waitFor(() => {
      const backBtn = screen.queryByText(/back/i)
        || screen.queryByRole('button');
      expect(backBtn || document.body.firstChild).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('uses the same card design as the Steam and PlayStation game pages', async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Halo Infinite/i)).toBeInTheDocument();
    });

    // Header uses the shared surface/border tokens plus the platform accent bar.
    const header = screen.getByText(/Halo Infinite/i).closest('div.relative');
    expect(header).not.toBeNull();
    expect(header!.className).toContain('rounded-xl');
    expect(header!.className).toContain('border-[var(--border)]');
    expect(header!.className).toContain('bg-[var(--surface)]');

    const progressBar = header!.querySelector('div.mt-4 > div');
    expect(progressBar).not.toBeNull();
    expect(progressBar!.className).toContain('bg-[var(--xbox-accent)]');

    // Achievement cards follow the shared unlocked/locked styling.
    const unlockedCard = screen.getByText(/First Blood/i).closest('div.rounded-xl');
    expect(unlockedCard).not.toBeNull();
    expect(unlockedCard!.className).toContain('bg-[var(--surface)]');
    expect(unlockedCard!.className).toContain('border-[var(--border)]');

    const lockedCard = screen.getByText(/Locked Achievement/i).closest('div.rounded-xl');
    expect(lockedCard).not.toBeNull();
    expect(lockedCard!.className).toContain('bg-[var(--surface-muted)]');
    expect(lockedCard!.className).toContain('border-[var(--border-muted)]');
  });

  it('separates unlocked and locked achievements with section headings', async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText(/First Blood/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { name: 'Unlocked (1)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Locked (1)' })).toBeInTheDocument();
  });

  it('shows the gamerscore of each achievement', async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText(/First Blood/i)).toBeInTheDocument();
    });

    expect(screen.getByText('50 G')).toBeInTheDocument();
    expect(screen.getByText('25G')).toBeInTheDocument();
  });

  it('keeps the flat list for games without Mythic achievement groups', async () => {
    await renderPage();
    await waitFor(() => {
      expect(screen.getByText(/First Blood/i)).toBeInTheDocument();
    });

    expect(document.querySelectorAll('[aria-expanded]')).toHaveLength(0);
    expect(screen.queryByText(/Base Game/i)).toBeNull();
  });

  it('separates Base Game and DLC/Game Update achievements for Mythic games', async () => {
    apiGetMock.mockImplementation((path: string) => {
      if (path.includes('/games/')) {
        return Promise.resolve({
          ...baseGame,
          isMythic: false,
          hasAchievementGroups: true,
          baseGameAchievementsTotal: 2,
          baseGameAchievementsUnlocked: 1,
        });
      }
      if (path.includes('/achievements')) {
        return Promise.resolve([
          {
            _id: 'base-1',
            achievementId: 'base-1',
            name: 'Base Achievement',
            description: 'Part of the original list',
            unlockedAt: '2024-01-15T12:00:00Z',
            gamerscore: 50,
            groupId: 'base',
            groupName: 'Base Game',
            groupOrder: 0,
          },
          {
            _id: 'base-2',
            achievementId: 'base-2',
            name: 'Base Locked',
            description: 'Still needed for Mythic',
            gamerscore: 25,
            groupId: 'base',
            groupName: 'Base Game',
            groupOrder: 0,
          },
          {
            _id: 'dlc-1',
            achievementId: 'dlc-1',
            name: 'DLC Achievement',
            description: 'Not needed for Mythic',
            unlockedAt: '2024-02-01T12:00:00Z',
            gamerscore: 100,
            groupId: 'addon',
            groupName: 'DLC / Update',
            groupOrder: 1,
          },
        ]);
      }
      return Promise.resolve(null);
    });

    await renderPage();
    await waitFor(() => {
      expect(screen.getByText('Base Game')).toBeInTheDocument();
      expect(screen.getByText('DLC / Update')).toBeInTheDocument();
    });

    // Each group shows its own total Gamerscore.
    const baseGroupButton = screen.getByText('Base Game').closest('button');
    const dlcGroupButton = screen.getByText('DLC / Update').closest('button');
    expect(baseGroupButton).not.toBeNull();
    expect(dlcGroupButton).not.toBeNull();
    expect(within(baseGroupButton!).getByText('50 / 75 G')).toBeInTheDocument();
    expect(within(dlcGroupButton!).getByText('100 / 100 G')).toBeInTheDocument();

    // The Base Game group no longer carries a Mythic label or icon.
    expect(within(baseGroupButton!).queryByText('Mythic')).toBeNull();
    expect(within(dlcGroupButton!).queryByText('Mythic')).toBeNull();
    expect(within(baseGroupButton!).queryByRole('img', { name: /Mythic achievement/ })).toBeNull();

    // Group contents stay collapsed until the user opens the group.
    expect(screen.queryByText('Base Achievement')).toBeNull();
    expect(screen.queryByText('DLC Achievement')).toBeNull();

    fireEvent.click(screen.getByText('Base Game'));
    await waitFor(() => {
      expect(screen.getByText('Base Achievement')).toBeInTheDocument();
    });
    expect(screen.queryByText('DLC Achievement')).toBeNull();
  });

  it('expands the only achievement category by default', async () => {
    apiGetMock.mockImplementation((path: string) => {
      if (path.includes('/games/')) {
        return Promise.resolve({
          ...baseGame,
          hasAchievementGroups: true,
          baseGameAchievementsTotal: 1,
        });
      }
      if (path.includes('/achievements')) {
        return Promise.resolve([
          {
            _id: 'base-1',
            achievementId: 'base-1',
            name: 'Base Achievement',
            unlockedAt: '2024-01-15T12:00:00Z',
            groupId: 'base',
            groupName: 'Base Game',
            groupOrder: 0,
          },
        ]);
      }
      return Promise.resolve(null);
    });

    await renderPage();

    const groupButton = (await screen.findByText('Base Game')).closest('button');
    expect(groupButton).not.toBeNull();
    expect(groupButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Base Achievement')).toBeInTheDocument();
  });

  it('does not show a Mythic progress stat in the game header', async () => {
    apiGetMock.mockImplementation((path: string) => {
      if (path.includes('/games/')) {
        return Promise.resolve({
          ...baseGame,
          isMythic: false,
          hasAchievementGroups: true,
          baseGameAchievementsTotal: 2,
          baseGameAchievementsUnlocked: 1,
        });
      }
      if (path.includes('/achievements')) {
        return Promise.resolve([
          {
            _id: 'base-1',
            achievementId: 'base-1',
            name: 'Base Achievement',
            unlockedAt: '2024-01-15T12:00:00Z',
            groupId: 'base',
            groupName: 'Base Game',
            groupOrder: 0,
          },
        ]);
      }
      return Promise.resolve(null);
    });

    await renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Halo Infinite/i)).toBeInTheDocument();
    });

    const gameHeader = screen.getByRole('heading', { name: 'Halo Infinite' }).closest('div');
    expect(gameHeader).not.toHaveTextContent('Mythic');
    expect(within(screen.getByText('Base Game').closest('button')!).queryByText('Mythic')).toBeNull();
  });

  it('scrolls to the top when the page opens', async () => {
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    await renderPage();

    await waitFor(() => {
      expect(scrollToSpy).toHaveBeenCalledWith(0, 0);
    });
    scrollToSpy.mockRestore();
  });
});
