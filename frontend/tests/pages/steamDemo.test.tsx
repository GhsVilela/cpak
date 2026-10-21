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
});
