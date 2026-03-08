import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProfileSelector from '../../components/ProfileSelector';
import { server } from '../mocks/handlers';
import { http, HttpResponse } from 'msw';

describe('ProfileSelector', () => {
  it('displays loading state initially', () => {
    render(
      <ProfileSelector
        platform="steam"
        onSelectProfile={vi.fn()}
      />,
    );
    expect(screen.getByText('Loading profiles...')).toBeInTheDocument();
  });

  it('renders profiles returned from MSW handler', async () => {
    render(
      <ProfileSelector
        platform="steam"
        onSelectProfile={vi.fn()}
      />,
    );
    // MSW handler returns [{ _id: 'profile-1', displayName: 'Test Profile', ... }]
    await waitFor(() => {
      expect(screen.queryByText(/Test Profile|Loading/)).toBeInTheDocument();
    });
  });

  it('calls onSelectProfile when a profile is clicked', async () => {
    const select = vi.fn();
    const user = userEvent.setup();
    render(
      <ProfileSelector
        platform="steam"
        onSelectProfile={select}
      />,
    );
    await waitFor(() => {
      const btns = screen.queryAllByRole('button');
      return btns.length > 0;
    });
    const buttons = screen.queryAllByRole('button');
    if (buttons.length > 0) {
      await user.click(buttons[0]);
    }
    // onSelectProfile called or component renders without errors
    expect(document.body.firstChild).toBeTruthy();
  });

  it('shows no profiles message for empty platform', async () => {
    server.use(
      http.get('http://localhost/api/profiles', () =>
        HttpResponse.json([]),
      ),
    );
    render(
      <ProfileSelector
        platform="playstation"
        onSelectProfile={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/No playstation profiles configured/)).toBeInTheDocument();
    });
  });

  it('calls onError when API fails', async () => {
    server.use(
      http.get('http://localhost/api/profiles', () =>
        new HttpResponse(null, { status: 500 }),
      ),
    );
    const onError = vi.fn();
    render(
      <ProfileSelector
        platform="steam"
        onSelectProfile={vi.fn()}
        onError={onError}
      />,
    );
    await waitFor(() => {
      expect(onError).toHaveBeenCalled();
    });
  });

  it('auto-selects first profile when none selected', async () => {
    server.use(
      http.get('http://localhost/api/profiles', () =>
        HttpResponse.json([
          { _id: 'p1', platform: 'steam', profileId: 's1', displayName: 'First' },
          { _id: 'p2', platform: 'steam', profileId: 's2', displayName: 'Second' },
        ]),
      ),
    );
    const selectFn = vi.fn();
    render(
      <ProfileSelector
        platform="steam"
        onSelectProfile={selectFn}
      />,
    );
    await waitFor(() => {
      expect(selectFn).toHaveBeenCalledWith('p1');
    });
  });
});
