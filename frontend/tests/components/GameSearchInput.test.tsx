import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GameSearchInput from '../../components/GameSearchInput';

describe('GameSearchInput', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders search input with placeholder', () => {
    render(<GameSearchInput onSearch={vi.fn()} />);
    expect(screen.getByPlaceholderText('Search games...')).toBeInTheDocument();
  });

  it('renders with custom placeholder', () => {
    render(<GameSearchInput onSearch={vi.fn()} placeholder="Find a game..." />);
    expect(screen.getByPlaceholderText('Find a game...')).toBeInTheDocument();
  });

  it('debounces onSearch by 300ms', () => {
    const onSearch = vi.fn();
    render(<GameSearchInput onSearch={onSearch} />);

    const input = screen.getByPlaceholderText('Search games...');
    fireEvent.change(input, { target: { value: 'halo' } });

    // Should not have been called yet (within debounce window)
    expect(onSearch).not.toHaveBeenCalled();

    // Advance past debounce
    vi.advanceTimersByTime(300);
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith('halo');
  });

  it('shows clear button when input has value', () => {
    render(<GameSearchInput onSearch={vi.fn()} />);

    // No clear button initially
    expect(screen.queryByLabelText('Clear search')).not.toBeInTheDocument();

    const input = screen.getByPlaceholderText('Search games...');
    fireEvent.change(input, { target: { value: 'test' } });

    // Clear button should now appear
    expect(screen.getByLabelText('Clear search')).toBeInTheDocument();
  });

  it('clears input and calls onSearch with empty string on clear', () => {
    const onSearch = vi.fn();
    render(<GameSearchInput onSearch={onSearch} />);

    const input = screen.getByPlaceholderText('Search games...');
    fireEvent.change(input, { target: { value: 'test' } });
    vi.advanceTimersByTime(300);
    onSearch.mockClear();

    fireEvent.click(screen.getByLabelText('Clear search'));

    expect(onSearch).toHaveBeenCalledWith('');
    expect(input).toHaveValue('');
  });

  it('trims whitespace from search value', () => {
    const onSearch = vi.fn();
    render(<GameSearchInput onSearch={onSearch} />);

    const input = screen.getByPlaceholderText('Search games...');
    fireEvent.change(input, { target: { value: '  halo  ' } });
    vi.advanceTimersByTime(300);

    expect(onSearch).toHaveBeenCalledWith('halo');
  });
});
