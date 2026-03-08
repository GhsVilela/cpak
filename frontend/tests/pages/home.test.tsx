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

  it('redirects to /steam when steam profile exists', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { _id: 'p1', platform: 'steam', profileId: 'steam-123', displayName: 'User' },
      ],
    }));

    render(<Home />);

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/steam');
    });
    vi.unstubAllGlobals();
  });

  it('redirects to /xbox when only xbox profile exists', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { _id: 'p1', platform: 'xbox', profileId: 'xbox-123', displayName: 'XboxUser' },
      ],
    }));

    render(<Home />);

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/xbox');
    });
    vi.unstubAllGlobals();
  });

  it('redirects to /playstation when only playstation profile exists', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { _id: 'p1', platform: 'playstation', profileId: 'ps-123', displayName: 'PSUser' },
      ],
    }));

    render(<Home />);

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/playstation');
    });
    vi.unstubAllGlobals();
  });

  it('redirects to /settings on fetch error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('Network error')));

    render(<Home />);

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/settings');
    });
    vi.unstubAllGlobals();
  });

  it('redirects to /settings when response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: false,
    }));

    render(<Home />);

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/settings');
    });
    vi.unstubAllGlobals();
  });
});
