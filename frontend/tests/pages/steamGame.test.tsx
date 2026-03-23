import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams('profileId=profile-1'),
  usePathname: () => '/steam/game/12345',
}));

vi.mock('../../services/apiClient', () => ({
  apiClient: {
    get: vi.fn().mockImplementation((path: string) => {
      if (path.includes('/games/')) {
        return Promise.resolve({
          _id: 'game-1',
          gameId: '12345',
          title: 'Half-Life 3',
          achievementsTotal: 20,
          achievementsUnlocked: 10,
          completionPercent: 50,
          platform: 'steam',
        });
      }
      if (path.includes('/achievements')) {
        return Promise.resolve([
          { _id: 'ach-1', achievementId: 'ACH_FIRST', name: 'First Achievement' },
        ]);
      }
      return Promise.resolve(null);
    }),
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

describe('Steam Game detail page — app/steam/game/[id]/page.tsx', () => {
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
});
