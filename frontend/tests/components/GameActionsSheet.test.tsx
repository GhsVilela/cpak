import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GameActionsSheet from '../../components/GameActionsSheet';

const renderSheet = (overrides: Partial<React.ComponentProps<typeof GameActionsSheet>> = {}) => {
  const onEdit = vi.fn();
  const onHide = vi.fn();
  const onClose = vi.fn();

  render(
    <GameActionsSheet
      title="Half-Life 3"
      onEdit={onEdit}
      onHide={onHide}
      onClose={onClose}
      {...overrides}
    />,
  );

  return { onEdit, onHide, onClose };
};

describe('GameActionsSheet', () => {
  it('shows the game title and mobile-friendly actions', () => {
    renderSheet();

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Half-Life 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit game' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide game' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('calls edit and hide handlers', async () => {
    const user = userEvent.setup();
    const { onEdit, onHide } = renderSheet();

    await user.click(screen.getByRole('button', { name: 'Edit game' }));
    await user.click(screen.getByRole('button', { name: 'Hide game' }));

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it('shows Unhide game for hidden games', () => {
    renderSheet({ isHidden: true });

    expect(screen.getByRole('button', { name: 'Unhide game' })).toBeInTheDocument();
  });

  it('closes on Cancel, backdrop click and Escape', async () => {
    const user = userEvent.setup();
    const { onClose } = renderSheet();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Close game actions' }));
    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
