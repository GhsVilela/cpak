import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams('profileId=demo_steam_1'),
  usePathname: () => '/steam',
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

describe('Steam page — demo mode end to end', () => {
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

  it('renders the demo games without any "API error"', async () => {
    const { default: SteamPage } = await import('../../app/steam/page');

    render(<SteamPage />);

    await waitFor(
      () => {
        expect(screen.getByText('Celestial Odyssey')).toBeTruthy();
      },
      { timeout: 10000 }
    );

    expect(screen.queryByText(/API error/)).toBeNull();
    expect(screen.getByText('Mystic Realms')).toBeTruthy();
  });

  it('shows the stats instead of the sync progress bar', async () => {
    const { default: SteamPage } = await import('../../app/steam/page');

    render(<SteamPage />);

    await waitFor(
      () => {
        expect(screen.getByText('Celestial Odyssey')).toBeTruthy();
      },
      { timeout: 10000 }
    );

    // The demo never has a running sync, so the progress bar must be absent
    // and the aggregated status shown instead.
    expect(screen.queryByText(/Sync in progress/)).toBeNull();
    expect(screen.getByText('Achievements Unlocked')).toBeTruthy();
    expect(screen.getByText('Games & Groups Completed')).toBeTruthy();
    expect(screen.getByText('Last Sync')).toBeTruthy();
  });

  it('renders the game artwork with a loadable url', async () => {
    const { default: SteamPage } = await import('../../app/steam/page');

    render(<SteamPage />);

    await waitFor(
      () => {
        expect(screen.getByText('Celestial Odyssey')).toBeTruthy();
      },
      { timeout: 10000 }
    );

    const image = screen.getByAltText('Celestial Odyssey') as HTMLImageElement;
    // The demo artwork is an absolute url — it cannot be served by /api/icons
    // on a static host, and <img> requests are not intercepted by the mock.
    expect(image.getAttribute('src')).toMatch(/^https?:\/\//);
  });
});
