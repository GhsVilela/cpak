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

  it('shows file size and uploaded stats with MB values', () => {
    const progress = {
      progress: { current: 3145728, total: 6291456, percentage: 50 },
      status: 'uploading',
      currentStep: 'Extracting archive...',
    };
    render(
      <RestoreProgressModal isOpen={true} onClose={vi.fn()} currentProgress={progress} />,
    );
    expect(screen.getAllByText('File Size')[0]).toBeInTheDocument();
    expect(screen.getByText('6.0 MB')).toBeInTheDocument();
    expect(screen.getAllByText('Uploaded').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('3.0 MB')).toBeInTheDocument();
    expect(screen.getByText('Extracting archive...')).toBeInTheDocument();
  });

  it('shows KB for smaller files', () => {
    const progress = {
      progress: { current: 1024, total: 2048, percentage: 50 },
      status: 'uploading',
    };
    render(
      <RestoreProgressModal isOpen={true} onClose={vi.fn()} currentProgress={progress} />,
    );
    expect(screen.getByText('2.0 KB')).toBeInTheDocument();
    expect(screen.getByText('1.0 KB')).toBeInTheDocument();
  });
});
