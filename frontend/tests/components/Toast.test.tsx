import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Toast from '../../components/Toast';

describe('Toast', () => {
  it('renders the provided message', () => {
    render(<Toast message="Operation complete" onClose={vi.fn()} />);
    expect(screen.getByText('Operation complete')).toBeInTheDocument();
  });

  it('applies success background class for type="success"', () => {
    const { container } = render(
      <Toast message="Saved!" type="success" onClose={vi.fn()} duration={0} />,
    );
    expect(container.firstChild).toBeTruthy();
    // bg-green-600 class should appear somewhere in the tree
    expect(container.innerHTML).toContain('bg-green-600');
  });

  it('applies error background class for type="error"', () => {
    const { container } = render(
      <Toast message="Failed!" type="error" onClose={vi.fn()} duration={0} />,
    );
    expect(container.innerHTML).toContain('bg-red-600');
  });

  it('calls onClose after the specified duration', async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<Toast message="Auto dismiss" onClose={onClose} duration={1000} />);
    expect(onClose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(onClose).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('does NOT auto-dismiss when duration is 0', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<Toast message="No auto dismiss" onClose={onClose} duration={0} />);
    vi.advanceTimersByTime(10000);
    expect(onClose).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('displays error code when provided', () => {
    render(
      <Toast message="Network error" type="error" onClose={vi.fn()} duration={0} errorCode="E001" />,
    );
    expect(screen.getByText(/E001/)).toBeInTheDocument();
  });
});
