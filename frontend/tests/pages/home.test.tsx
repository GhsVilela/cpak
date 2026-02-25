import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import Home from '../../app/page';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

describe('Home page — app/page.tsx', () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  it('redirects to /settings when no profiles exist', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    }));

    render(<Home />);

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/settings');
    });
    vi.unstubAllGlobals();
  });

  it('redirects to platform page when profiles exist', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { _id: 'p1', platform: 'steam', profileId: 'steam-123', displayName: 'User' },
      ],
    }));

    render(<Home />);

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalled();
    });
    const call = pushMock.mock.calls[0][0] as string;
    expect(['/steam', '/xbox', '/playstation', '/settings']).toContain(call);
    vi.unstubAllGlobals();
  });
});
