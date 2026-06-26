import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ViewModeSelector from '../../components/ViewModeSelector';

describe('ViewModeSelector', () => {
  it('renders all three view mode buttons', () => {
    render(<ViewModeSelector viewMode="capsule" onViewModeChange={vi.fn()} />);
    expect(screen.getByTitle('Grid')).toBeInTheDocument();
    expect(screen.getByTitle('List')).toBeInTheDocument();
    expect(screen.getByTitle('Hero')).toBeInTheDocument();
  });

  it('highlights the active view mode', () => {
    render(<ViewModeSelector viewMode="list" onViewModeChange={vi.fn()} />);
    const listBtn = screen.getByTitle('List');
    expect(listBtn.getAttribute('aria-pressed')).toBe('true');
    const gridBtn = screen.getByTitle('Grid');
    expect(gridBtn.getAttribute('aria-pressed')).toBe('false');
  });

  it('calls onViewModeChange when a mode is clicked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ViewModeSelector viewMode="capsule" onViewModeChange={onChange} />);
    await user.click(screen.getByTitle('Hero'));
    expect(onChange).toHaveBeenCalledWith('hero');
  });

  it('calls onViewModeChange with list when List is clicked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ViewModeSelector viewMode="capsule" onViewModeChange={onChange} />);
    await user.click(screen.getByTitle('List'));
    expect(onChange).toHaveBeenCalledWith('list');
  });
});
