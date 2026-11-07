'use client';

import { useEffect, useState, Suspense, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiClient } from '../../services/apiClient';
import ProfileSelector from '../../components/ProfileSelector';
import GameGrid from '../../components/GameGrid';
import GameToolbar from '../../components/GameToolbar';
import SteamCompletionIcon from '../../components/SteamCompletionIcon';
import { StatsStrip, StatTile } from '../../components/StatsStrip';
import type { ViewMode } from '../../components/ViewModeSelector';
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
  ownershipSource?: 'owned' | 'played_history';
  achievementsFetchFailed?: boolean;
  hasAchievementGroups?: boolean;
  baseGameAchievementsTotal?: number;
  baseGameAchievementsUnlocked?: number;
  isHidden?: boolean;
}

interface GamesResponse {
  data: Game[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
    totalAchievementsUnlocked?: number;
    /** Achievement sets (base game or DLC/update) fully completed. */
    completedGroupsTotal?: number;
    /** Games where every tracked achievement is unlocked. */
    completedGamesTotal?: number;
    /** Average completion percentage across tracked games. */
    averageCompletionPercent?: number;
    /** Unlocked achievements owned by fewer than 10% of Steam players. */
    rareAchievementsTotal?: number;
    /** Legacy alias for completedGroupsTotal. */
    completedTotal?: number;
  };
}

