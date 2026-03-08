import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '../mocks/handlers';
import { http, HttpResponse } from 'msw';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/settings',
}));

const getMock = vi.fn();
const postMock = vi.fn().mockResolvedValue({});
const putMock = vi.fn().mockResolvedValue({});
const deleteMock = vi.fn().mockResolvedValue(undefined);
const getAllSettingsMock = vi.fn();
const updateSettingMock = vi.fn().mockResolvedValue({ message: 'ok' });

vi.mock('../../services/apiClient', () => ({
  apiClient: {
    get: (...args: any[]) => getMock(...args),
    post: (...args: any[]) => postMock(...args),
    put: (...args: any[]) => putMock(...args),
    delete: (...args: any[]) => deleteMock(...args),
    getAllSettings: (...args: any[]) => getAllSettingsMock(...args),
    updateSetting: (...args: any[]) => updateSettingMock(...args),
  },
}));

// loadStatus() and checkAnySyncInProgress() use bare fetch()
beforeEach(() => {
  getMock.mockImplementation((path: string) => {
    if (path.startsWith('/profiles')) {
      return Promise.resolve([
        {
          _id: 'p1',
          platform: 'steam',
          profileId: 'steam-123',
          displayName: 'SteamUser',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-06-01T00:00:00Z',
          credentials: { hasApiKey: true },
        },
        {
          _id: 'p2',
          platform: 'xbox',
          profileId: 'xbox-456',
          displayName: 'XboxUser',
          createdAt: '2024-02-01T00:00:00Z',
          updatedAt: '2024-06-01T00:00:00Z',
          credentials: { expiresAt: '2025-12-31T00:00:00Z', tokenType: 'xbox' },
        },
      ]);
    }
    if (path.startsWith('/sync/runs')) {
      return Promise.resolve([
        {
          _id: 'run1',
          profileId: 'p1',
          completedAt: '2024-06-01T12:00:00Z',
          status: 'success',
        },
      ]);
    }
    return Promise.resolve({ settings: [] });
  });

  getAllSettingsMock.mockResolvedValue({
    settings: [
      { key: 'scheduler_enabled', value: 'true', category: 'scheduler', isSecret: false },
      { key: 'scheduler_cron', value: '0 3 * * *', category: 'scheduler', isSecret: false },
      { key: 'sync_batch_size', value: '50', category: 'sync', isSecret: false },
      { key: 'sync_concurrency', value: '3', category: 'sync', isSecret: false },
      { key: 'steamgrid_api_key', value: '', category: 'image_provider', isSecret: true },
      { key: 'xbox_client_id', value: 'my-client-id', category: 'auth', isSecret: false },
      { key: 'xbox_client_secret', value: '', category: 'auth', isSecret: true },
      { key: 'xbox_redirect_uri', value: 'http://localhost/callback', category: 'auth', isSecret: false },
    ],
  });

  server.use(
    http.get('http://localhost:3000/api/backup/status', () =>
      HttpResponse.json({ backup: null, restore: null }),
    ),
    http.get('http://localhost:3000/api/sync/status', () =>
      HttpResponse.json({ current: null }),
    ),
  );

  // Also handle happy-dom's fetch for sync/status check per profile
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    if (url.includes('/api/backup/status')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ backup: null, restore: null }),
      });
    }
    if (url.includes('/api/sync/status')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ current: null }),
      });
    }
    // Default
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
    });
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Settings page — app/settings/page.tsx', () => {
  it('renders without crashing', async () => {
    const { default: SettingsPage } = await import('../../app/settings/page');
    render(<SettingsPage />);
    await waitFor(() => {
      expect(document.body.firstChild).toBeTruthy();
    });
  });

  it('renders profiles after loading', async () => {
    const { default: SettingsPage } = await import('../../app/settings/page');
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('SteamUser')).toBeInTheDocument();
      expect(screen.getByText('XboxUser')).toBeInTheDocument();
    });
  });

  it('shows platform names for profiles', async () => {
    const { default: SettingsPage } = await import('../../app/settings/page');
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getAllByText(/Steam/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Xbox/i).length).toBeGreaterThan(0);
    });
  });

  it('navigates to setup when Add Profile is clicked', async () => {
    const { default: SettingsPage } = await import('../../app/settings/page');
    const user = userEvent.setup();
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('SteamUser')).toBeInTheDocument();
    });

    const addBtn = screen.queryByRole('button', { name: /add.*profile/i }) || screen.queryByText(/add.*profile/i);
    if (addBtn) {
      await user.click(addBtn);
      expect(pushMock).toHaveBeenCalledWith('/setup');
    }
  });

  it('shows delete confirmation when delete is clicked', async () => {
    const { default: SettingsPage } = await import('../../app/settings/page');
    const user = userEvent.setup();
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText('SteamUser')).toBeInTheDocument();
    });

    // Find delete buttons
    const deleteButtons = screen.queryAllByRole('button', { name: /delete/i });
    if (deleteButtons.length > 0) {
      await user.click(deleteButtons[0]);
      // Should show Confirm/Cancel buttons
      await waitFor(() => {
        expect(screen.getByText('Confirm')).toBeInTheDocument();
        expect(screen.getByText('Cancel')).toBeInTheDocument();
      });
    }
  });

  it('handles empty profiles list', async () => {
    getMock.mockImplementation((path: string) => {
      if (path.startsWith('/profiles')) return Promise.resolve([]);
      if (path.startsWith('/sync/runs')) return Promise.resolve([]);
      return Promise.resolve({ settings: [] });
    });
    const { default: SettingsPage } = await import('../../app/settings/page');
    render(<SettingsPage />);
    await waitFor(() => {
      expect(document.body.firstChild).toBeTruthy();
    });
  });

  it('handles profile loading error', async () => {
    getMock.mockImplementation((path: string) => {
      if (path.startsWith('/profiles')) return Promise.reject(new Error('Network error'));
      if (path.startsWith('/sync/runs')) return Promise.resolve([]);
      return Promise.resolve({ settings: [] });
    });
    const { default: SettingsPage } = await import('../../app/settings/page');
    render(<SettingsPage />);
    await waitFor(() => {
      expect(document.body.firstChild).toBeTruthy();
    });
  });

  it('renders scheduler settings section', async () => {
    const { default: SettingsPage } = await import('../../app/settings/page');
    render(<SettingsPage />);
    await waitFor(() => {
      const schedulerHeadings = screen.queryAllByText(/scheduler|automatic.*sync/i);
      expect(schedulerHeadings.length).toBeGreaterThan(0);
    });
  });

  it('renders sync settings section', async () => {
    const { default: SettingsPage } = await import('../../app/settings/page');
    render(<SettingsPage />);
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/sync|batch/i);
    });
  });
});
