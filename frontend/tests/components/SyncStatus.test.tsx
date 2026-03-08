import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SyncStatus from '../../components/SyncStatus';

// SyncStatus uses relative-URL fetch directly; we stub globalThis.fetch for the
// syncing test so the call resolves immediately without requiring URL resolution.
describe('SyncStatus', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders sync button in idle state', () => {
    render(<SyncStatus platform="steam" profileId="profile-1" />);
    expect(screen.getByRole('button', { name: /sync now/i })).toBeInTheDocument();
  });

  it('sync button is initially enabled (not syncing)', () => {
    render(<SyncStatus platform="steam" />);
    const btn = screen.getByRole('button', { name: /sync now/i });
    expect(btn).not.toBeDisabled();
  });

  it('disables button and shows "Syncing..." text when syncing', async () => {
    // Stub fetch so the POST resolves successfully without needing MSW URL resolution
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: 'Sync started' }),
      } as Response),
    );

    const user = userEvent.setup();
    render(<SyncStatus platform="steam" profileId="profile-1" />);
    const btn = screen.getByRole('button', { name: /sync now/i });
    await user.click(btn);
    // After click the fetch resolves; setTimeout(setSyncing(false), 5000) is queued
    // but hasn't fired yet (no fake timers), so the button is still in syncing state
    expect(screen.getByRole('button', { name: /syncing/i })).toBeDisabled();
  });

  it('shows error message when sync fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({}),
      } as Response),
    );

    const user = userEvent.setup();
    render(<SyncStatus platform="steam" profileId="profile-1" />);
    const btn = screen.getByRole('button', { name: /sync now/i });
    await user.click(btn);
    await waitFor(() => {
      expect(screen.getByText('Sync failed')).toBeInTheDocument();
    });
  });

  it('shows error when fetch throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValueOnce(new Error('Network error')),
    );

    const user = userEvent.setup();
    render(<SyncStatus platform="xbox" />);
    const btn = screen.getByRole('button', { name: /sync now/i });
    await user.click(btn);
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });
});
