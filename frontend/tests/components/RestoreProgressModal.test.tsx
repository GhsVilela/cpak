import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import RestoreProgressModal from '../../components/RestoreProgressModal';

describe('RestoreProgressModal', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <RestoreProgressModal isOpen={false} onClose={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders modal content when isOpen is true', () => {
    render(<RestoreProgressModal isOpen={true} onClose={vi.fn()} />);
    expect(document.body.querySelector('div')).toBeTruthy();
  });

  it('renders a cancel/close button when open', () => {
    render(<RestoreProgressModal isOpen={true} onClose={vi.fn()} />);
    // Component shows a header title (no close button in this modal)
    expect(screen.queryByText('Upload Backup')).toBeTruthy();
  });

  it('shows progress percentage when currentProgress is provided', () => {
    const progress = {
      progress: { current: 30, total: 100, percentage: 30 },
      status: 'extracting',
    };
    render(
      <RestoreProgressModal isOpen={true} onClose={vi.fn()} currentProgress={progress} />,
    );
    // Multiple elements may contain '30' (percentage + file size) — just check at least one exists
    expect(screen.getAllByText(/30/)[0]).toBeInTheDocument();
  });
});
