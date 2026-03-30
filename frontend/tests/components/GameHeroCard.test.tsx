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

  it('shows 100% completion badge', () => {
    const completedGame = { ...mockGame, completionPercent: 100, achievementsUnlocked: 20 };
    render(<GameHeroCard game={completedGame} />);
    expect(screen.getAllByText('100%').length).toBeGreaterThanOrEqual(2);
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
});
