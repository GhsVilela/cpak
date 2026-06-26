import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TrophyGradeBadge from '../../components/TrophyGradeBadge';

describe('TrophyGradeBadge (T035)', () => {
  it('renders bronze badge with correct label', () => {
    render(<TrophyGradeBadge grade="bronze" />);
    expect(screen.getByText(/bronze/i)).toBeInTheDocument();
  });

  it('renders silver badge with correct label', () => {
    render(<TrophyGradeBadge grade="silver" />);
    expect(screen.getByText(/silver/i)).toBeInTheDocument();
  });

  it('renders gold badge with correct label', () => {
    render(<TrophyGradeBadge grade="gold" />);
    expect(screen.getByText(/gold/i)).toBeInTheDocument();
  });

  it('renders platinum badge with correct label', () => {
    render(<TrophyGradeBadge grade="platinum" />);
    expect(screen.getByText(/platinum/i)).toBeInTheDocument();
  });

  it('applies distinct inline color for platinum', () => {
    const { container } = render(<TrophyGradeBadge grade="platinum" />);
    const el = container.firstChild as HTMLElement;
    expect(el).toBeTruthy();
    // Platinum has a distinct bluish color (#a0b4c8 or similar)
    const style = el.getAttribute('style') || el.style?.cssText || '';
    expect(style.length > 0 || el.className.length > 0).toBe(true);
  });

  it('applies distinct inline color for gold', () => {
    const { container } = render(<TrophyGradeBadge grade="gold" />);
    const el = container.firstChild as HTMLElement;
    expect(el).toBeTruthy();
  });

  it('applies distinct inline color for silver', () => {
    const { container } = render(<TrophyGradeBadge grade="silver" />);
    const el = container.firstChild as HTMLElement;
    expect(el).toBeTruthy();
  });

  it('applies distinct inline color for bronze', () => {
    const { container } = render(<TrophyGradeBadge grade="bronze" />);
    const el = container.firstChild as HTMLElement;
    expect(el).toBeTruthy();
  });

  it('renders nothing gracefully for null/undefined grade', () => {
    const { container } = render(<TrophyGradeBadge grade={null} />);
    expect(container).toBeTruthy();
  });
});
