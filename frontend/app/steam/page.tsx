'use client';

import { useEffect, useState, Suspense, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiClient } from '../../services/apiClient';
import ProfileSelector from '../../components/ProfileSelector';
import GameGrid from '../../components/GameGrid';
import Toast from '../../components/Toast';

interface Game {
  _id: string;
  gameId: string;
  title: string;
  platform: 'steam' | 'xbox' | 'playstation';
  achievementsTotal: number;
  achievementsUnlocked: number;
  completionPercent: number;
  imagePath?: string;
  profileId: string;
}

interface GamesResponse {
  data: Game[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

interface SyncStatus {
  current?: {
    operationId: string;
    status: string;
    progress: number;
    message: string;
  };
  lastCompleted?: {
    completedAt: string;
    status: 'success' | 'failed';
    error?: string;
  };
}

interface BackupRestoreStatus {
  backup: {
    current: { jobId: string; status: string; progress: number; message: string } | null;
  };
  restore: {
    current: { jobId: string; status: string; progress: number; message: string } | null;
  };
}

function SteamPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [onlyCompleted, setOnlyCompleted] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [sortBy, setSortBy] = useState<string>('completionPercent');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(100);
  const [reloadTrigger, setReloadTrigger] = useState(0);
  const [selectedProfileId, setSelectedProfileId] = useState<string | undefined>(
    searchParams.get('profileId') || undefined
  );
  
  // Sync status and polling
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncPollInterval, setSyncPollInterval] = useState<NodeJS.Timeout | null>(null);
  const lastSyncNotified = useRef<string | null>(null);
  
  // Backup/Restore status (to block sync during backup/restore)
  const [backupRestoreStatus, setBackupRestoreStatus] = useState<BackupRestoreStatus | null>(null);
  const [backupRestorePollInterval, setBackupRestorePollInterval] = useState<NodeJS.Timeout | null>(null);
  
