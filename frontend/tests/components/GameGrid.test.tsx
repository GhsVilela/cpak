import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import GameGrid from '../../components/GameGrid';

// GameTile uses next/navigation, so mock it
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const makeGame = (id: string) => ({
  _id: id,
  gameId: id,
  title: `Game ${id}`,
  platform: 'steam' as const,
  achievementsTotal: 10,
  achievementsUnlocked: 5,
  completionPercent: 50,
  imagePath: undefined,
  capsuleImagePath: undefined,
  profileId: 'profile-1',
});

describe('GameGrid', () => {
  it('renders empty message when games array is empty', () => {
    render(<GameGrid games={[]} emptyMessage="No games found" />);
    expect(screen.getByText('No games found')).toBeInTheDocument();
  });

  it('renders a skeleton/loading state when loading=true', () => {
    const { container } = render(<GameGrid games={[]} loading={true} />);
    // Loading state renders animated pulse divs
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('renders the correct number of game tiles when populated', () => {
    const games = [makeGame('1'), makeGame('2'), makeGame('3')];
    render(<GameGrid games={games} />);
    expect(screen.getAllByText(/Game \d/)).toHaveLength(3);
  });

  it('uses the default empty message when no emptyMessage prop is provided', () => {
    render(<GameGrid games={[]} />);
    expect(screen.getByText('No games found')).toBeInTheDocument();
  });
});
