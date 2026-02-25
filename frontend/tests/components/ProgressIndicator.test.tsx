import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProgressIndicator from '../../components/ProgressIndicator';

describe('ProgressIndicator', () => {
  it('renders the status text', () => {
    render(<ProgressIndicator current={5} total={10} percentage={50} status="Syncing..." />);
    expect(screen.getByText('Syncing...')).toBeInTheDocument();
  });

  it('renders the percentage value', () => {
    render(<ProgressIndicator current={5} total={10} percentage={50} status="Syncing..." />);
    expect(screen.getByText(/50\.0%/)).toBeInTheDocument();
  });

  it('renders 0% correctly', () => {
    render(<ProgressIndicator current={0} total={100} percentage={0} status="Starting" />);
    expect(screen.getByText(/0\.0%/)).toBeInTheDocument();
  });

  it('renders 100% correctly', () => {
    render(<ProgressIndicator current={100} total={100} percentage={100} status="Done" />);
    expect(screen.getByText(/100\.0%/)).toBeInTheDocument();
  });

  it('clamps percentage above 100 to 100%', () => {
    render(<ProgressIndicator current={110} total={100} percentage={110} status="Over" />);
    expect(screen.getByText(/100\.0%/)).toBeInTheDocument();
  });

  it('shows current/total numbers when showNumbers=true (default)', () => {
    render(<ProgressIndicator current={7} total={20} percentage={35} status="Working" />);
    expect(screen.getByText('7 / 20')).toBeInTheDocument();
  });

  it('hides numbers when showNumbers=false', () => {
    render(
      <ProgressIndicator current={7} total={20} percentage={35} status="Working" showNumbers={false} />,
    );
    expect(screen.queryByText('7 / 20')).not.toBeInTheDocument();
  });

  it('renders the label instead of status when label is provided', () => {
    render(
      <ProgressIndicator current={5} total={10} percentage={50} status="Syncing" label="My Label" />,
    );
    expect(screen.getByText('My Label')).toBeInTheDocument();
    expect(screen.queryByText('Syncing')).not.toBeInTheDocument();
  });
});
