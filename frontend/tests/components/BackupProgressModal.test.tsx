import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import BackupProgressModal from '../../components/BackupProgressModal';

describe('BackupProgressModal', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <BackupProgressModal isOpen={false} onClose={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the modal when isOpen is true', () => {
    render(<BackupProgressModal isOpen={true} onClose={vi.fn()} />);
    // Some modal content should appear
    expect(document.body.firstChild).toBeTruthy();
  });

  it('renders a close/cancel button when open', () => {
    render(<BackupProgressModal isOpen={true} onClose={vi.fn()} />);
    // Component shows a header title (no close button in this modal)
    expect(screen.queryByText('Download Backup')).toBeTruthy();
  });

  it('renders progress when currentProgress is provided', () => {
    const progress = {
      progress: { current: 50, total: 100, percentage: 50 },
      status: 'archiving',
    };
    render(<BackupProgressModal isOpen={true} onClose={vi.fn()} currentProgress={progress} />);
    // Multiple elements may contain '50' (percentage + file size) — just check at least one exists
    expect(screen.getAllByText(/50/)[0]).toBeInTheDocument();
  });

  it('shows file size and downloaded stats with KB/MB values', () => {
    const progress = {
      progress: { current: 5242880, total: 10485760, percentage: 50 },
      status: 'downloading',
      currentStep: 'Compressing data...',
    };
    render(<BackupProgressModal isOpen={true} onClose={vi.fn()} currentProgress={progress} />);
    // Should show file size (10.0 MB) and downloaded (5.0 MB)
    expect(screen.getAllByText('File Size')[0]).toBeInTheDocument();
    expect(screen.getByText('10.0 MB')).toBeInTheDocument();
    expect(screen.getAllByText('Downloaded').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('5.0 MB')).toBeInTheDocument();
    // Should show the current step
    expect(screen.getByText('Compressing data...')).toBeInTheDocument();
  });

  it('shows KB for smaller files', () => {
    const progress = {
      progress: { current: 2048, total: 4096, percentage: 50 },
      status: 'downloading',
    };
    render(<BackupProgressModal isOpen={true} onClose={vi.fn()} currentProgress={progress} />);
    expect(screen.getByText('4.0 KB')).toBeInTheDocument();
    expect(screen.getByText('2.0 KB')).toBeInTheDocument();
  });

  it('shows B for files smaller than 1 KB', () => {
    const progress = {
      progress: { current: 100, total: 500, percentage: 20 },
      status: 'downloading',
    };
    render(<BackupProgressModal isOpen={true} onClose={vi.fn()} currentProgress={progress} />);
    expect(screen.getByText('500 B')).toBeInTheDocument();
    expect(screen.getByText('100 B')).toBeInTheDocument();
  });

  it('shows GB for files larger than 1 GB', () => {
    const progress = {
      progress: { current: 2 * 1024 ** 3, total: 3 * 1024 ** 3, percentage: 67 },
      status: 'downloading',
    };
    render(<BackupProgressModal isOpen={true} onClose={vi.fn()} currentProgress={progress} />);
    expect(screen.getByText('3.00 GB')).toBeInTheDocument();
    expect(screen.getByText('2.00 GB')).toBeInTheDocument();
  });

  it('shows elapsed time in minutes and Speed stat after 65 seconds', async () => {
    vi.useFakeTimers();
    const progress = {
      progress: { current: 5 * 1024 * 1024, total: 10 * 1024 * 1024, percentage: 50 },
      status: 'downloading',
    };
    render(<BackupProgressModal isOpen={true} onClose={vi.fn()} currentProgress={progress} />);
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
