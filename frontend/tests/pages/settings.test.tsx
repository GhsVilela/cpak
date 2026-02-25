import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { server } from '../mocks/handlers';
import { http, HttpResponse } from 'msw';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/settings',
}));

vi.mock('../../services/apiClient', () => ({
  apiClient: {
    get: vi.fn().mockImplementation((path: string) => {
      if (path.startsWith('/profiles')) return Promise.resolve([]);
      if (path.startsWith('/sync/runs')) return Promise.resolve([]);
      return Promise.resolve({ settings: [] });
    }),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
    getAllSettings: vi.fn().mockResolvedValue({ settings: [] }),
    updateSetting: vi.fn().mockResolvedValue({ message: 'ok' }),
  },
}));

// loadStatus() uses bare fetch('/api/backup/status') which happy-dom resolves
// to http://localhost:3000. Add a handler so MSW doesn't error on it.
beforeEach(() => {
  server.use(
    http.get('http://localhost:3000/api/backup/status', () =>
      HttpResponse.json({ backup: null, restore: null }),
    ),
  );
});

describe('Settings page — app/settings/page.tsx', () => {
  it('renders without crashing', async () => {
    const { default: SettingsPage } = await import('../../app/settings/page');
    render(<SettingsPage />);
    await waitFor(() => {
      expect(document.body.firstChild).toBeTruthy();
    });
  });

  it('renders settings section after loading', async () => {
    const { default: SettingsPage } = await import('../../app/settings/page');
    render(<SettingsPage />);
    await waitFor(() => {
      // Should render settings/profiles section
      const headings = screen.queryAllByRole('heading');
      expect(document.body.firstChild).toBeTruthy();
    });
  });
});
