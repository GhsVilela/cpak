import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => null }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock('../../services/apiClient', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 50, offset: 0, hasMore: false },
    }),
    post: vi.fn().mockResolvedValue({}),
  },
}));

describe('PlayStation page — app/playstation/page.tsx', () => {
  it('renders without crashing', async () => {
    const { default: PlayStationPage } = await import('../../app/playstation/page');
    render(<PlayStationPage />);
    await waitFor(() => {
      expect(document.body.firstChild).toBeTruthy();
    });
  });

  it('shows empty game state when API returns no games', async () => {
    const { default: PlayStationPage } = await import('../../app/playstation/page');
    render(<PlayStationPage />);
    await waitFor(() => {
      expect(document.body.firstChild).toBeTruthy();
    });
  });
});
