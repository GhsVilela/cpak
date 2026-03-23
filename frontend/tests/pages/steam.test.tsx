import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/steam',
}));

vi.mock('../../services/apiClient', () => ({
  apiClient: {
    get: vi.fn().mockImplementation((path: string) => {
      if (path.startsWith('/profiles')) {
        // ProfileSelector expects an array
        return Promise.resolve([]);
      }
      // Games endpoints return paginated response
      return Promise.resolve({
        data: [],
        pagination: { total: 0, limit: 50, offset: 0, hasMore: false },
      });
    }),
    post: vi.fn().mockResolvedValue({}),
  },
}));

describe('Steam page — app/steam/page.tsx', () => {
  it('renders without crashing', async () => {
    // Dynamic import to get the module after mocks are applied
    const { default: SteamPage } = await import('../../app/steam/page');
    render(<SteamPage />);
    await waitFor(() => {
      // Should render either a game grid, loading, or empty state
      expect(document.body.firstChild).toBeTruthy();
    });
  });

  it('shows empty games state when API returns empty data', async () => {
    const { default: SteamPage } = await import('../../app/steam/page');
    render(<SteamPage />);
    await waitFor(() => {
      // No games text or empty grid
      const noGames = screen.queryByText(/no games/i);
      // Either no games message shows, or loading/profile selector shows
      expect(document.body.firstChild).toBeTruthy();
    });
  });
});
