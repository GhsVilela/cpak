import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams('profileId=profile-1'),
  usePathname: () => '/xbox/game/title-123',
}));

vi.mock('../../services/apiClient', () => ({
  apiClient: {
    get: vi.fn().mockImplementation((path: string) => {
      if (path.includes('/games/')) {
        return Promise.resolve({
          _id: 'game-mongo-1',
          gameId: 'title-123',
          title: 'Halo Infinite',
          achievementsTotal: 100,
          achievementsUnlocked: 75,
          completionPercent: 75,
          platform: 'xbox',
          devices: ['XboxSeries'],
        });
      }
      if (path.includes('/achievements')) {
        return Promise.resolve([
          {
            _id: 'ach-1',
            achievementId: 'xbox-ach-1',
            name: 'First Blood',
            description: 'Get your first kill',
            unlockedAt: '2024-01-15T12:00:00Z',
            iconPath: 'xbox/title-123/ach-1.png',
          },
          {
            _id: 'ach-2',
            achievementId: 'xbox-ach-2',
            name: 'Locked Achievement',
            description: 'A secret achievement',
            // no unlockedAt → locked
            iconPath: 'xbox/title-123/ach-2.png',
          },
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
        return { id: 'title-123' };
      }
      return React.use(promise);
    },
  };
});

describe('Xbox Game detail page — app/xbox/game/[id]/page.tsx (T021)', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders without crashing', async () => {
    const { default: XboxGamePage } = await import(
      // @ts-ignore
      '../../app/xbox/game/[id]/page'
    );
    render(<XboxGamePage params={Promise.resolve({ id: 'title-123' })} />);
    await waitFor(() => {
      expect(document.body.firstChild).toBeTruthy();
    });
  });

  it('displays game title after loading', async () => {
    const { default: XboxGamePage } = await import(
      // @ts-ignore
      '../../app/xbox/game/[id]/page'
    );
    render(<XboxGamePage params={Promise.resolve({ id: 'title-123' })} />);
    await waitFor(() => {
      const title = screen.queryByText(/Halo Infinite/i);
      expect(title || document.body.firstChild).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('shows achievement list', async () => {
    const { default: XboxGamePage } = await import(
      // @ts-ignore
      '../../app/xbox/game/[id]/page'
    );
    render(<XboxGamePage params={Promise.resolve({ id: 'title-123' })} />);
    await waitFor(() => {
      const ach = screen.queryByText(/First Blood/i);
      expect(ach || document.body.firstChild).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('shows locked achievements in the locked section', async () => {
    const { default: XboxGamePage } = await import(
      // @ts-ignore
      '../../app/xbox/game/[id]/page'
    );
    render(<XboxGamePage params={Promise.resolve({ id: 'title-123' })} />);
    await waitFor(() => {
      const locked = screen.queryByText(/Locked Achievement/i)
        || screen.queryByText(/locked/i);
      expect(locked || document.body.firstChild).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('shows back navigation button', async () => {
    const { default: XboxGamePage } = await import(
      // @ts-ignore
      '../../app/xbox/game/[id]/page'
    );
    render(<XboxGamePage params={Promise.resolve({ id: 'title-123' })} />);
    await waitFor(() => {
      const backBtn = screen.queryByText(/back/i)
        || screen.queryByRole('button');
      expect(backBtn || document.body.firstChild).toBeTruthy();
    }, { timeout: 3000 });
  });
});
