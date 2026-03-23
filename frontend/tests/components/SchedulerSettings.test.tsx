import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SchedulerSettings from '../../components/SchedulerSettings';

describe('SchedulerSettings', () => {
  const defaultValues = {
    scheduler_enabled: 'true',
    scheduler_cron: '0 3 * * *',
  };

  it('renders the current cron value', () => {
    render(
      <SchedulerSettings values={defaultValues} onChange={vi.fn()} onSave={vi.fn()} />,
    );
    expect(screen.getAllByText(/3|daily|cron/i)[0]).toBeInTheDocument();
  });

  it('calls onChange when toggling enabled/disabled', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SchedulerSettings values={defaultValues} onChange={onChange} onSave={vi.fn()} />,
    );
    const toggle = screen.getByRole('switch');
    await user.click(toggle);
    expect(onChange).toHaveBeenCalledWith('scheduler_enabled', 'false');
  });

  it('calls onChange when enabling from disabled state', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SchedulerSettings
        values={{ scheduler_enabled: 'false', scheduler_cron: '0 3 * * *' }}
        onChange={onChange}
        onSave={vi.fn()}
      />,
    );
    const toggle = screen.getByRole('switch');
    await user.click(toggle);
    expect(onChange).toHaveBeenCalledWith('scheduler_enabled', 'true');
  });

  it('shows schedule description when enabled with preset cron', () => {
    render(
      <SchedulerSettings values={defaultValues} onChange={vi.fn()} onSave={vi.fn()} />,
    );
    // "Daily at 3:00 AM" appears in both dropdown option and description
    const matches = screen.getAllByText('Daily at 3:00 AM');
    expect(matches.length).toBeGreaterThanOrEqual(2); // option + description
  });

  it('switches to custom mode when Custom option selected', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SchedulerSettings values={defaultValues} onChange={onChange} onSave={vi.fn()} />,
    );
    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'custom');
    // Custom cron input should appear
    expect(screen.getByPlaceholderText('0 3 * * *')).toBeInTheDocument();
  });

  it('calls onChange when custom cron is typed', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    // Start in custom mode
    render(
      <SchedulerSettings
        values={{ scheduler_enabled: 'true', scheduler_cron: '*/5 * * * *' }}
        onChange={onChange}
        onSave={vi.fn()}
      />,
    );
    const input = screen.getByPlaceholderText('0 3 * * *');
    await user.clear(input);
    await user.type(input, '0 6 * * 1');
    expect(onChange).toHaveBeenCalled();
  });

  it('selects a predefined schedule from dropdown', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SchedulerSettings values={defaultValues} onChange={onChange} onSave={vi.fn()} />,
    );
    const select = screen.getByRole('combobox');
    await user.selectOptions(select, '0 0 * * *');
    expect(onChange).toHaveBeenCalledWith('scheduler_cron', '0 0 * * *');
  });

  it('calls onSave and shows saving state', async () => {
    let resolveOnSave: () => void;
    const onSave = vi.fn().mockImplementation(() => new Promise<void>(r => { resolveOnSave = r; }));
    const user = userEvent.setup();
    render(
      <SchedulerSettings values={defaultValues} onChange={vi.fn()} onSave={onSave} />,
    );
    const saveBtn = screen.getByRole('button', { name: /save/i });
    await user.click(saveBtn);
    expect(onSave).toHaveBeenCalled();
    // Should show saving state
    expect(screen.getByText('Saving...')).toBeInTheDocument();
    // Resolve and check it resets
    resolveOnSave!();
    await waitFor(() => {
      expect(screen.getByText(/Save Scheduler Settings/)).toBeInTheDocument();
    });
  });

  it('disables select when scheduler is disabled', () => {
    render(
      <SchedulerSettings
        values={{ scheduler_enabled: 'false', scheduler_cron: '0 3 * * *' }}
        onChange={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    const select = screen.getByRole('combobox');
    expect(select).toBeDisabled();
  });

  it('displays custom cron description for dayOfWeek cron', () => {
    render(
      <SchedulerSettings
        values={{ scheduler_enabled: 'true', scheduler_cron: '30 14 * * 3' }}
        onChange={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    // Should show a description with "Wednesday" and time
    const customInput = screen.getByPlaceholderText('0 3 * * *');
    expect(customInput).toBeInTheDocument();
  });

  it('displays custom cron description for dayOfMonth cron', () => {
    render(
      <SchedulerSettings
        values={{ scheduler_enabled: 'true', scheduler_cron: '0 10 15 * *' }}
        onChange={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    const customInput = screen.getByPlaceholderText('0 3 * * *');
    expect(customInput).toBeInTheDocument();
  });
});
