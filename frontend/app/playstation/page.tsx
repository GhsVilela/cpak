'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiClient } from '../../services/apiClient';
import ProfileSelector from '../../components/ProfileSelector';

interface Game {
  _id: string;
  name: string;
  totalAchievements: number;
  earnedAchievements: number;
  completionPercentage: number;
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

function PlayStationPageContent() {
  const searchParams = useSearchParams();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [noProfiles, setNoProfiles] = useState(false);
  const [onlyCompleted, setOnlyCompleted] = useState(true);
  const [sortBy, setSortBy] = useState<string>('completionPercent');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(100);
  const [reloadTrigger, setReloadTrigger] = useState(0);
  const [selectedProfileId, setSelectedProfileId] = useState<string | undefined>(
    searchParams.get('profileId') || undefined
  );

  useEffect(() => {
    if (selectedProfileId) {
      loadGames();
    }
  }, [selectedProfileId, onlyCompleted, sortBy, sortOrder, currentPage, itemsPerPage, reloadTrigger]);

  const handleProfileChange = (profileId: string) => {
    setSelectedProfileId(profileId);
    setCurrentPage(1);
    setGames([]);
  };

  const handleProfileError = (err: string) => {
    setError(err);
  };

  const handleItemsPerPageChange = async (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1);
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
        platform: 'playstation',
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

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-[var(--playstation-accent)] mb-4">PlayStation Games</h1>
        <ProfileSelector
          platform="playstation"
          selectedProfileId={selectedProfileId}
          onSelectProfile={handleProfileChange}
          onError={handleProfileError}
          onProfilesLoaded={(count) => setNoProfiles(count === 0)}
        />
        {selectedProfileId && (
        <div className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={onlyCompleted}
              onChange={(e) => setOnlyCompleted(e.target.checked)}
              className="w-4 h-4"
            />
            <span>100% Only</span>
          </label>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">Sort by:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-1 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-[var(--playstation-accent)]"
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
              className="px-3 py-1 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-[var(--playstation-accent)]"
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </div>
        </div>
        )}
      </div>

      {loading && <p>Loading games...</p>}

      {error && (
        <div className="bg-red-900/20 border border-red-500 text-red-400 px-4 py-2 rounded mb-4">
          {error}
        </div>
      )}

      {!selectedProfileId && noProfiles && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-full bg-[var(--playstation-accent)]/10 flex items-center justify-center mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-[var(--playstation-accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">No PlayStation profile yet</h2>
          <p className="text-gray-400 text-sm mb-6 max-w-sm">
            Add a PlayStation profile to start tracking your games and achievements.
          </p>
          <a
            href="/setup?platform=playstation"
            className="px-5 py-2.5 bg-[var(--playstation-accent)] hover:opacity-90 text-white rounded-lg font-semibold text-sm transition"
          >
            Add PlayStation Profile
          </a>
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
                className="px-3 py-1 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-[var(--playstation-accent)]"
              >
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="200">200</option>
                <option value="500">500</option>
              </select>
            </div>
            <div className="flex items-center gap-4">
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

      {selectedProfileId && !loading && games.length === 0 && totalCount === 0 && (
        <div className="text-gray-400 text-center py-12">
          <p>No PlayStation games found. Try syncing your profile.</p>
        </div>
      )}

      {selectedProfileId && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {games.map((game) => (
            <div key={game._id} className="bg-gray-800 border border-gray-700 rounded-lg p-4 hover:border-[var(--playstation-accent)] transition">
              <h3 className="font-semibold text-lg mb-2">{game.name}</h3>
              <div className="text-sm text-gray-400 space-y-1">
                <p>
                  Trophies: {game.earnedAchievements} / {game.totalAchievements}
                </p>
                <p>Completion: {game.completionPercentage}%</p>
              </div>
              <div className="mt-3 bg-gray-700 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-[var(--playstation-accent)] h-full transition-all"
                  style={{ width: `${game.completionPercentage}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PlayStationPage() {
  return (
    <Suspense fallback={<div className="animate-pulse text-gray-500">Loading...</div>}>
      <PlayStationPageContent />
    </Suspense>
  );
}
