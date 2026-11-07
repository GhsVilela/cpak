import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent, within } from '@testing-library/react';
import { demoAchievements, demoGames } from '../../services/demo/demoData';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams('profileId=demo_xbox_1'),
  usePathname: () => '/xbox/game/xbox_001',
}));

vi.mock('react', async (importOriginal) => {
  const React = (await importOriginal()) as typeof import('react');
  return {
    ...React,
    use: (promise: Promise<unknown>) => {
      if (promise instanceof Promise) {
        return { id: 'xbox_001' };
      }
      return React.use(promise);
    },
  };
});

describe('Xbox game detail page — demo mode end to end', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true');
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    delete (window as any).__DEMO_MOCK_INSTALLED__;
    delete (window as any).__DEMO_MODE__;
  });

  it('shows base/DLC groups and per-category Gamerscore without a Mythic icon', async () => {
    const { default: GamePage } = await import('../../app/xbox/game/[id]/page');

    render(<GamePage params={Promise.resolve({ id: 'xbox_001' })} />);

    await waitFor(
      () => {
        expect(screen.getByText('Eternal Guardians')).toBeTruthy();
        expect(screen.getByText('Base Game')).toBeTruthy();
        expect(screen.getByText('DLC / Update')).toBeTruthy();
      },
      { timeout: 10000 }
    );

    const game = demoGames.find((item) => item.gameId === 'xbox_001')!;
    const achievements = demoAchievements.filter(
      (achievement) => achievement.gameId === game._id
    );
    const baseAchievements = achievements.filter(
      (achievement) => achievement.groupId === 'base'
    );
    const unlockedGamerscore = baseAchievements
      .filter((achievement) => achievement.unlockedAt)
      .reduce((sum, achievement) => sum + (achievement.gamerscore ?? 0), 0);
    const totalGamerscore = baseAchievements.reduce(
      (sum, achievement) => sum + (achievement.gamerscore ?? 0),
      0
    );

    const baseGroupButton = screen.getByText('Base Game').closest('button');
    expect(baseGroupButton).not.toBeNull();
    expect(
      within(baseGroupButton!).queryByLabelText('Mythic achievement earned')
    ).toBeNull();
    expect(
      within(baseGroupButton!).getByText(
        `${unlockedGamerscore.toLocaleString()} / ${totalGamerscore.toLocaleString()} G`
      )
    ).toBeTruthy();

    fireEvent.click(screen.getByText('Base Game'));
    await waitFor(() => {
      expect(screen.getByText('Eternal Guardians - Challenge 1')).toBeTruthy();
    });
  });
});
