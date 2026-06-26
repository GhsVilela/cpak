'use client';

import { useState } from 'react';
import { apiClient } from '../services/apiClient';

interface ProfileSyncControlsProps {
  profileId: string;
  platform: string;
  lastSync?: {
    completedAt: string;
    status: 'success' | 'failed';
  };
  onSyncComplete?: () => void;
  onToast?: (message: string, type: 'success' | 'error' | 'info') => void;
  disabled?: boolean;
}

export default function ProfileSyncControls({
  profileId,
  platform,
  lastSync,
  onSyncComplete,
  onToast,
  disabled = false,
}: ProfileSyncControlsProps) {
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');

  const handleSync = async () => {
    setSyncing(true);
    setError('');

    try {
      await apiClient.post(`/sync/${platform}?profileId=${profileId}`, {});
      if (onToast) {
        onToast('Sync started successfully', 'success');
      }
      if (onSyncComplete) {
        onSyncComplete();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Sync failed';
      setError(errorMessage);
      if (onToast) {
        onToast(errorMessage, 'error');
      }
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex-1 min-w-0">
          {lastSync ? (
            <div className="text-sm text-gray-400 flex items-center gap-2">
              <span>Synced: {formatLastSync(lastSync.completedAt)}</span>
              {lastSync.status === 'success' ? (
                <span className="text-green-400">✓</span>
              ) : (
                <span className="text-red-400">✗</span>
              )}
            </div>
          ) : !syncing ? (
            <p className="text-sm text-gray-500">Never synced</p>
          ) : (
            <p className="text-sm text-gray-400">Syncing in progress...</p>
          )}
        </div>
        <button
          onClick={handleSync}
          disabled={syncing || disabled}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded font-medium transition text-sm whitespace-nowrap flex-shrink-0 w-full sm:w-auto"
          title={disabled ? 'Sync disabled during backup/restore operations or when another sync is in progress' : ''}
        >
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>
    </div>
  );
}
