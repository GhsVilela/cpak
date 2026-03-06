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
  devices?: string[];
}

interface GamesResponse {
  data: Game[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
    totalCurrentGamerscore?: number;
    totalMaxGamerscore?: number;
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

interface XboxProfile {
  _id: string;
  profileId: string;
  displayName: string;
  platform: string;
  credentials?: {
    expiresAt?: string;
    tokenType?: string;
  };
}

const GENERATION_FILTERS = [
  { value: '', label: 'All Platforms' },
  { value: 'XboxSeries', label: 'Xbox Series X|S' },
  { value: 'XboxOne', label: 'Xbox One' },
  { value: 'Xbox360', label: 'Xbox 360' },
  { value: 'PC', label: 'PC' },
  { value: 'PlayAnywhere', label: 'Play Anywhere' },
  { value: 'ConsoleOnly', label: 'Console Only' },
];

function XboxPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [onlyCompleted, setOnlyCompleted] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [sortBy, setSortBy] = useState<string>('completionPercent');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(100);
  const [reloadTrigger, setReloadTrigger] = useState(0);
  const [generationFilter, setGenerationFilter] = useState('');
  const [totalCurrentGamerscore, setTotalCurrentGamerscore] = useState<number | undefined>(undefined);
  const [totalMaxGamerscore, setTotalMaxGamerscore] = useState<number | undefined>(undefined);
  const [selectedProfileId, setSelectedProfileId] = useState<string | undefined>(
    searchParams.get('profileId') || undefined
  );
  const [selectedProfile, setSelectedProfile] = useState<XboxProfile | null>(null);
  const [reAuthUrl, setReAuthUrl] = useState('');

  // Sync status and polling
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncPollInterval, setSyncPollInterval] = useState<NodeJS.Timeout | null>(null);
  const lastSyncNotified = useRef<string | null>(null);

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
  };

  // Load selected profile details (to check token expiry)
  useEffect(() => {
    if (!selectedProfileId) return;
    apiClient.get<XboxProfile[]>('/profiles?platform=xbox').then((profiles) => {
      const found = profiles.find((p) => p._id === selectedProfileId);
      setSelectedProfile(found ?? null);
    }).catch(() => {/* ignore */});
  }, [selectedProfileId]);

  // Check if token is expired (T025 re-auth banner)
  const tokenExpired =
    selectedProfile?.credentials?.expiresAt &&
    new Date(selectedProfile.credentials.expiresAt) < new Date();

  // Fetch re-auth URL when token is expired
  useEffect(() => {
    if (!tokenExpired) return;
    apiClient.get<{ url: string }>('/auth/xbox/url').then((data) => {
      setReAuthUrl(data.url);
    }).catch(() => {/* ignore */});
  }, [tokenExpired]);

  useEffect(() => {
    if (selectedProfileId) {
      loadGames();
      loadSyncStatus();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlyCompleted, selectedProfileId, sortBy, sortOrder, currentPage, itemsPerPage, reloadTrigger, generationFilter]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (syncPollInterval) {
        clearInterval(syncPollInterval);
      }
    };
  }, [syncPollInterval]);

  const handleProfileChange = (profileId: string) => {
    // Stop any existing polling
    if (syncPollInterval) {
      clearInterval(syncPollInterval);
      setSyncPollInterval(null);
    }
    setSelectedProfileId(profileId);
    router.push(`/xbox?profileId=${profileId}`, { scroll: false });
  };

  const handleProfileError = (errorMessage: string) => {
    setError(errorMessage);
  };

  const handleItemsPerPageChange = async (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1);
    await loadGames({ page: 1, perPage: newItemsPerPage });
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
    if (syncPollInterval) {
      clearInterval(syncPollInterval);
    }

    const interval = setInterval(async () => {
      const status = await loadSyncStatus();

      if (!status?.current) {
        clearInterval(interval);
        setSyncPollInterval(null);

        if (status?.lastCompleted?.completedAt) {
          const completedAt = status.lastCompleted.completedAt;
          if (completedAt !== lastSyncNotified.current) {
            if (status.lastCompleted.status === 'success') {
              showToast('Sync completed successfully!', 'success');
            } else {
              showToast(`Sync failed: ${status.lastCompleted.error || 'Unknown error'}`, 'error');
            }
            lastSyncNotified.current = completedAt;
            setReloadTrigger((prev) => prev + 1);
          }
        }
      }
    }, 1000);

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
    return date.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  // Cancel sync
  const cancelSync = async () => {
    if (!syncStatus?.current?.operationId) return;

    try {
      await apiClient.delete(`/sync/cancel/${syncStatus.current.operationId}`);
      showToast('Sync cancelled', 'success');
      if (syncPollInterval) {
        clearInterval(syncPollInterval);
        setSyncPollInterval(null);
      }
      await loadSyncStatus();
    } catch {
      showToast('Failed to cancel sync', 'error');
    }
  };

  // Trigger sync
  const triggerSync = async () => {
    if (!selectedProfileId) return;

    try {
      await apiClient.post(`/sync/xbox?profileId=${selectedProfileId}`, {});
      showToast('Sync started', 'success');
      startSyncPolling();
      setTimeout(async () => {
        await loadSyncStatus();
      }, 500);
    } catch {
      showToast('Failed to start sync', 'error');
    }
  };

  const loadGames = async (overrides?: { page?: number; perPage?: number }) => {
    if (!selectedProfileId) return;

    setLoading(true);
    setError('');

    const page = overrides?.page ?? currentPage;
    const perPage = overrides?.perPage ?? itemsPerPage;

    try {
      const params = new URLSearchParams({
        platform: 'xbox',
        profileId: selectedProfileId,
        limit: perPage.toString(),
        offset: ((page - 1) * perPage).toString(),
        sortBy: sortBy,
        sortOrder: sortOrder,
      });

      if (onlyCompleted) {
        params.append('onlyCompleted', 'true');
      }
      if (generationFilter) {
        params.append('device', generationFilter);
      }

      const response = await apiClient.get<GamesResponse>(`/games?${params.toString()}`);
      setGames(response.data);
      setTotalCount(response.pagination.total);
      setTotalCurrentGamerscore(response.pagination.totalCurrentGamerscore);
      setTotalMaxGamerscore(response.pagination.totalMaxGamerscore);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load games');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Header row: title + ProfileSelector + Sync Now button */}
      <div className="mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
          <h1 className="text-3xl font-bold text-[var(--xbox-accent)]">Xbox Games</h1>
          <div className="flex items-center gap-4">
            <ProfileSelector
              platform="xbox"
              selectedProfileId={selectedProfileId}
              onSelectProfile={handleProfileChange}
              onError={handleProfileError}
            />
            {selectedProfileId && !syncStatus?.current && (
              <button
                onClick={triggerSync}
                className="px-4 py-2 bg-[var(--xbox-accent)] hover:opacity-90 rounded font-medium text-sm transition whitespace-nowrap text-black"
              >
                Sync Now
              </button>
            )}
          </div>
        </div>

        {/* Re-auth banner */}
        {tokenExpired && (
          <div className="flex items-center gap-4 bg-yellow-900/30 border border-yellow-600 text-yellow-300 px-4 py-3 rounded mb-4">
            <span>⚠️ Your Xbox token has expired. Re-connect your account to resume syncing.</span>
            {reAuthUrl && (
              <a
                href={reAuthUrl}
                className="underline font-semibold whitespace-nowrap hover:text-yellow-100"
              >
                Re-connect Xbox
              </a>
            )}
          </div>
        )}

        {/* Sync Progress Banner */}
        {selectedProfileId && syncStatus?.current && (
          <div className="mb-4 p-3 bg-green-900/20 border border-green-500/30 rounded">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-green-400 font-medium">{syncStatus.current.message}</span>
              <div className="flex items-center gap-3">
                <span className="text-green-400 font-bold">{syncStatus.current.progress}%</span>
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
                className="bg-[var(--xbox-accent)] h-2 rounded-full transition-all duration-300"
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
          <div className="mb-4 flex items-center gap-3 text-sm text-gray-400 flex-wrap">
            {totalMaxGamerscore !== undefined && totalMaxGamerscore > 0 && (
              <>
                <span>
                  <span>Gamerscore: </span>
                  <span className="font-bold text-[var(--xbox-accent)]">
                    {(totalCurrentGamerscore ?? 0).toLocaleString()}
                  </span>
                </span>
                <span className="text-gray-600">|</span>
              </>
            )}
            <span>
              Last sync: {formatRelativeTime(syncStatus.lastCompleted.completedAt)}
              {syncStatus.lastCompleted.status === 'success' ? (
                <span className="text-green-400 ml-2">✓</span>
              ) : (
                <span className="text-red-400 ml-2">✗</span>
              )}
            </span>
          </div>
        )}

        {/* Filters */}
        {selectedProfileId && (
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={onlyCompleted}
                onChange={(e) => setOnlyCompleted(e.target.checked)}
                className="w-4 h-4"
              />
              <span>100% Only</span>
            </label>

            {/* Generation filter */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-400">Platform:</label>
              <select
                value={generationFilter}
                onChange={(e) => setGenerationFilter(e.target.value)}
                className="px-3 py-1 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-[var(--xbox-accent)]"
              >
                {GENERATION_FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-400">Sort:</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-3 py-1 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-[var(--xbox-accent)]"
              >
                <option value="title">Title</option>
                <option value="completionPercent">Completion %</option>
                <option value="achievementsTotal">Total Achievements</option>
                <option value="lastSyncedAt">Last Synced</option>
              </select>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                className="px-3 py-1 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-[var(--xbox-accent)]"
              >
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-500 text-red-400 px-4 py-2 rounded mb-4">
          {error}
        </div>
      )}

      {/* Pagination info */}
      {totalCount > 0 && (
        <div className="mb-4 flex items-center justify-between flex-wrap gap-4">
          <p className="text-sm text-gray-400">
            Showing {((currentPage - 1) * itemsPerPage) + 1}{'-'}{Math.min(currentPage * itemsPerPage, totalCount)} of {totalCount} games
          </p>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-400">Per page:</label>
              <select
                value={itemsPerPage}
                onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
                className="px-3 py-1 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-[var(--xbox-accent)]"
              >
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="200">200</option>
                <option value="500">500</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-gray-800 border border-gray-700 rounded text-sm hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-gray-400">
                Page {currentPage} of {Math.ceil(totalCount / itemsPerPage)}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(Math.ceil(totalCount / itemsPerPage), p + 1))}
                disabled={currentPage >= Math.ceil(totalCount / itemsPerPage)}
                className="px-3 py-1 bg-gray-800 border border-gray-700 rounded text-sm hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Game grid */}
      <GameGrid
        games={games}
        loading={loading}
        emptyMessage={
          !selectedProfileId
            ? 'Select an Xbox profile to view games'
            : onlyCompleted
            ? 'No 100% completed Xbox games yet'
            : 'No Xbox games found. Try syncing your profile.'
        }
      />

      {/* Toast notification */}
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

export default function XboxPage() {
  return (
    <Suspense fallback={<div className="text-gray-400 py-8">Loading...</div>}>
      <XboxPageContent />
    </Suspense>
  );
}
