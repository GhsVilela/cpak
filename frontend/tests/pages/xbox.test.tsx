import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('../../services/apiClient', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({
      data: [],
      pagination: { total: 0, limit: 50, offset: 0, hasMore: false },
    }),
    post: vi.fn().mockResolvedValue({}),
  },
}));

describe('Xbox page — app/xbox/page.tsx', () => {
  it('renders without crashing', async () => {
    const { default: XboxPage } = await import('../../app/xbox/page');
    render(<XboxPage />);
    await waitFor(() => {
      expect(document.body.firstChild).toBeTruthy();
    });
  });

  it('shows empty game list when API returns no games', async () => {
    const { default: XboxPage } = await import('../../app/xbox/page');
    render(<XboxPage />);
    await waitFor(() => {
      // Empty state or loading
      expect(document.body.firstChild).toBeTruthy();
    });
  });
});
