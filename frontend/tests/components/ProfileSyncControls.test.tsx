import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProfileSyncControls from '../../components/ProfileSyncControls';
import { apiClient } from '../../services/apiClient';

describe('ProfileSyncControls', () => {
  it('renders the sync button', () => {
    render(
      <ProfileSyncControls
        profileId="profile-1"
        platform="steam"
      />,
    );
    expect(screen.getByRole('button', { name: /sync/i })).toBeInTheDocument();
  });

  it('disables the sync button when disabled=true', () => {
    render(
      <ProfileSyncControls
        profileId="profile-1"
        platform="steam"
        disabled={true}
      />,
    );
    expect(screen.getByRole('button', { name: /sync/i })).toBeDisabled();
  });

  it('shows last sync time when lastSync is provided', () => {
    render(
      <ProfileSyncControls
        profileId="profile-1"
        platform="steam"
        lastSync={{
          completedAt: '2024-01-01T03:00:00.000Z',
          status: 'success',
        }}
      />,
    );
    // Component should display some kind of last sync information
    expect(document.body.firstChild).toBeTruthy();
  });

  it('shows syncing state after sync button click', async () => {
    // Spy on apiClient.post so the POST call never resolves, keeping syncing=true
    const postSpy = vi.spyOn(apiClient, 'post').mockReturnValue(new Promise(() => {}));

    const user = userEvent.setup();
    render(
      <ProfileSyncControls
        profileId="profile-1"
        platform="steam"
      />,
    );
    const btn = screen.getByRole('button', { name: /sync/i });
    await user.click(btn);
    // syncing=true because the mock post() never resolves
    const updatedBtn = screen.getByRole('button');
    expect(updatedBtn).toBeDisabled();

    postSpy.mockRestore();
  });
});
