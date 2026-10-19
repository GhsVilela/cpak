import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GameToolbar from '../../components/GameToolbar';

const baseProps = {
  onSearch: vi.fn(),
  viewMode: 'capsule' as const,
  onViewModeChange: vi.fn(),
  onlyCompleted: false,
  onOnlyCompletedChange: vi.fn(),
  showHidden: false,
  onShowHiddenChange: vi.fn(),
  generationOptions: [
    { value: '', label: 'All Platforms' },
    { value: 'PS5', label: 'PS5' },
  ],
  generationFilter: '',
  onGenerationFilterChange: vi.fn(),
  sortByOptions: [
    { value: 'title', label: 'Title' },
    { value: 'completionPercent', label: 'Completion %' },
  ],
  sortBy: 'completionPercent',
  onSortByChange: vi.fn(),
  sortOrder: 'desc' as const,
  onSortOrderChange: vi.fn(),
};

describe('GameToolbar', () => {
  it('renders search input and view mode selector', () => {
    render(<GameToolbar {...baseProps} />);
    expect(screen.getByPlaceholderText('Search games...')).toBeInTheDocument();
    expect(screen.getByTitle('Grid')).toBeInTheDocument();
    expect(screen.getByTitle('List')).toBeInTheDocument();
    expect(screen.getByTitle('Hero')).toBeInTheDocument();
  });

  it('renders toggles, platform filter and sort controls', () => {
    render(<GameToolbar {...baseProps} />);
    const toggles = screen.getAllByRole('switch');
    expect(toggles).toHaveLength(2);
    expect(toggles[0]).toHaveAttribute('aria-checked', 'false');
    expect(toggles[1]).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('100% Only')).toBeInTheDocument();
    expect(screen.getByText('Show Hidden')).toBeInTheDocument();
    expect(screen.getAllByRole('combobox')).toHaveLength(3);
  });

  it('does not render platform filter when no generationOptions are provided', () => {
    render(<GameToolbar {...baseProps} generationOptions={undefined} generationFilter="" onGenerationFilterChange={vi.fn()} />);
    expect(screen.queryByText('Platform:')).not.toBeInTheDocument();
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
  });

  it('shows a mobile filter icon button that expands the filter panel', async () => {
    const user = userEvent.setup();
    render(<GameToolbar {...baseProps} />);
    const button = screen.getByRole('button', { name: /toggle filters/i });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    await user.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
  });

  it('shows active filter count badge when non-default filters are active', () => {
    render(<GameToolbar {...baseProps} onlyCompleted showHidden sortOrder="asc" />);
    const button = screen.getByRole('button', { name: /toggle filters/i });
    expect(within(button).getByText('3')).toBeInTheDocument();
  });

  it('hides the count badge when filters match defaults', () => {
    render(<GameToolbar {...baseProps} />);
    const button = screen.getByRole('button', { name: /toggle filters/i });
    expect(within(button).queryByText('1')).not.toBeInTheDocument();
  });

  it('calls toggle and filter callbacks', async () => {
    const user = userEvent.setup();
    const props = {
      ...baseProps,
      onOnlyCompletedChange: vi.fn(),
      onShowHiddenChange: vi.fn(),
      onGenerationFilterChange: vi.fn(),
      onSortByChange: vi.fn(),
      onSortOrderChange: vi.fn(),
    };
    render(<GameToolbar {...props} />);
    await user.click(screen.getAllByRole('switch')[0]);
    expect(props.onOnlyCompletedChange).toHaveBeenCalledWith(true);
    await user.click(screen.getAllByRole('switch')[1]);
    expect(props.onShowHiddenChange).toHaveBeenCalledWith(true);
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'PS5');
    expect(props.onGenerationFilterChange).toHaveBeenCalledWith('PS5');
    await user.selectOptions(screen.getAllByRole('combobox')[1], 'title');
    expect(props.onSortByChange).toHaveBeenCalledWith('title');
    await user.selectOptions(screen.getAllByRole('combobox')[2], 'asc');
    expect(props.onSortOrderChange).toHaveBeenCalledWith('asc');
  });

  it('calls search and view mode callbacks', async () => {
    const user = userEvent.setup();
    const props = { ...baseProps, onSearch: vi.fn(), onViewModeChange: vi.fn() };
    render(<GameToolbar {...props} />);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      fireEvent.change(screen.getByPlaceholderText('Search games...'), { target: { value: 'God of War' } });
      vi.advanceTimersByTime(300);
    } finally {
      vi.useRealTimers();
    }
    expect(props.onSearch).toHaveBeenCalledWith('God of War');
    await user.click(screen.getByTitle('List'));
    expect(props.onViewModeChange).toHaveBeenCalledWith('list');
  });
});