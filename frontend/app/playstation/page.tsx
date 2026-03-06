'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '../../services/apiClient';

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

export default function PlayStationPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [onlyCompleted, setOnlyCompleted] = useState(true);
  const [sortBy, setSortBy] = useState<string>('completionPercent');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(100);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  useEffect(() => {
    loadGames();
  }, [onlyCompleted, sortBy, sortOrder, currentPage, itemsPerPage, reloadTrigger]);

  const handleItemsPerPageChange = async (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1);
    // Load immediately with new values
    await loadGames({ page: 1, perPage: newItemsPerPage });
  };

  const loadGames = async (overrides?: { page?: number; perPage?: number }) => {
    setLoading(true);
    setError('');

    const page = overrides?.page ?? currentPage;
    const perPage = overrides?.perPage ?? itemsPerPage;

    try {
      const params = new URLSearchParams({
        platform: 'playstation',
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
      </div>

      {loading && <p>Loading games...</p>}

      {error && (
        <div className="bg-red-900/20 border border-red-500 text-red-400 px-4 py-2 rounded mb-4">
          {error}
        </div>
      )}

      {totalCount > 0 && (
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

      {!loading && games.length === 0 && (
        <div className="text-gray-400 text-center py-12">
          <p>No PlayStation profiles configured.</p>
          <p className="text-sm mt-2">PlayStation sync coming soon.</p>
        </div>
      )}

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
    </div>
  );
}
