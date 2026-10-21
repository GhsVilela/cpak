import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams('profileId=demo_steam_1'),
  usePathname: () => '/steam/game/steam_001',
}));

vi.mock('react', async (importOriginal) => {
  const React = (await importOriginal()) as typeof import('react');
  return {
    ...React,
    use: (promise: Promise<unknown>) => {
      if (promise instanceof Promise) {
        return { id: 'steam_001' };
      }
      return React.use(promise);
    },
  };
});

describe('Steam game detail page — demo mode end to end', () => {
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

  it('loads the game and its achievements from the demo API', async () => {
    const { default: GamePage } = await import('../../app/steam/game/[id]/page');

    render(<GamePage params={Promise.resolve({ id: 'steam_001' })} />);

    await waitFor(
      () => {
        expect(screen.getByText('Celestial Odyssey')).toBeTruthy();
      },
      { timeout: 10000 }
    );

    // The achievement list is rendered from the mock API.
    await waitFor(
      () => {
        expect(screen.getByText('Celestial Odyssey - Challenge 1')).toBeTruthy();
      },
      { timeout: 10000 }
    );

    expect(screen.queryByText(/API error/)).toBeNull();
  });
});
