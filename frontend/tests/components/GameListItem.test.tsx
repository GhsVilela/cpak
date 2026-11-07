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

  it('includes a trailing-slash list URL in returnTo', async () => {
    const originalUrl = `${window.location.pathname}${window.location.search}`;
    window.history.replaceState({}, '', '/steam/?profileId=profile-1&page=2');

    try {
      const user = userEvent.setup();
      render(<GameListItem game={mockGame} />);
      await user.click(screen.getByText('Half-Life 3'));

      expect(pushMock).toHaveBeenCalledWith(
        '/steam/game/12345?profileId=profile-1&returnTo=' +
          encodeURIComponent('/steam/?profileId=profile-1&page=2'),
      );
    } finally {
      window.history.replaceState({}, '', originalUrl);
    }
  });

  it('shows achievements and gamerscore for Xbox games', () => {
    const xboxGame = { ...mockGame, platform: 'xbox' as const, currentGamerscore: 500, maxGamerscore: 1000 };
    render(<GameListItem game={xboxGame} />);
    expect(screen.getByText('10 / 20')).toBeInTheDocument();
    expect(screen.getByText(/500/)).toBeInTheDocument();
    expect(screen.getByText(/1,000/)).toBeInTheDocument();
  });

  it('does not show a Mythic icon next to the title', () => {
    const xboxGame = {
      ...mockGame,
      platform: 'xbox' as const,
      currentGamerscore: 1000,
      maxGamerscore: 1000,
      isMythic: true,
    };
    render(<GameListItem game={xboxGame} />);
    expect(screen.queryByRole('img', { name: /Mythic achievement/ })).toBeNull();
  });

  it('does not show a Platinum badge next to the title', () => {
    const psGame = {
      ...mockGame,
      platform: 'playstation' as const,
      trophyPlatinum: 1,
      trophyGold: 5,
    };
    render(<GameListItem game={psGame} />);
    expect(screen.queryByRole('img', { name: 'Platinum trophy earned' })).toBeNull();
  });

  it('does not show a Steam completion icon next to the title', () => {
    const steamGame = {
      ...mockGame,
      completionPercent: 80,
      hasAchievementGroups: true,
      baseGameAchievementsTotal: 20,
      baseGameAchievementsUnlocked: 20,
    };
    render(<GameListItem game={steamGame} />);
    expect(screen.queryByRole('img', { name: 'Completed game' })).toBeNull();
  });

  it('shows PlayStation trophy counts alongside achievement totals', () => {
    const psGame = {
      ...mockGame,
      platform: 'playstation' as const,
      trophyPlatinum: 1,
      trophyGold: 5,
      trophySilver: 10,
      trophyBronze: 20,
    };
    render(<GameListItem game={psGame} />);
    expect(screen.getByText('10 / 20')).toBeInTheDocument();
    expect(screen.getByLabelText('Platinum trophy')).toBeInTheDocument();
    expect(screen.getByLabelText('Silver trophy')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
  });

  it('shows zeroed gold, silver and bronze trophies but hides unearned platinum without a Platinum trophy', () => {
    const psGame = {
      ...mockGame,
      platform: 'playstation' as const,
      trophyPlatinum: 0,
      trophyGold: 0,
      trophySilver: 0,
      trophyBronze: 0,
    };
    render(<GameListItem game={psGame} />);
    expect(screen.queryByLabelText('Platinum trophy')).toBeNull();
    expect(screen.getByLabelText('Gold trophy')).toBeInTheDocument();
    expect(screen.getByLabelText('Silver trophy')).toBeInTheDocument();
    expect(screen.getByLabelText('Bronze trophy')).toBeInTheDocument();
    expect(screen.getAllByText('0')).toHaveLength(3);
  });

  it('shows zeroed platinum when the game defines a Platinum trophy', () => {
    const psGame = {
      ...mockGame,
      platform: 'playstation' as const,
      trophyPlatinum: 0,
      trophyGold: 0,
      trophySilver: 0,
      trophyBronze: 0,
      hasPlatinum: true,
    };
    render(<GameListItem game={psGame} />);
    expect(screen.getByLabelText('Platinum trophy')).toBeInTheDocument();
    expect(screen.getByTitle('0 platinum trophies')).toBeInTheDocument();
    expect(screen.getAllByText('0')).toHaveLength(4);
  });
});
