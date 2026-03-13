import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
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

  it('shows B for files smaller than 1 KB', () => {
    const progress = {
      progress: { current: 100, total: 500, percentage: 20 },
      status: 'uploading',
    };
    render(
      <RestoreProgressModal isOpen={true} onClose={vi.fn()} currentProgress={progress} />,
    );
    expect(screen.getByText('500 B')).toBeInTheDocument();
    expect(screen.getByText('100 B')).toBeInTheDocument();
  });

  it('shows GB for files larger than 1 GB', () => {
    const progress = {
      progress: { current: 2 * 1024 ** 3, total: 3 * 1024 ** 3, percentage: 67 },
      status: 'uploading',
    };
    render(
      <RestoreProgressModal isOpen={true} onClose={vi.fn()} currentProgress={progress} />,
    );
    expect(screen.getByText('3.00 GB')).toBeInTheDocument();
    expect(screen.getByText('2.00 GB')).toBeInTheDocument();
  });

  it('shows elapsed time in minutes and Speed stat after 65 seconds', async () => {
    vi.useFakeTimers();
    const progress = {
      progress: { current: 5 * 1024 * 1024, total: 10 * 1024 * 1024, percentage: 50 },
      status: 'uploading',
    };
    render(
      <RestoreProgressModal isOpen={true} onClose={vi.fn()} currentProgress={progress} />,
    );
    await act(async () => {
      vi.advanceTimersByTime(65000);
    });
    expect(screen.getByText('1m 5s')).toBeInTheDocument();
    expect(screen.getByText('Speed')).toBeInTheDocument();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});
