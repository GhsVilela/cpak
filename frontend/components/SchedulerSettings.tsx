'use client';

import { useState } from 'react';

export interface SchedulerSetting {
  scheduler_enabled?: string;
  scheduler_cron?: string;
}

interface SchedulerSettingsProps {
  values: SchedulerSetting;
  onChange: (key: keyof SchedulerSetting, value: string) => void;
  onSave: () => Promise<void>;
}

const COMMON_SCHEDULES = [
  { label: 'Daily at 3:00 AM', cron: '0 3 * * *' },
  { label: 'Daily at midnight', cron: '0 0 * * *' },
  { label: 'Every 6 hours', cron: '0 */6 * * *' },
  { label: 'Every 12 hours', cron: '0 */12 * * *' },
  { label: 'Weekly (Sunday at midnight)', cron: '0 0 * * 0' },
  { label: 'Monthly (1st at midnight)', cron: '0 0 1 * *' },
];

const getCronDescription = (cron: string): string => {
  if (!cron) return '';
  
  const found = COMMON_SCHEDULES.find(s => s.cron === cron);
  if (found) return found.label;
  
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return 'Invalid cron expression';
  
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  
  let desc = 'Runs ';
  
  if (dayOfWeek !== '*') {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayNum = parseInt(dayOfWeek);
    if (!isNaN(dayNum) && dayNum >= 0 && dayNum <= 6) {
      desc += `every ${days[dayNum]} `;
    } else {
      desc += `on day of week ${dayOfWeek} `;
    }
  } else if (dayOfMonth !== '*') {
    desc += `on day ${dayOfMonth} of every month `;
  } else {
    desc += 'every day ';
  }
  
  if (hour !== '*' && minute !== '*') {
    const h = parseInt(hour);
    const m = parseInt(minute);
    if (!isNaN(h) && !isNaN(m)) {
      const period = h >= 12 ? 'PM' : 'AM';
      const displayHour = h > 12 ? h - 12 : h === 0 ? 12 : h;
      desc += `at ${displayHour}:${m.toString().padStart(2, '0')} ${period}`;
    } else {
      desc += `at hour ${hour}, minute ${minute}`;
    }
  } else if (hour === '*' && minute !== '*') {
    desc += `at minute ${minute} of every hour`;
  } else if (hour !== '*') {
    desc += `at hour ${hour}`;
  }
  
  return desc;
};

export default function SchedulerSettings({ values, onChange, onSave }: SchedulerSettingsProps) {
  const [saving, setSaving] = useState(false);
  const [customCron, setCustomCron] = useState(values.scheduler_cron || '0 3 * * *');

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave();
    } finally {
      setSaving(false);
    }
  };

  const handleCronChange = (cron: string) => {
    setCustomCron(cron);
    onChange('scheduler_cron', cron);
  };

  const isEnabled = values.scheduler_enabled === 'true';
  const cronValue = values.scheduler_cron || '0 3 * * *';

  return (
    <div className="bg-gray-900 rounded-lg p-6 space-y-6">
      <div className="border-b border-gray-800 pb-4">
        <h2 className="text-xl font-semibold text-white">Automatic Sync Scheduler</h2>
        <p className="text-sm text-gray-400 mt-1">
          Configure automatic synchronization of all profiles on a schedule.
        </p>
      </div>

      <div className="space-y-6">
        {/* Enable/Disable Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium text-gray-300">Enable Automatic Sync</label>
            <p className="text-xs text-gray-500 mt-1">
              When enabled, all profiles will sync automatically according to the schedule below.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onChange('scheduler_enabled', isEnabled ? 'false' : 'true')}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              isEnabled ? 'bg-blue-600' : 'bg-gray-700'
            }`}
            role="switch"
            aria-checked={isEnabled}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                isEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Schedule Selection */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Sync Schedule
            </label>
            <select
              value={cronValue}
              onChange={(e) => handleCronChange(e.target.value)}
              disabled={!isEnabled}
              className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-2 text-white disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:border-blue-500"
            >
              {COMMON_SCHEDULES.map(({ label, cron }) => (
                <option key={cron} value={cron}>
                  {label}
                </option>
              ))}
              <option value="custom">Custom...</option>
            </select>
          </div>

          {/* Custom Cron Expression */}
          {cronValue === 'custom' && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Custom Cron Expression
              </label>
              <input
                type="text"
                value={customCron}
                onChange={(e) => handleCronChange(e.target.value)}
                disabled={!isEnabled}
                placeholder="0 3 * * *"
                className="w-full bg-gray-800 border border-gray-700 rounded px-4 py-2 text-white disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:border-blue-500 font-mono"
              />
              <p className="text-xs text-gray-500 mt-1">
                Format: minute hour day month weekday (e.g., "0 3 * * *" = Daily at 3:00 AM)
              </p>
            </div>
          )}

          {/* Cron Description */}
          {isEnabled && cronValue && cronValue !== 'custom' && (
            <div className="bg-gray-800 rounded px-4 py-3 border border-gray-700">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-sm text-gray-300 font-medium">Schedule:</p>
                  <p className="text-sm text-gray-400 mt-1">{getCronDescription(cronValue)}</p>
                  <p className="text-xs text-gray-500 mt-1 font-mono">{cronValue}</p>
                </div>
              </div>
            </div>
          )}

          {customCron && cronValue === 'custom' && (
            <div className="bg-gray-800 rounded px-4 py-3 border border-gray-700">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-sm text-gray-300 font-medium">Custom Schedule:</p>
                  <p className="text-sm text-gray-400 mt-1">{getCronDescription(customCron)}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-gray-800 pt-6">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium px-6 py-2 rounded transition-colors"
        >
          {saving ? 'Saving...' : 'Save Scheduler Settings'}
        </button>
      </div>
    </div>
  );
}
