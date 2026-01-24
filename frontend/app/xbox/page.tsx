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

export default function XboxPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [onlyCompleted, setOnlyCompleted] = useState(true);

  useEffect(() => {
    loadGames();
  }, [onlyCompleted]);

  const loadGames = async () => {
    setLoading(true);
    setError('');

    try {
      const query = onlyCompleted ? '?platform=xbox&onlyCompleted=true' : '?platform=xbox';
      const data = await apiClient.get<Game[]>(`/games${query}`);
      setGames(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load games');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-[var(--xbox-accent)]">Xbox Games</h1>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={onlyCompleted}
            onChange={(e) => setOnlyCompleted(e.target.checked)}
            className="w-4 h-4"
          />
          <span>100% Complete Only</span>
        </label>
      </div>

      {loading && <p>Loading games...</p>}

      {error && (
        <div className="bg-red-900/20 border border-red-500 text-red-400 px-4 py-2 rounded mb-4">
          {error}
        </div>
      )}

      {!loading && games.length === 0 && (
        <div className="text-gray-400 text-center py-12">
          <p>No Xbox profiles configured.</p>
          <p className="text-sm mt-2">Xbox sync coming soon.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {games.map((game) => (
          <div key={game._id} className="bg-gray-800 border border-gray-700 rounded-lg p-4 hover:border-[var(--xbox-accent)] transition">
            <h3 className="font-semibold text-lg mb-2">{game.name}</h3>
            <div className="text-sm text-gray-400 space-y-1">
              <p>
                Achievements: {game.earnedAchievements} / {game.totalAchievements}
              </p>
              <p>Completion: {game.completionPercentage}%</p>
            </div>
            <div className="mt-3 bg-gray-700 rounded-full h-2 overflow-hidden">
              <div
                className="bg-[var(--xbox-accent)] h-full transition-all"
                style={{ width: `${game.completionPercentage}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
