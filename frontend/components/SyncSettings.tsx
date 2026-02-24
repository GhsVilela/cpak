'use client';

import { useState } from 'react';

export interface SyncSetting {
  sync_batch_size?: string;
  sync_concurrency?: string;
}

interface SyncSettingsProps {
  values: SyncSetting;
  onChange: (key: keyof SyncSetting, value: string) => void;
  onSave: () => Promise<void>;
}

export default function SyncSettings({ values, onChange, onSave }: SyncSettingsProps) {
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave();
    } finally {
      setSaving(false);
    }
  };

  const handlePresetClick = (batchSize: string, concurrency: string) => {
    // Update both values - parent uses functional setState so both updates will apply correctly
    onChange('sync_batch_size', batchSize);
    onChange('sync_concurrency', concurrency);
  };

  const batchSize = parseInt(values.sync_batch_size || '30');
  const concurrency = parseInt(values.sync_concurrency || '15');

  // Determine which preset is currently active
  const isConservative = batchSize === 20 && concurrency === 10;
  const isBalanced = batchSize === 30 && concurrency === 15;
  const isAggressive = batchSize === 50 && concurrency === 30;

  return (
    <div className="bg-gray-900 rounded-lg p-6 space-y-6">
      <div className="border-b border-gray-800 pb-4">
        <h2 className="text-xl font-semibold text-white">Sync Performance</h2>
        <p className="text-sm text-gray-400 mt-1">
          Configure synchronization performance settings. Higher values = faster syncs but more resource usage.
        </p>
        <p className="text-xs text-gray-500 mt-2">
          <strong>Note:</strong> Values may be automatically throttled during system slowdowns to maintain responsiveness.
        </p>
      </div>

      <div className="space-y-6">
        {/* Batch Size */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-300">Game Batch Size</label>
            <span className="text-sm font-mono text-blue-400">{batchSize}</span>
          </div>
          <input
            type="range"
            min="5"
            max="100"
            step="5"
            value={batchSize}
            onChange={(e) => onChange('sync_batch_size', e.target.value)}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>5 (slower)</span>
            <span>100 (fastest)</span>
          </div>
          <p className="text-xs text-gray-500">
            Number of games to process simultaneously during sync. Higher values use more memory.
          </p>
        </div>

        {/* Concurrency */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-300">Parallel Operations Concurrency</label>
            <span className="text-sm font-mono text-blue-400">{concurrency}</span>
          </div>
          <input
            type="range"
            min="1"
            max="50"
            step="1"
            value={concurrency}
            onChange={(e) => onChange('sync_concurrency', e.target.value)}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>1 (slower)</span>
            <span>50 (fastest)</span>
          </div>
          <p className="text-xs text-gray-500">
            Number of parallel operations (API calls, image downloads) to execute simultaneously. Higher values use more bandwidth and memory.
          </p>
        </div>

        {/* Performance Tips */}
        <div className="bg-gray-800 rounded px-4 py-3 border border-gray-700">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="space-y-2">
              <p className="text-sm text-gray-300 font-medium">Performance Tips:</p>
              <ul className="text-xs text-gray-400 space-y-1 list-disc list-inside">
                <li>For slow connections or limited bandwidth, use lower concurrency (1-5)</li>
                <li>For fast connections, increase concurrency (10-50) for faster syncs</li>
                <li>Batch size affects memory usage during sync - lower values use less memory</li>
                <li>Default values (batch: 20, concurrency: 10) work well for most deployments</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Recommended Settings */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() => handlePresetClick('20', '10')}
            className={`bg-gray-800 hover:bg-gray-750 border rounded p-3 text-left transition-colors ${
              isConservative ? 'border-blue-700 hover:border-blue-600' : 'border-gray-700 hover:border-gray-600'
            }`}
          >
            <p className="text-sm font-medium text-gray-300">Conservative</p>
            <p className="text-xs text-gray-500 mt-1">Low resource usage</p>
            <p className="text-xs text-gray-600 mt-2 font-mono">Batch: 20, Concurrency: 10</p>
          </button>

          <button
            type="button"
            onClick={() => handlePresetClick('30', '15')}
            className={`bg-gray-800 hover:bg-gray-750 border rounded p-3 text-left transition-colors ${
              isBalanced ? 'border-blue-700 hover:border-blue-600' : 'border-gray-700 hover:border-gray-600'
            }`}
          >
            <p className="text-sm font-medium text-gray-300">
              Balanced
              <span className="ml-2 text-xs text-blue-400">(Default)</span>
            </p>
            <p className="text-xs text-gray-500 mt-1">Good for most setups</p>
            <p className="text-xs text-gray-600 mt-2 font-mono">Batch: 30, Concurrency: 15</p>
          </button>

          <button
            type="button"
            onClick={() => handlePresetClick('50', '30')}
            className={`bg-gray-800 hover:bg-gray-750 border rounded p-3 text-left transition-colors ${
              isAggressive ? 'border-blue-700 hover:border-blue-600' : 'border-gray-700 hover:border-gray-600'
            }`}
          >
            <p className="text-sm font-medium text-gray-300">Aggressive</p>
            <p className="text-xs text-gray-500 mt-1">Fast sync, high resources</p>
            <p className="text-xs text-gray-600 mt-2 font-mono">Batch: 50, Concurrency: 30</p>
          </button>
        </div>
      </div>

      <div className="border-t border-gray-800 pt-6">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium px-6 py-2 rounded transition-colors"
        >
          {saving ? 'Saving...' : 'Save Sync Settings'}
        </button>
      </div>
    </div>
  );
}
