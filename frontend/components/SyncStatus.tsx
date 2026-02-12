'use client';

import { useState, useEffect } from 'react';

interface SyncStatusProps {
  platform: 'steam' | 'xbox' | 'playstation';
  profileId?: string;
}

export default function SyncStatus({ platform, profileId }: SyncStatusProps) {
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');

  const triggerSync = async () => {
    setSyncing(true);
    setError('');

    try {
      const query = profileId ? `?profileId=${profileId}` : '';
      const response = await fetch(`/api/sync/${platform}${query}`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Sync failed');
      }

      // Poll for completion (simplified - should use websockets in production)
      setTimeout(() => {
        setSyncing(false);
      }, 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
      setSyncing(false);
    }
  };

  return (
    <div className="border border-gray-700 rounded-lg p-4 bg-gray-800">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Sync Status</h3>
          <p className="text-sm text-gray-400">
            {syncing ? 'Syncing...' : 'Ready'}
          </p>
        </div>
        <button
          onClick={triggerSync}
          disabled={syncing}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded font-medium transition"
        >
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>
      {error && (
        <div className="mt-3 bg-red-900/20 border border-red-500 text-red-400 px-3 py-2 rounded text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
