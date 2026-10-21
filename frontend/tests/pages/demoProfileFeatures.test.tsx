import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent, act } from '@testing-library/react';

const pushMock = vi.fn();
let searchParams = new URLSearchParams('');

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, back: vi.fn() }),
  useSearchParams: () => searchParams,
  usePathname: () => '/steam',
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

describe('Demo mode — profile edit page and favorite profile', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true');
    localStorage.clear();
    pushMock.mockClear();
    delete (window as any).__DEMO_MOCK_INSTALLED__;
    delete (window as any).__DEMO_MODE__;
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    delete (window as any).__DEMO_MOCK_INSTALLED__;
    delete (window as any).__DEMO_MODE__;
  });

  it('links the platform page to the profile edit page', async () => {
    searchParams = new URLSearchParams('profileId=demo_steam_1');
    const { default: SteamPage } = await import('../../app/steam/page');

    render(<SteamPage />);

    await waitFor(
      () => {
        expect(screen.getByText('Celestial Odyssey')).toBeTruthy();
      },
      { timeout: 10000 }
    );

    // The link must be a router link so the deployment basePath is applied —
    // a plain <a href="/settings/..."> would leave the site on a 404.
    const editLink = screen.getByText('Edit').closest('a');
    expect(editLink?.getAttribute('href')).toBe(
      '/settings/edit/demo_steam_1?returnTo=%2Fsteam%3FprofileId%3Ddemo_steam_1'
    );
  });

  it('opens the platform page on the favorite profile', async () => {
    searchParams = new URLSearchParams('');
    const { default: SteamPage } = await import('../../app/steam/page');

    render(<SteamPage />);

    await waitFor(
      () => {
        expect(pushMock).toHaveBeenCalledWith('/steam?profileId=demo_steam_1', {
          scroll: false,
        });
      },
      { timeout: 10000 }
    );

    // The favorite profile is the default one, so its games are displayed.
    await waitFor(
      () => {
        expect(screen.getByText('Celestial Odyssey')).toBeTruthy();
      },
      { timeout: 10000 }
    );
  });

  it('marks a profile as favorite and keeps it as the default', async () => {
    searchParams = new URLSearchParams('profileId=demo_steam_2');
    const { default: SteamPage } = await import('../../app/steam/page');

    render(<SteamPage />);

    await waitFor(
      () => {
        expect(screen.getByText('Cozy Garden Simulator')).toBeTruthy();
      },
      { timeout: 10000 }
    );

    // The selected profile is not the default one, so it can be favorited.
    fireEvent.click(screen.getByTitle('Set as default profile'));

    await waitFor(() => {
      expect(screen.getByTitle('Default profile')).toBeTruthy();
    });

    // The choice is persisted, so it survives a reload.
    expect(localStorage.getItem('cpak-demo-default-steam')).toBe('demo_steam_2');
  });

  it('uses the favorite profile on the next visit of the platform page', async () => {
    localStorage.setItem('cpak-demo-default-steam', 'demo_steam_2');
    searchParams = new URLSearchParams('');
    const { default: SteamPage } = await import('../../app/steam/page');

    render(<SteamPage />);

    await waitFor(
      () => {
        expect(pushMock).toHaveBeenCalledWith('/steam?profileId=demo_steam_2', {
          scroll: false,
        });
      },
      { timeout: 10000 }
    );
  });

  it('loads the profile on the edit page and saves a new display name', async () => {
    searchParams = new URLSearchParams('returnTo=%2Fsteam%3FprofileId%3Ddemo_steam_1');
    const { default: EditProfilePage } = await import('../../app/settings/edit/[id]/page');

    await act(async () => {
      render(<EditProfilePage params={Promise.resolve({ id: 'demo_steam_1' })} />);
    });

    const input = (await screen.findByLabelText('Display Name')) as HTMLInputElement;
    await waitFor(() => {
      expect(input.value).toBe('DemoSteamGamer');
    });

    fireEvent.change(input, { target: { value: 'Renamed Gamer' } });
    fireEvent.click(screen.getByText('Save Profile Data'));

    await waitFor(() => {
      expect(screen.getByText('Display name updated successfully!')).toBeTruthy();
    });

    // The change is kept by the demo API.
    const { apiClient } = await import('../../services/apiClient');
    const profile = await apiClient.get<{ displayName: string }>('/profiles/demo_steam_1');
    expect(profile.displayName).toBe('Renamed Gamer');
  });
});
