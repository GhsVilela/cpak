import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, within } from '@testing-library/react';
import { demoGames } from '../../services/demo/demoData';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams('profileId=demo_xbox_1'),
  usePathname: () => '/xbox',
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

describe('Xbox page — demo mode end to end', () => {
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

  it('shows the gamerscore instead of the sync progress bar', async () => {
    const { default: XboxPage } = await import('../../app/xbox/page');

    render(<XboxPage />);

    await waitFor(
      () => {
        expect(screen.getByText('Eternal Guardians')).toBeTruthy();
      },
      { timeout: 10000 }
    );

    expect(screen.queryByText(/Sync in progress/)).toBeNull();
    expect(screen.getAllByText('Gamerscore').length).toBeGreaterThan(0);

    const xboxGames = demoGames.filter((game) => game.platform === 'xbox');
    const totalGamerscore = xboxGames.reduce(
      (sum, game) => sum + (game.currentGamerscore ?? 0),
      0
    );
    const xbox360Gamerscore = xboxGames
      .filter((game) => game.devices?.includes('Xbox360'))
      .reduce((sum, game) => sum + (game.currentGamerscore ?? 0), 0);
    const mythicCount = xboxGames.filter((game) => game.isMythic).length;

    expect(screen.getAllByText(totalGamerscore.toLocaleString()).length).toBeGreaterThan(0);
    // Xbox 360 only: Racing Legends
    expect(screen.getAllByText('Xbox 360').length).toBeGreaterThan(0);
    expect(screen.getAllByText(xbox360Gamerscore.toLocaleString()).length).toBeGreaterThan(0);

    // The demo includes Mythic-enabled games.
    const mythicTile = screen.getByTitle(/Mythic achievements earned/);
    expect(within(mythicTile).getByText(String(mythicCount))).toBeTruthy();
  });
});
