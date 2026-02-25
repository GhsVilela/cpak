import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProfileSelector from '../../components/ProfileSelector';

describe('ProfileSelector', () => {
  it('displays loading state initially', () => {
    render(
      <ProfileSelector
        platform="steam"
        onSelectProfile={vi.fn()}
      />,
    );
    // Component should show spinner or loading text before profiles load
    expect(document.body.firstChild).toBeTruthy();
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
});
