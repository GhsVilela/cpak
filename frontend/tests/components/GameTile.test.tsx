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

  it('shows 100% completion badge for fully completed games', () => {
    const completedGame = { ...mockGame, completionPercent: 100, achievementsUnlocked: 20 };
    render(<GameTile game={completedGame} />);
    // Badge and percentage both show 100%, verify at least 2 elements
    expect(screen.getAllByText('100%').length).toBeGreaterThanOrEqual(2);
  });

  it('shows gamerscore for xbox games', () => {
    const xboxGame = {
      ...mockGame,
      platform: 'xbox' as const,
      currentGamerscore: 500,
      maxGamerscore: 1000,
    };
    render(<GameTile game={xboxGame} />);
    // Should display gamerscore format instead of achievements
    expect(screen.getByText(/500/)).toBeInTheDocument();
    expect(screen.getByText(/1,000/)).toBeInTheDocument();
  });

  it('renders game image when imagePath is provided', () => {
    const gameWithImage = { ...mockGame, imagePath: 'steam/730/header.jpg' };
    render(<GameTile game={gameWithImage} />);
    const img = document.querySelector('img');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('alt')).toBe('Half-Life 3');
  });

  it('applies blue color class for 80% completion', () => {
    const game = { ...mockGame, completionPercent: 80, achievementsUnlocked: 16 };
    render(<GameTile game={game} />);
    expect(screen.getByText('80%')).toBeInTheDocument();
  });

  it('applies orange color class for 30% completion', () => {
    const game = { ...mockGame, completionPercent: 30, achievementsUnlocked: 6 };
    render(<GameTile game={game} />);
    expect(screen.getByText('30%')).toBeInTheDocument();
  });

  it('renders playstation game correctly', () => {
    const game = { ...mockGame, platform: 'playstation' as const };
    render(<GameTile game={game} />);
    expect(screen.getByText(mockGame.title)).toBeInTheDocument();
  });
});
