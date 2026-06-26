'use client';

import { useEffect, useState, Suspense, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiClient } from '../../services/apiClient';
import ProfileSelector from '../../components/ProfileSelector';
import GameGrid from '../../components/GameGrid';
import ViewModeSelector, { ViewMode } from '../../components/ViewModeSelector';
import GameSearchInput from '../../components/GameSearchInput';
import Toast from '../../components/Toast';

interface Game {
  _id: string;
  gameId: string;
  title: string;
  customTitle?: string;
  platform: 'steam' | 'xbox' | 'playstation';
  achievementsTotal: number;
  achievementsUnlocked: number;
  completionPercent: number;
  capsuleImagePath?: string;
  iconImagePath?: string;
  heroImagePath?: string;
  profileId: string;
  devices?: string[];
  isHidden?: boolean;
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

interface BackupRestoreStatus {
  backup: {
    current: { jobId: string; status: string; progress: number; message: string } | null;
  };
  restore: {
    current: { jobId: string; status: string; progress: number; message: string } | null;
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
  const [noProfiles, setNoProfiles] = useState(false);
  const [onlyCompleted, setOnlyCompleted] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [sortBy, setSortBy] = useState<string>('completionPercent');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(100);
  const [reloadTrigger, setReloadTrigger] = useState(0);
  const [generationFilter, setGenerationFilter] = useState('');
  const [totalCurrentGamerscore, setTotalCurrentGamerscore] = useState<number | undefined>(undefined);
  const [totalMaxGamerscore, setTotalMaxGamerscore] = useState<number | undefined>(undefined);
  // Persistent gamerscore values — unfiltered, only refreshed on profile/sync change
  const [baseGamerscore, setBaseGamerscore] = useState<number | undefined>(undefined);
  const [xbox360Gamerscore, setXbox360Gamerscore] = useState<number | undefined>(undefined);
  const [selectedProfileId, setSelectedProfileId] = useState<string | undefined>(
    searchParams.get('profileId') || undefined
  );
  const [selectedProfile, setSelectedProfile] = useState<XboxProfile | null>(null);
  const [reAuthUrl, setReAuthUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // View mode — persisted per-platform in localStorage
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('cpak-view-mode-xbox') as ViewMode) || 'capsule';
    }
    return 'capsule';
  });

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem('cpak-view-mode-xbox', mode);
  };

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

  // Handle Xbox auth callback error/success from URL params
  useEffect(() => {
    const authError = searchParams.get('error');
    const authMessage = searchParams.get('message');
    if (authError) {
      const friendlyMessage = authMessage || 'Xbox authentication failed';
      showToast(friendlyMessage, 'error');
      // Clean up URL params
      const params = new URLSearchParams(searchParams.toString());
      params.delete('error');
      params.delete('message');
      const remaining = params.toString();
      router.replace(`/xbox${remaining ? `?${remaining}` : ''}`, { scroll: false });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      const savedOnlyCompleted = localStorage.getItem(`xbox_onlyCompleted_${selectedProfileId}`) === 'true';
      const savedShowHidden = localStorage.getItem(`xbox_showHidden_${selectedProfileId}`) === 'true';
      setOnlyCompleted(savedOnlyCompleted);
      setShowHidden(savedShowHidden);
      loadGames({ onlyCompleted: savedOnlyCompleted, showHidden: savedShowHidden });
      loadSyncStatus();
      loadBackupRestoreStatus();
      loadBaseGamerscore();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProfileId, sortBy, sortOrder, currentPage, itemsPerPage, reloadTrigger, generationFilter, searchQuery]);

  // Reload games when toggle state changes (user clicks a toggle)
  const toggleReloadRef = useRef(false);
  useEffect(() => {
    if (!toggleReloadRef.current) {
      toggleReloadRef.current = true;
      return;
    }
    if (selectedProfileId) {
      loadGames({ onlyCompleted, showHidden });
    }
  }, [onlyCompleted, showHidden]);

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
    router.push(`/xbox?profileId=${profileId}`, { scroll: false });
  };

  // Fetch unfiltered gamerscore totals (persists regardless of UI filters)
  const loadBaseGamerscore = async () => {
    if (!selectedProfileId) return;
    try {
      const [allRes, x360Res] = await Promise.all([
        apiClient.get<GamesResponse>(`/games?platform=xbox&profileId=${selectedProfileId}&limit=1&offset=0`),
        apiClient.get<GamesResponse>(`/games?platform=xbox&profileId=${selectedProfileId}&limit=1&offset=0&device=Xbox360`),
      ]);
      setBaseGamerscore(allRes.pagination.totalCurrentGamerscore);
      setXbox360Gamerscore(x360Res.pagination.totalCurrentGamerscore);
    } catch {
      // ignore — not critical
    }
  };

  const handleProfileError = (errorMessage: string) => {
    setError(errorMessage);
  };

  const handleItemsPerPageChange = async (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1);
    await loadGames({ page: 1, perPage: newItemsPerPage });
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

  const loadGames = async (overrides?: { page?: number; perPage?: number; onlyCompleted?: boolean; showHidden?: boolean }) => {
    if (!selectedProfileId) return;

    setLoading(true);
    setError('');

    const page = overrides?.page ?? currentPage;
    const perPage = overrides?.perPage ?? itemsPerPage;
    const effectiveOnlyCompleted = overrides?.onlyCompleted ?? onlyCompleted;
    const effectiveShowHidden = overrides?.showHidden ?? showHidden;

    try {
      const params = new URLSearchParams({
        platform: 'xbox',
        profileId: selectedProfileId,
        limit: perPage.toString(),
        offset: ((page - 1) * perPage).toString(),
        sortBy: sortBy,
        sortOrder: sortOrder,
      });

      if (effectiveOnlyCompleted) {
        params.append('onlyCompleted', 'true');
      }
      if (!effectiveShowHidden) {
        params.append('excludeHidden', 'true');
      }
      if (generationFilter) {
        params.append('device', generationFilter);
      }
      if (searchQuery) {
        params.append('search', searchQuery);
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
              onProfilesLoaded={(count) => setNoProfiles(count === 0)}
              reloadTrigger={reloadTrigger}
            />
            {selectedProfileId && (
              <div className="flex items-center gap-2">
                <a
                  href={syncStatus?.current || backupRestoreStatus?.backup?.current || backupRestoreStatus?.restore?.current ? undefined : `/settings/edit/${selectedProfileId}?returnTo=${encodeURIComponent(`/xbox?profileId=${selectedProfileId}`)}`}
                  className={`px-4 py-2 rounded font-medium text-sm transition whitespace-nowrap ${syncStatus?.current || backupRestoreStatus?.backup?.current || backupRestoreStatus?.restore?.current ? 'bg-gray-600 text-gray-300 cursor-not-allowed' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}
                  aria-disabled={!!syncStatus?.current || !!backupRestoreStatus?.backup?.current || !!backupRestoreStatus?.restore?.current}
                >
                  Edit
                </a>
                {!syncStatus?.current && (
                  <button
                    onClick={triggerSync}
                    disabled={!!backupRestoreStatus?.backup?.current || !!backupRestoreStatus?.restore?.current}
                    className="px-4 py-2 bg-[var(--xbox-accent)] hover:opacity-90 disabled:bg-gray-600 disabled:cursor-not-allowed rounded font-medium text-sm transition whitespace-nowrap text-white"
                    title={backupRestoreStatus?.backup?.current || backupRestoreStatus?.restore?.current ? 'Sync disabled during backup/restore operations' : ''}
                  >
                    Sync Now
                  </button>
                )}
              </div>
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
            {baseGamerscore !== undefined && baseGamerscore > 0 && (
              <>
                <span title="Total gamerscore from all platforms.">
                  <span>Gamerscore: </span>
                  <span className="font-bold text-[var(--xbox-accent)]">
                    {baseGamerscore.toLocaleString()}
                  </span>
                </span>
                {xbox360Gamerscore !== undefined && xbox360Gamerscore > 0 && (
                  <>
                    <span className="text-gray-600">|</span>
                    <span title="Total gamerscore from xbox 360 only.">
                      <span>Xbox 360: </span>
                      <span className="font-bold text-[var(--xbox-accent)]">
                        {xbox360Gamerscore.toLocaleString()}
                      </span>
                    </span>
                  </>
                )}
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
            <GameSearchInput onSearch={(q) => { setSearchQuery(q); setCurrentPage(1); }} />
            <ViewModeSelector viewMode={viewMode} onViewModeChange={handleViewModeChange} />
            <button
              role="switch"
              aria-checked={onlyCompleted}
              onClick={() => {
                const next = !onlyCompleted;
                setOnlyCompleted(next);
                if (selectedProfileId) localStorage.setItem(`xbox_onlyCompleted_${selectedProfileId}`, String(next));
              }}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                onlyCompleted ? 'bg-[var(--xbox-accent)]' : 'bg-gray-600'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                onlyCompleted ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
            <span className="text-sm">100% Only</span>

          <button
            role="switch"
            aria-checked={showHidden}
            onClick={() => {
              const next = !showHidden;
              setShowHidden(next);
              if (selectedProfileId) localStorage.setItem(`xbox_showHidden_${selectedProfileId}`, String(next));
            }}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              showHidden ? 'bg-[var(--xbox-accent)]' : 'bg-gray-600'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              showHidden ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
          <span
            className="text-sm cursor-default"
            title="Show games you have manually hidden."
          >Show Hidden</span>

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
                <option value="currentGamerscore">Gamerscore</option>
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
      {!selectedProfileId && noProfiles ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-full bg-[var(--xbox-accent)]/10 flex items-center justify-center mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-[var(--xbox-accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">No Xbox profile yet</h2>
          <p className="text-gray-400 text-sm mb-6 max-w-sm">
            Add an Xbox profile to start tracking your games and achievements.
          </p>
          <a
            href="/setup?platform=xbox"
            className="px-5 py-2.5 bg-[var(--xbox-accent)] hover:opacity-90 text-gray-900 rounded-lg font-semibold text-sm transition"
          >
            Add Xbox Profile
          </a>
        </div>
      ) : (
        <GameGrid
          games={games}
          loading={loading}
          viewMode={viewMode}
          emptyMessage={
            onlyCompleted
              ? 'No 100% completed Xbox games yet.'
              : 'No Xbox games found. Try syncing your profile.'
          }
          onGamesUpdated={() => setReloadTrigger((r) => r + 1)}
        />
      )}

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
