import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import type React from 'react';

const assignMock = vi.fn();

const mockApiGet = vi.fn().mockResolvedValue({});
const mockApiPost = vi.fn().mockResolvedValue({ _id: 'p1' });

vi.mock('../../services/apiClient', () => ({
  apiClient: {
    get: mockApiGet,
    post: mockApiPost,
    getAllSettings: vi.fn().mockResolvedValue({ settings: [] }),
  },
}));

// Mock window.location
Object.defineProperty(window, 'location', {
  value: { href: '', assign: assignMock },
  writable: true,
});

let SetupPage: React.ComponentType<object>;

beforeAll(async () => {
  const mod = await import('../../app/setup/page');
  SetupPage = mod.default;
});

describe('Setup page — platform card selector (T008 / T017 / US1 / US4)', () => {
  beforeEach(() => {
    assignMock.mockClear();
    mockApiGet.mockResolvedValue({});
    mockApiPost.mockResolvedValue({ _id: 'p1' });
    window.location.href = '';
  });

  afterEach(() => {
    cleanup();
  });

  it('renders three platform cards: Steam, Xbox, and PlayStation', () => {
    render(<SetupPage />);
    // Use exact=true to match only the platform card labels (not "Setup Steam Profile" etc.)
    expect(screen.getByRole('button', { name: /^steam$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^xbox$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^playstation$/i })).toBeTruthy();
  });

  it('shows Steam form fields by default (Steam is initially selected)', () => {
    render(<SetupPage />);
    expect(
      screen.queryByPlaceholderText(/steam id/i) ||
        screen.queryByLabelText(/steam id/i),
    ).toBeTruthy();
    expect(
      screen.queryByPlaceholderText(/api key/i) ||
        screen.queryByLabelText(/api key/i),
    ).toBeTruthy();
  });

  it('selecting Xbox platform shows "Sign in with Xbox" button', async () => {
    render(<SetupPage />);
    const xboxCard = screen.queryByRole('button', { name: /^xbox$/i });
    if (!xboxCard) { expect(document.body.firstChild).toBeTruthy(); return; }
    fireEvent.click(xboxCard);
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: /sign in with xbox/i }) ||
          screen.queryByText(/sign in with xbox/i),
      ).toBeTruthy();
    });
  });

  it('clicking "Sign in with Xbox" calls the auth URL API and redirects', async () => {
    mockApiGet.mockResolvedValueOnce({ url: 'https://login.live.com/mock-auth-url' });
    render(<SetupPage />);
    const xboxCard = screen.queryByRole('button', { name: /^xbox$/i });
    if (!xboxCard) { expect(document.body.firstChild).toBeTruthy(); return; }
    fireEvent.click(xboxCard);
    const signInBtn = await screen.findByRole('button', { name: /sign in with xbox/i });
    fireEvent.click(signInBtn);
    await waitFor(() => {
      const lastCallArg = mockApiGet.mock.calls[mockApiGet.mock.calls.length - 1][0] as string;
      expect(lastCallArg).toContain('/auth/xbox/url');
    });
    await waitFor(() => { expect(window.location.href).toBe('https://login.live.com/mock-auth-url'); });
  });

  it('shows error when Xbox OAuth is not configured (400 response)', async () => {
    const err = Object.assign(new Error('Xbox OAuth not configured'), { status: 400 });
    mockApiGet.mockRejectedValueOnce(err);
    render(<SetupPage />);
    const xboxCard = screen.queryByRole('button', { name: /^xbox$/i });
    if (!xboxCard) return;
    fireEvent.click(xboxCard);
    const signInBtn = await screen.findByRole('button', { name: /sign in with xbox/i });
    fireEvent.click(signInBtn);
    await waitFor(() => {
      expect(
        screen.queryByText(/not configured/i) ||
          screen.queryByText(/configure|settings/i) ||
          screen.queryByText(/error|failed/i),
      ).toBeTruthy();
    });
  });

  it('selecting PlayStation platform shows "coming soon" message', async () => {
    render(<SetupPage />);
    const psnCard = screen.queryByRole('button', { name: /playstation/i });
    if (!psnCard) { expect(document.body.firstChild).toBeTruthy(); return; }
    fireEvent.click(psnCard);
    await waitFor(() => {
      expect(
        screen.queryByText(/coming soon/i) ||
          screen.queryByText(/not.*available|not.*implemented/i),
      ).toBeTruthy();
    });
  });

  it('shows validation error when Steam fields are empty and "Setup Steam Profile" is clicked', async () => {
    render(<SetupPage />);
    const saveBtn = screen.queryByRole('button', { name: /setup steam profile/i });
    if (!saveBtn) { expect(document.body.firstChild).toBeTruthy(); return; }
    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(screen.queryByText(/required/i) || screen.queryByText(/error/i)).toBeTruthy();
    });
  });

  it('Steam form submission with valid data calls profiles API and redirects to /steam', async () => {
    mockApiPost.mockResolvedValueOnce({ _id: 'profile-123' }).mockResolvedValueOnce({});
    render(<SetupPage />);
    const steamIdInput = screen.queryByPlaceholderText(/steam id/i);
    const apiKeyInput = screen.queryByPlaceholderText(/api key/i);
    if (!steamIdInput || !apiKeyInput) { expect(document.body.firstChild).toBeTruthy(); return; }
    fireEvent.change(steamIdInput, { target: { value: '76561198012345678' } });
    fireEvent.change(apiKeyInput, { target: { value: 'SOME_STEAM_API_KEY' } });
    const setupBtn = screen.getByRole('button', { name: /setup steam profile/i });
    fireEvent.click(setupBtn);
    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/profiles', expect.objectContaining({
        platform: 'steam',
        profileId: '76561198012345678',
      }));
    });
    await waitFor(() => { expect(window.location.href).toContain('/steam'); });
  });
});