interface SyncStatus {
  current?: {
    operationId: string;
    status: string;
    progress: number;
    message: string;
    phase?: string;
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
  const [noProfiles, setNoProfiles] = useState(false);
  const [onlyCompleted, setOnlyCompleted] = useState(false);
  const [onlyBaseCompleted, setOnlyBaseCompleted] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [sortBy, setSortBy] = useState<string>('completionPercent');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(() => {
    const page = Number(searchParams.get('page'));
    return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  });
  const [itemsPerPage, setItemsPerPage] = useState(() => {
    const perPage = Number(searchParams.get('perPage'));
    return [50, 100, 200, 500].includes(perPage) ? perPage : 100;
  });
  const [reloadTrigger, setReloadTrigger] = useState(0);
  const [selectedProfileId, setSelectedProfileId] = useState<string | undefined>(
    searchParams.get('profileId') || undefined
  );
  
  const [searchQuery, setSearchQuery] = useState('');

  // Persistent tracked achievement count — unfiltered, only refreshed on profile/sync change
  const [baseTrackedAchievements, setBaseTrackedAchievements] = useState<number | undefined>(undefined);

  // Completed achievement groups (base game + DLC/update sets) — unfiltered base
  const [baseCompletedGroups, setBaseCompletedGroups] = useState<number | undefined>(undefined);
  // Games where every achievement is unlocked — unfiltered base
  const [baseCompletedGames, setBaseCompletedGames] = useState<number | undefined>(undefined);
  // Average completion percentage across the library — unfiltered base
  const [baseAverageCompletion, setBaseAverageCompletion] = useState<number | undefined>(undefined);
  // Unlocked rare achievements (< 10% global unlock rate) — unfiltered base
  const [baseRareAchievements, setBaseRareAchievements] = useState<number | undefined>(undefined);

  // View mode — persisted per-platform in localStorage
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('cpak-view-mode-steam') as ViewMode) || 'capsule';
    }
    return 'capsule';
  });

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem('cpak-view-mode-steam', mode);
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

  useEffect(() => {
    if (selectedProfileId) {
      // Load per-profile toggle state synchronously before loading games
      const savedOnlyCompleted = localStorage.getItem(`steam_onlyCompleted_${selectedProfileId}`) === 'true';
      const savedOnlyBaseCompleted =
        !savedOnlyCompleted &&
        localStorage.getItem(`steam_onlyBaseCompleted_${selectedProfileId}`) === 'true';
      const savedShowHidden = localStorage.getItem(`steam_showHidden_${selectedProfileId}`) === 'true';
      const savedSortBy = localStorage.getItem(`steam_sortBy_${selectedProfileId}`) || 'completionPercent';
      const savedSortOrder = (localStorage.getItem(`steam_sortOrder_${selectedProfileId}`) || 'desc') as 'asc' | 'desc';
      const savedPerPage = Number(localStorage.getItem(`steam_perPage_${selectedProfileId}`)) || 100;
      setOnlyCompleted(savedOnlyCompleted);
      setOnlyBaseCompleted(savedOnlyBaseCompleted);
      setShowHidden(savedShowHidden);
      setSortBy(savedSortBy);
      setSortOrder(savedSortOrder);
      setItemsPerPage(savedPerPage);
      loadGames({ onlyCompleted: savedOnlyCompleted, onlyBaseCompleted: savedOnlyBaseCompleted, showHidden: savedShowHidden });
      loadSyncStatus();
      loadBackupRestoreStatus();
      loadBaseTrackedAchievements();
    }
  }, [selectedProfileId, sortBy, sortOrder, currentPage, itemsPerPage, reloadTrigger, searchQuery]);

  // Keep the current page/per-page in the URL so returning from a game
  // (browser back or the in-app back button) restores the same pagination.
  useEffect(() => {
    if (!selectedProfileId) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('profileId', selectedProfileId);
    if (currentPage > 1) params.set('page', String(currentPage));
    else params.delete('page');
    if (itemsPerPage !== 100) params.set('perPage', String(itemsPerPage));
    else params.delete('perPage');

    const next = params.toString();
    if (next !== searchParams.toString()) {
      router.replace(`/steam${next ? `?${next}` : ''}`, { scroll: false });
    }
  }, [currentPage, itemsPerPage, selectedProfileId, searchParams, router]);

  // Reload games when toggle state changes (user clicks a toggle)
  const toggleReloadRef = useRef(false);
  useEffect(() => {
    if (!toggleReloadRef.current) {
      toggleReloadRef.current = true;
      return;
    }
    if (selectedProfileId) {
      loadGames({ onlyCompleted, onlyBaseCompleted, showHidden });
    }
  }, [onlyCompleted, onlyBaseCompleted, showHidden]);

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
    setCurrentPage(1);
    router.push(`/steam?profileId=${profileId}`, { scroll: false });
  };

  // Fetch unfiltered total achievements unlocked for this profile (persists regardless of UI filters)
  const loadBaseTrackedAchievements = async () => {
    if (!selectedProfileId) return;
    try {
      const params = new URLSearchParams({
        platform: 'steam',
        profileId: selectedProfileId,
        limit: '1',
        offset: '0',
      });
      const response = await apiClient.get<GamesResponse>(`/games?${params.toString()}`);
      const {
        totalAchievementsUnlocked,
        completedGroupsTotal,
        completedGamesTotal,
        averageCompletionPercent,
        rareAchievementsTotal,
        completedTotal,
      } = response.pagination;
      setBaseTrackedAchievements(totalAchievementsUnlocked);
      const groups = completedGroupsTotal ?? completedTotal;
      if (groups !== undefined) setBaseCompletedGroups(groups);
      if (completedGamesTotal !== undefined) setBaseCompletedGames(completedGamesTotal);
      if (averageCompletionPercent !== undefined) setBaseAverageCompletion(averageCompletionPercent);
      if (rareAchievementsTotal !== undefined) setBaseRareAchievements(rareAchievementsTotal);
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
    if (selectedProfileId) localStorage.setItem(`steam_perPage_${selectedProfileId}`, String(newItemsPerPage));
    // Load immediately with new values
    await loadGames({ page: 1, perPage: newItemsPerPage });
  };

  const loadGames = async (overrides?: { page?: number; perPage?: number; onlyCompleted?: boolean; onlyBaseCompleted?: boolean; showHidden?: boolean }) => {
    if (!selectedProfileId) return;

    setLoading(true);
    setError('');

    const page = overrides?.page ?? currentPage;
    const perPage = overrides?.perPage ?? itemsPerPage;
    const effectiveOnlyCompleted = overrides?.onlyCompleted ?? onlyCompleted;
    const effectiveOnlyBaseCompleted = overrides?.onlyBaseCompleted ?? onlyBaseCompleted;
    const effectiveShowHidden = overrides?.showHidden ?? showHidden;

    try {
      const params = new URLSearchParams({
        platform: 'steam',
        profileId: selectedProfileId,
        limit: perPage.toString(),
        offset: ((page - 1) * perPage).toString(),
        sortBy: sortBy,
        sortOrder: sortOrder,
      });
      
      if (effectiveOnlyCompleted) {
        params.append('onlyCompleted', 'true');
      }
      if (effectiveOnlyBaseCompleted) {
        params.append('onlyBaseCompleted', 'true');
      }
      if (!effectiveShowHidden) {
        params.append('excludeHidden', 'true');
      }
      if (searchQuery) {
        params.append('search', searchQuery);
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
      
      // Start polling immediately (don't wait for status check)
      startSyncPolling();
      
      // Load initial status (with small delay to allow backend to create the operation)
      setTimeout(async () => {
        await loadSyncStatus();
      }, 500);
    } catch (err) {
      showToast('Failed to start sync', 'error');
    }
  };

  return (
    <div>
      <div className="mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--steam-accent)] mb-1">Steam</p>
            <h1 className="text-3xl font-bold text-[var(--steam-accent)]">Steam Library</h1>
            <div className="mt-2 h-0.5 w-16 rounded-full bg-gradient-to-r from-[var(--steam-accent)] to-transparent" />
          </div>
          <div className="flex flex-wrap items-center gap-2 md:flex-nowrap md:gap-4">
            <ProfileSelector
              platform="steam"
              selectedProfileId={selectedProfileId}
              onSelectProfile={handleProfileChange}
              onError={handleProfileError}
              onProfilesLoaded={(count) => setNoProfiles(count === 0)}
              reloadTrigger={reloadTrigger}
            />
            {selectedProfileId && (
              <div className="flex flex-shrink-0 items-center gap-2">
                <Link
                  href={`/settings/edit/${selectedProfileId}?returnTo=${encodeURIComponent(`/steam?profileId=${selectedProfileId}`)}`}
                  onClick={(e) => {
                    if (syncStatus?.current || backupRestoreStatus?.backup?.current || backupRestoreStatus?.restore?.current) {
                      e.preventDefault();
                    }
                  }}
                  className={`px-4 py-2 rounded font-medium text-sm transition whitespace-nowrap ${syncStatus?.current || backupRestoreStatus?.backup?.current || backupRestoreStatus?.restore?.current ? 'bg-gray-600 text-gray-300 cursor-not-allowed' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}
                  aria-disabled={!!syncStatus?.current || !!backupRestoreStatus?.backup?.current || !!backupRestoreStatus?.restore?.current}
                >
                  Edit
                </Link>
                {!syncStatus?.current && (
                  <button
                    onClick={triggerSync}
                    disabled={!!backupRestoreStatus?.backup?.current || !!backupRestoreStatus?.restore?.current}
                    className="px-4 py-2 bg-[var(--steam-accent)] hover:bg-[#1a7fc1] disabled:bg-gray-600 disabled:cursor-not-allowed rounded font-medium text-sm transition whitespace-nowrap text-white"
                    title={backupRestoreStatus?.backup?.current || backupRestoreStatus?.restore?.current ? 'Sync disabled during backup/restore operations' : ''}
                  >
                    Sync Now
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sync Status Banner */}
        {selectedProfileId && syncStatus?.current && (
          <div className="mb-4 p-3 bg-sky-900/20 border border-sky-500/30 rounded">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-sky-400 font-medium">{syncStatus.current.message}</span>
              <div className="flex items-center gap-3">
                <span className="text-sky-400 font-bold">{syncStatus.current.progress}%</span>
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
                className="bg-[var(--steam-accent)] h-2 rounded-full transition-all duration-300"
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
          <StatsStrip className="mb-4">
            {baseTrackedAchievements !== undefined && (
              <StatTile
                title="Total achievements unlocked and tracked by cpak."
                label="Achievements Unlocked"
                value={baseTrackedAchievements.toLocaleString()}
                valueClassName="text-[var(--steam-accent)]"
              />
            )}
            {baseRareAchievements !== undefined && (
              <StatTile
                title="Unlocked achievements owned by fewer than 10% of Steam players — Steam's rare achievement threshold."
                label="Rare Achievements"
                value={
                  <span className="text-[var(--steam-accent)]">{baseRareAchievements.toLocaleString()}</span>
                }
              />
            )}
            {baseCompletedGames !== undefined && (
              <StatTile
                title="Games where every tracked achievement — base game and DLC/updates — is unlocked."
                label="Completed Games"
                icon={<SteamCompletionIcon size={14} />}
                value={
                  <span className="text-[var(--steam-accent)]">{baseCompletedGames.toLocaleString()}</span>
                }
              />
            )}
            {baseCompletedGroups !== undefined && (
              <StatTile
                title="Achievement sets fully completed across your library. A base game set and each DLC/update set count separately."
                label="Completed Sets"
                value={
                  <span className="text-[var(--steam-accent)]">{baseCompletedGroups.toLocaleString()}</span>
                }
              />
            )}
            {baseAverageCompletion !== undefined && (
              <StatTile
                title={`Steam's average game completion rate across eligible games, rounded down for display. Exact average: ${baseAverageCompletion.toFixed(2)}%`}
                label="Avg Completion"
                value={
                  <span className="text-[var(--steam-accent)]">{Math.floor(baseAverageCompletion)}%</span>
                }
              />
            )}
            <StatTile
              label="Last Sync"
              bold={false}
              spanFull={
                [
                  baseTrackedAchievements,
                  baseCompletedGames,
                  baseCompletedGroups,
                  baseAverageCompletion,
                  baseRareAchievements,
                ].filter((value) => value !== undefined).length % 2 === 0
              }
              value={
                <>
                  {formatRelativeTime(syncStatus.lastCompleted.completedAt)}
                  {syncStatus.lastCompleted.status === 'success' ? (
                    <span className="text-green-400 ml-2">✓</span>
                  ) : (
                    <span className="text-red-400 ml-2">✗</span>
                  )}
                </>
              }
            />
          </StatsStrip>
        )}

      {selectedProfileId && (
        <GameToolbar
          accent="var(--steam-accent)"
          onSearch={(q) => { setSearchQuery(q); setCurrentPage(1); }}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          onlyCompleted={onlyCompleted}
          onOnlyCompletedChange={(next) => {
            setOnlyCompleted(next);
            if (next) setOnlyBaseCompleted(false);
            if (selectedProfileId) {
              localStorage.setItem(`steam_onlyCompleted_${selectedProfileId}`, String(next));
              if (next) localStorage.setItem(`steam_onlyBaseCompleted_${selectedProfileId}`, 'false');
            }
          }}
          secondaryFilterLabel="Completed Only"
          secondaryFilter={onlyBaseCompleted}
          onSecondaryFilterChange={(next) => {
            setOnlyBaseCompleted(next);
            if (next) setOnlyCompleted(false);
            if (selectedProfileId) {
              localStorage.setItem(`steam_onlyBaseCompleted_${selectedProfileId}`, String(next));
              if (next) localStorage.setItem(`steam_onlyCompleted_${selectedProfileId}`, 'false');
            }
          }}
          secondaryFilterTitle="Games whose base-game achievements are complete. DLC and update sets are not required."
          showHidden={showHidden}
          onShowHiddenChange={(next) => { setShowHidden(next); if (selectedProfileId) localStorage.setItem(`steam_showHidden_${selectedProfileId}`, String(next)); }}
          showHiddenTitle="Show games with revoked licenses and games you have manually hidden."
          generationFilter=""
          onGenerationFilterChange={() => {}}
          sortByOptions={[
            { value: 'title', label: 'Title' },
            { value: 'completionPercent', label: 'Completion %' },
            { value: 'achievementsTotal', label: 'Total Achievements' },
            { value: 'lastSyncedAt', label: 'Last Synced' },
          ]}
          sortBy={sortBy}
          onSortByChange={(value) => { setSortBy(value); if (selectedProfileId) localStorage.setItem(`steam_sortBy_${selectedProfileId}`, value); }}
          sortOrder={sortOrder}
          onSortOrderChange={(value) => { setSortOrder(value); if (selectedProfileId) localStorage.setItem(`steam_sortOrder_${selectedProfileId}`, value); }}
        />
      )}
      </div>

      {loading && selectedProfileId && <p>Loading games...</p>}

      {error && (
        <div className="bg-red-900/20 border border-red-500 text-red-400 px-4 py-2 rounded mb-4">
          {error}
        </div>
      )}

      {!selectedProfileId && noProfiles && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-full bg-[var(--steam-accent)]/10 flex items-center justify-center mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-[var(--steam-accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">No Steam profile yet</h2>
          <p className="text-gray-400 text-sm mb-6 max-w-sm">
            Add a Steam profile to start tracking your games and achievements.
          </p>
          <Link
            href="/setup?platform=steam"
            className="px-5 py-2.5 bg-[var(--steam-accent)] hover:opacity-90 text-gray-900 rounded-lg font-semibold text-sm transition"
          >
            Add Steam Profile
          </Link>
        </div>
      )}

      {selectedProfileId && totalCount > 0 && (
        <div className="mb-4 flex items-center justify-between flex-wrap gap-4">
          <p className="text-sm text-gray-400">
            Showing {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, totalCount)} of {totalCount} {onlyCompleted || onlyBaseCompleted ? 'completed' : 'total'} games
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
          viewMode={viewMode}
          emptyMessage={
            onlyBaseCompleted
              ? 'No completed Steam games yet.'
              : onlyCompleted
                ? 'No 100% completed Steam games yet.'
                : 'No Steam games found. Try syncing your profile.'
          }
          onGamesUpdated={() => setReloadTrigger((r) => r + 1)}
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
