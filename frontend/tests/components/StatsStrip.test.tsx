import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatsStrip, StatTile } from '../../components/StatsStrip';

describe('StatsStrip', () => {
  it('renders a row of tiles with label and value', () => {
    render(
      <StatsStrip>
        <StatTile label="Gamerscore" value={1200} />
        <StatTile label="Synced" value="26/06/2026" />
      </StatsStrip>
    );
    expect(screen.getByText('Gamerscore')).toBeInTheDocument();
    expect(screen.getByText('1200')).toBeInTheDocument();
    expect(screen.getByText('Synced')).toBeInTheDocument();
    expect(screen.getByText('26/06/2026')).toBeInTheDocument();
  });

  it('applies the accent value class on mobile', () => {
    render(<StatTile label="Tracked" value={155} valueClassName="text-yellow-400" />);
    expect(screen.getByText('155')).toHaveClass('text-yellow-400');
  });

  it('renders a colored dot when dotColor is provided', () => {
    render(<StatTile label="Platinum" value={3} dotColor="#a0b4c8" />);
    const dot = screen.getByText('●');
    expect(dot).toHaveStyle({ color: '#a0b4c8' });
  });

  it('spans both columns when spanFull is set', () => {
    render(<StatTile label="Synced" value="26/06/2026" spanFull />);
    expect(screen.getByText('Synced').closest('div')).toHaveClass('col-span-2');
  });

  it('renders tooltip from title', () => {
    render(<StatTile label="Untracked" value={0} title="explanation text" />);
    expect(screen.getByTitle('explanation text')).toBeInTheDocument();
  });

  it('renders without a value', () => {
    render(<StatTile label="Synced" />);
    expect(screen.getByText('Synced')).toBeInTheDocument();
  });
});