'use client';

import { useState } from 'react';
import { apiClient } from '../services/apiClient';

interface ProfileSyncControlsProps {
  profileId: string;
  platform: string;
  displayName: string;
  lastSync?: {
    completedAt: string;
    status: 'success' | 'failed';
  };
  onSyncComplete?: () => void;
}

export default function ProfileSyncControls({
  profileId,
  platform,
  displayName,
  lastSync,
  onSyncComplete,
}: ProfileSyncControlsProps) {
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    setError('');
    setSuccess(false);

    try {
      await apiClient.post(`/sync/${platform}?profileId=${profileId}`, {});
      setSuccess(true);
      if (onSyncComplete) {
        onSyncComplete();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const formatLastSync = (date: string) => {
    const syncDate = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - syncDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return syncDate.toLocaleDateString();
  };

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold">{displayName}</h3>
          <p className="text-xs text-gray-400 capitalize">{platform}</p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded font-medium transition text-sm"
        >
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>

      {lastSync && (
        <div className="text-sm text-gray-400 flex items-center gap-2">
          <span>Last sync: {formatLastSync(lastSync.completedAt)}</span>
          {lastSync.status === 'success' ? (
            <span className="text-green-400">✓</span>
          ) : (
            <span className="text-red-400">✗</span>
          )}
        </div>
      )}

      {!lastSync && !syncing && (
        <p className="text-sm text-gray-500">Never synced</p>
      )}

      {success && (
        <div className="mt-2 text-sm text-green-400">
          ✓ Sync started successfully
        </div>
      )}

      {error && (
        <div className="mt-2 text-sm text-red-400">
          ✗ {error}
        </div>
      )}
    </div>
  );
}
