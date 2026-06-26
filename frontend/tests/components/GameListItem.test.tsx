import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GameListItem from '../../components/GameListItem';

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
  iconImagePath: undefined as string | undefined,
  profileId: 'profile-1',
};

describe('GameListItem', () => {
  it('renders the game title', () => {
    render(<GameListItem game={mockGame} />);
    expect(screen.getByText('Half-Life 3')).toBeInTheDocument();
  });

  it('displays the completion percentage', () => {
    render(<GameListItem game={mockGame} />);
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('shows first letter as placeholder when no icon image', () => {
    render(<GameListItem game={mockGame} />);
    expect(screen.getByText('H')).toBeInTheDocument();
  });

  it('renders icon image when iconImagePath is provided', () => {
    const gameWithIcon = { ...mockGame, iconImagePath: 'steam/12345/game_icon.jpg' };
    render(<GameListItem game={gameWithIcon} />);
    const img = screen.getByAltText('Half-Life 3') as HTMLImageElement;
    expect(img.src).toContain('/api/icons/steam/12345/game_icon.jpg');
  });

  it('displays customTitle when available', () => {
    const gameWithCustomTitle = { ...mockGame, customTitle: 'Custom Title' };
    render(<GameListItem game={gameWithCustomTitle} />);
    expect(screen.getByText('Custom Title')).toBeInTheDocument();
  });

  it('navigates to game detail on click', async () => {
    const user = userEvent.setup();
    render(<GameListItem game={mockGame} />);
    await user.click(screen.getByText('Half-Life 3'));
    expect(pushMock).toHaveBeenCalledWith('/steam/game/12345?profileId=profile-1');
  });

  it('shows gamerscore for Xbox games', () => {
    const xboxGame = { ...mockGame, platform: 'xbox' as const, currentGamerscore: 500, maxGamerscore: 1000 };
    render(<GameListItem game={xboxGame} />);
    expect(screen.getByText(/500/)).toBeInTheDocument();
    expect(screen.getByText(/1,000/)).toBeInTheDocument();
  });
});