  // Toast state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (selectedProfileId) {
      loadGames();
      loadSyncStatus();
      loadBackupRestoreStatus();
    }
  }, [onlyCompleted, selectedProfileId, sortBy, sortOrder, currentPage, itemsPerPage, reloadTrigger]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (syncPollInterval) {
        clearInterval(syncPollInterval);
      }
      if (backupRestorePollInterval) {
        clearInterval(backupRestorePollInterval);
      }
    };
  }, [syncPollInterval, backupRestorePollInterval]);

  const handleProfileChange = (profileId: string) => {
    // Stop any existing polling
    if (syncPollInterval) {
      clearInterval(syncPollInterval);
      setSyncPollInterval(null);
    }
    if (backupRestorePollInterval) {
      clearInterval(backupRestorePollInterval);
      setBackupRestorePollInterval(null);
    }
    
    setSelectedProfileId(profileId);
    router.push(`/steam?profileId=${profileId}`, { scroll: false });
  };

  const handleProfileError = (errorMessage: string) => {
    setError(errorMessage);
  };

  const handleItemsPerPageChange = async (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1);
    // Load immediately with new values
    await loadGames({ page: 1, perPage: newItemsPerPage });
  };

  const loadGames = async (overrides?: { page?: number; perPage?: number }) => {
    if (!selectedProfileId) return;

    setLoading(true);
    setError('');

    const page = overrides?.page ?? currentPage;
    const perPage = overrides?.perPage ?? itemsPerPage;

    try {
      const params = new URLSearchParams({
        platform: 'steam',
        profileId: selectedProfileId,
        limit: perPage.toString(),
        offset: ((page - 1) * perPage).toString(),
        sortBy: sortBy,
        sortOrder: sortOrder,
      });
      
      if (onlyCompleted) {
        params.append('onlyCompleted', 'true');
      }

      const response = await apiClient.get<GamesResponse>(`/games?${params.toString()}`);
      setGames(response.data);
      setTotalCount(response.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load games');
    } finally {
      setLoading(false);
    }
  };

  // Load backup/restore status to check if operations are in progress
  const loadBackupRestoreStatus = async () => {
    try {
      const response = await fetch('/api/backup/status');
      if (response.ok) {
        const data = await response.json();
        setBackupRestoreStatus(data);
        
        // Start polling if there's an active operation
        if ((data.backup?.current || data.restore?.current) && !backupRestorePollInterval) {
          startBackupRestorePolling();
        }
        
        return data;
      }
    } catch (err) {
      console.error('Failed to load backup/restore status:', err);
    }
    return null;
  };

  // Start polling for backup/restore status
  const startBackupRestorePolling = () => {
    // Clear existing interval if any
    if (backupRestorePollInterval) {
      clearInterval(backupRestorePollInterval);
    }

    const interval = setInterval(async () => {
      const status = await loadBackupRestoreStatus();
      
      // Stop polling when both backup and restore are idle
      if (!status?.backup?.current && !status?.restore?.current) {
        clearInterval(interval);
        setBackupRestorePollInterval(null);
      }
    }, 2000); // Poll every 2 seconds (less frequent than sync)
    
    setBackupRestorePollInterval(interval);
  };

  // Load sync status from server
  const loadSyncStatus = async () => {
    if (!selectedProfileId) return null;
    
    try {
      const response = await fetch(`/api/sync/status?profileId=${selectedProfileId}`);
      if (response.ok) {
        const data = await response.json();
        setSyncStatus(data);
        
        // If there's an active sync, start polling
        if (data.current && !syncPollInterval) {
          startSyncPolling();
        }
        
        return data;
      }
    } catch (err) {
      console.error('Failed to load sync status:', err);
    }
    return null;
  };

  // Start polling for sync status
  const startSyncPolling = () => {
    // Clear existing interval if any
    if (syncPollInterval) {
      clearInterval(syncPollInterval);
    }

    const interval = setInterval(async () => {
      const status = await loadSyncStatus();
      
      // Stop polling when sync completes or fails
      if (!status?.current) {
        clearInterval(interval);
        setSyncPollInterval(null);
        
        // Only show toast if this is a new completed sync
        if (status?.lastCompleted?.completedAt) {
          const completedAt = status.lastCompleted.completedAt;
          if (completedAt !== lastSyncNotified.current) {
            if (status.lastCompleted.status === 'success') {
              showToast('Sync completed successfully!', 'success');
            } else {
              showToast(`Sync failed: ${status.lastCompleted.error || 'Unknown error'}`, 'error');
            }
            lastSyncNotified.current = completedAt;
            // Reload games after sync completes
            setReloadTrigger((prev) => prev + 1);
          }
        }
      }
    }, 1000); // Poll every 1 second
    
    setSyncPollInterval(interval);
  };

  // Format relative time
  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  // Cancel sync
  const cancelSync = async () => {
    if (!syncStatus?.current?.operationId) return;
    
    try {
      await apiClient.delete(`/sync/cancel/${syncStatus.current.operationId}`);
      showToast('Sync cancelled', 'success');
      // Stop polling
      if (syncPollInterval) {
        clearInterval(syncPollInterval);
        setSyncPollInterval(null);
      }
      // Reload status
      await loadSyncStatus();
    } catch (err) {
      showToast('Failed to cancel sync', 'error');
    }
  };

  // Trigger sync
  const triggerSync = async () => {
    if (!selectedProfileId) return;
    
    try {
      await apiClient.post(`/sync/steam?profileId=${selectedProfileId}`, {});
      showToast('Sync started', 'success');
      // Start polling for progress
      await loadSyncStatus();
    } catch (err) {
      showToast('Failed to start sync', 'error');
    }
  };

  return (
    <div>
      <div className="mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
          <h1 className="text-3xl font-bold text-[var(--steam-accent)]">Steam Games</h1>
          <div className="flex items-center gap-4">
            <ProfileSelector
              platform="steam"
              selectedProfileId={selectedProfileId}
              onSelectProfile={handleProfileChange}
              onError={handleProfileError}
            />
            {selectedProfileId && !syncStatus?.current && (
              <button
                onClick={triggerSync}
                disabled={!!backupRestoreStatus?.backup?.current || !!backupRestoreStatus?.restore?.current}
                className="px-4 py-2 bg-[var(--steam-accent)] hover:bg-[#1a7fc1] disabled:bg-gray-600 disabled:cursor-not-allowed rounded font-medium text-sm transition whitespace-nowrap"
                title={backupRestoreStatus?.backup?.current || backupRestoreStatus?.restore?.current ? 'Sync disabled during backup/restore operations' : ''}
              >
                Sync Now
              </button>
            )}
          </div>
        </div>

        {/* Sync Status Banner */}
        {selectedProfileId && syncStatus?.current && (
          <div className="mb-4 p-3 bg-blue-900/20 border border-blue-500/30 rounded">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-blue-400 font-medium">{syncStatus.current.message}</span>
              <div className="flex items-center gap-3">
                <span className="text-blue-400 font-bold">{syncStatus.current.progress}%</span>
                <button
                  onClick={cancelSync}
                  className="text-sm px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 border border-red-500/50 rounded text-red-400 transition font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${syncStatus.current.progress}%` }}
              ></div>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Sync in progress. This page will automatically update when complete.
            </p>
          </div>
        )}

        {/* Last Sync Info */}
        {selectedProfileId && !syncStatus?.current && syncStatus?.lastCompleted && (
          <div className="mb-4 text-sm text-gray-400">
            Last sync: {formatRelativeTime(syncStatus.lastCompleted.completedAt)}
            {syncStatus.lastCompleted.status === 'success' ? (
              <span className="text-green-400 ml-2">✓</span>
            ) : (
              <span className="text-red-400 ml-2">✗</span>
            )}
          </div>
        )}

        <div className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={onlyCompleted}
              onChange={(e) => setOnlyCompleted(e.target.checked)}
              className="w-4 h-4"
            />
            <span>100% Complete Only</span>
          </label>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">Sort by:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-1 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-[var(--steam-accent)]"
            >
              <option value="title">Title</option>
              <option value="completionPercent">Completion %</option>
              <option value="achievementsTotal">Total Achievements</option>
              <option value="lastSyncedAt">Last Synced</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">Order:</label>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
              className="px-3 py-1 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-[var(--steam-accent)]"
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </div>
        </div>
      </div>

      {loading && selectedProfileId && <p>Loading games...</p>}

      {error && (
        <div className="bg-red-900/20 border border-red-500 text-red-400 px-4 py-2 rounded mb-4">
          {error}
        </div>
      )}

      {!selectedProfileId && (
        <div className="bg-yellow-900/20 border border-yellow-500 text-yellow-400 px-4 py-3 rounded mb-4">
          <p className="font-semibold">No Steam Profile Configured</p>
          <p className="text-sm mt-1">No Steam profiles configured. Add one in the Settings page to start syncing your games.</p>
        </div>
      )}

      {selectedProfileId && totalCount > 0 && (
        <div className="mb-4 flex items-center justify-between flex-wrap gap-4">
          <p className="text-sm text-gray-400">
            Showing {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, totalCount)} of {totalCount} {onlyCompleted ? 'completed' : 'total'} games
          </p>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-400">Per page:</label>
              <select
                value={itemsPerPage}
                onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
                className="px-3 py-1 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-[var(--steam-accent)]"
              >
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="200">200</option>
                <option value="500">500</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-gray-800 border border-gray-700 rounded text-sm hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-gray-400">
                Page {currentPage} of {Math.ceil(totalCount / itemsPerPage)}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(Math.ceil(totalCount / itemsPerPage), p + 1))}
                disabled={currentPage >= Math.ceil(totalCount / itemsPerPage)}
                className="px-3 py-1 bg-gray-800 border border-gray-700 rounded text-sm hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedProfileId && (
        <GameGrid 
          games={games} 
          loading={loading}
          emptyMessage={onlyCompleted ? 'No 100% completed games. Try disabling the filter.' : 'No games found.'}
        />
      )}

      {/* Toast notifications */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

export default function SteamPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SteamPageContent />
    </Suspense>
  );
}
