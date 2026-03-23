import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GameTile from '../../components/GameTile';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

const mockGame = {
  _id: 'game-1',
  gameId: '12345',
  title: 'Half-Life 3',
  platform: 'steam' as const,
  achievementsTotal: 20,
  achievementsUnlocked: 10,
  completionPercent: 50,
  imagePath: undefined,
  profileId: 'profile-1',
};

describe('GameTile', () => {
  it('renders the game title', () => {
    render(<GameTile game={mockGame} />);
    expect(screen.getByText('Half-Life 3')).toBeInTheDocument();
  });

  it('displays the completion percentage', () => {
    render(<GameTile game={mockGame} />);
    expect(screen.getByText(/50%/)).toBeInTheDocument();
  });

  it('navigates to the game detail page on click', async () => {
    const user = userEvent.setup();
    render(<GameTile game={mockGame} />);
    const tile = screen.getByText('Half-Life 3').closest('div[class]') as HTMLElement;
    // Find the clickable container
    const clickable = document.querySelector('[style]') ?? tile;
    await user.click(screen.getByText('Half-Life 3'));
    expect(pushMock).toHaveBeenCalled();
  });
});
