import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GameHeroCard from '../../components/GameHeroCard';

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
  heroImagePath: undefined as string | undefined,
  profileId: 'profile-1',
};

describe('GameHeroCard', () => {
  it('renders the game title', () => {
    render(<GameHeroCard game={mockGame} />);
    expect(screen.getByText('Half-Life 3')).toBeInTheDocument();
  });

  it('displays the completion percentage', () => {
    render(<GameHeroCard game={mockGame} />);
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('shows first letter as placeholder when no hero image', () => {
    render(<GameHeroCard game={mockGame} />);
    expect(screen.getByText('H')).toBeInTheDocument();
  });

  it('renders hero image when heroImagePath is provided', () => {
    const gameWithHero = { ...mockGame, heroImagePath: 'steam/12345/game_hero.jpg' };
    render(<GameHeroCard game={gameWithHero} />);
    const img = screen.getByAltText('Half-Life 3') as HTMLImageElement;
    expect(img.src).toContain('/api/icons/steam/12345/game_hero.jpg');
  });

  it('does not show a separate completion badge at 100%', () => {
    const completedGame = { ...mockGame, completionPercent: 100, achievementsUnlocked: 20 };
    render(<GameHeroCard game={completedGame} />);
    expect(screen.getAllByText('100%')).toHaveLength(1);
    expect(screen.queryByText('Perfect Game')).toBeNull();
  });

  it('displays customTitle when available', () => {
    const gameWithCustomTitle = { ...mockGame, customTitle: 'Custom Title' };
    render(<GameHeroCard game={gameWithCustomTitle} />);
    expect(screen.getByText('Custom Title')).toBeInTheDocument();
  });

  it('navigates to game detail on click', async () => {
    const user = userEvent.setup();
    render(<GameHeroCard game={mockGame} />);
    await user.click(screen.getByText('Half-Life 3'));
    expect(pushMock).toHaveBeenCalledWith('/steam/game/12345?profileId=profile-1');
  });

  it('shows achievements and gamerscore for Xbox games', () => {
    const game = {
      ...mockGame,
      platform: 'xbox' as const,
      currentGamerscore: 500,
      maxGamerscore: 1000,
    };
    render(<GameHeroCard game={game} />);
    expect(screen.getByText('10 / 20')).toBeInTheDocument();
    expect(screen.getByText(/500/)).toBeInTheDocument();
    expect(screen.getByText(/1,000/)).toBeInTheDocument();
  });

  it('shows the plain Mythic icon right after the hero title', () => {
    const game = {
      ...mockGame,
      platform: 'xbox' as const,
      currentGamerscore: 1000,
      maxGamerscore: 1000,
      isMythic: true,
    };
    render(<GameHeroCard game={game} />);
    const icon = screen.getByRole('img', { name: 'Mythic achievement earned' });

    // The icon is rendered bare next to the title, with no badge wrapper.
    const title = screen.getByText('Half-Life 3');
    const titleRow = title.parentElement!;
    expect(title.nextElementSibling).toBe(icon);
    expect(icon.parentElement).toBe(titleRow);
    expect(titleRow).not.toContainElement(
      screen.getByText('50%'),
    );
    expect(screen.getAllByText('•')).toHaveLength(1);
  });

  it('does not show the Mythic icon when the Mythic is locked', () => {
    const game = {
      ...mockGame,
      platform: 'xbox' as const,
      currentGamerscore: 500,
      maxGamerscore: 1000,
      isMythic: false,
    };
    render(<GameHeroCard game={game} />);
    expect(screen.queryByRole('img', { name: /Mythic achievement/ })).toBeNull();
  });

  it('shows the platinum icon in a circular badge next to the hero title', () => {
    const game = {
      ...mockGame,
      platform: 'playstation' as const,
      trophyPlatinum: 1,
    };
    render(<GameHeroCard game={game} />);
    const icon = screen.getByRole('img', { name: 'Platinum trophy earned' });
    const badge = icon.parentElement!;
    expect(badge).toHaveClass('rounded-full');
    expect(screen.getByText('Half-Life 3').nextElementSibling).toBe(badge);
  });

  it('does not show the platinum icon when the Platinum is locked', () => {
    const game = {
      ...mockGame,
      platform: 'playstation' as const,
      trophyPlatinum: 0,
    };
    render(<GameHeroCard game={game} />);
    expect(screen.queryByRole('img', { name: 'Platinum trophy earned' })).toBeNull();
  });

  it('shows the Steam completion icon when the base game is complete', () => {
    const game = {
      ...mockGame,
      completionPercent: 80,
      hasAchievementGroups: true,
      baseGameAchievementsTotal: 20,
      baseGameAchievementsUnlocked: 20,
    };
    render(<GameHeroCard game={game} />);
    const icon = screen.getByRole('img', { name: 'Completed game' });
    expect(screen.getByText('Half-Life 3').nextElementSibling).toBe(icon);
  });

  it('does not show the Steam completion icon when the base game is incomplete', () => {
    const game = {
      ...mockGame,
      completionPercent: 95,
      hasAchievementGroups: true,
      baseGameAchievementsTotal: 20,
      baseGameAchievementsUnlocked: 19,
    };
    render(<GameHeroCard game={game} />);
    expect(screen.queryByRole('img', { name: 'Completed game' })).toBeNull();
  });

  it('shows PlayStation trophy counts alongside achievement totals', () => {
    const game = {
      ...mockGame,
      platform: 'playstation' as const,
      trophyPlatinum: 1,
      trophyGold: 5,
      trophySilver: 10,
      trophyBronze: 20,
    };
    render(<GameHeroCard game={game} />);
    expect(screen.getByText('10 / 20')).toBeInTheDocument();
    expect(screen.getByLabelText('Platinum trophy')).toBeInTheDocument();
    expect(screen.getByLabelText('Bronze trophy')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
  });

  it('shows zeroed gold, silver and bronze counts but hides unearned platinum', () => {
    const game = {
      ...mockGame,
      platform: 'playstation' as const,
      trophyPlatinum: 0,
      trophyGold: 0,
      trophySilver: 0,
      trophyBronze: 0,
    };
    render(<GameHeroCard game={game} />);
    expect(screen.queryByLabelText('Platinum trophy')).toBeNull();
    expect(screen.getByLabelText('Gold trophy')).toBeInTheDocument();
    expect(screen.getByLabelText('Silver trophy')).toBeInTheDocument();
    expect(screen.getByLabelText('Bronze trophy')).toBeInTheDocument();
    expect(screen.getAllByText('0')).toHaveLength(3);
  });
});
