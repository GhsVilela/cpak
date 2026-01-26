'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '../../services/apiClient';
import ProfileSelector from '../../components/ProfileSelector';

interface Game {
  _id: string;
  gameId: string;
  title: string;
  achievementsTotal: number;
  achievementsUnlocked: number;
  completionPercent: number;
  iconPath?: string;
}

export default function SteamPage() {
  const router = useRouter();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [onlyCompleted, setOnlyCompleted] = useState(true);
  const [selectedProfileId, setSelectedProfileId] = useState<string | undefined>();

  useEffect(() => {
    if (selectedProfileId) {
      loadGames();
    }
  }, [onlyCompleted, selectedProfileId]);

  const loadGames = async () => {
    if (!selectedProfileId) return;

    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams({
        platform: 'steam',
        profileId: selectedProfileId,
      });
      
      if (onlyCompleted) {
        params.append('onlyCompleted', 'true');
      }

      const data = await apiClient.get<Game[]>(`/games?${params.toString()}`);
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
        <h1 className="text-3xl font-bold text-[var(--steam-accent)]">Steam Games</h1>
        <div className="flex items-center gap-4">
          <ProfileSelector
            platform="steam"
            selectedProfileId={selectedProfileId}
            onSelectProfile={setSelectedProfileId}
          />
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
      </div>

      {loading && <p>Loading games...</p>}

      {error && (
        <div className="bg-red-900/20 border border-red-500 text-red-400 px-4 py-2 rounded mb-4">
          {error}
        </div>
      )}

      {!loading && games.length === 0 && (
        <div className="text-gray-400 text-center py-12">
          <p>No games found.</p>
          {onlyCompleted && <p className="text-sm mt-2">Try disabling the 100% filter.</p>}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {games.map((game) => (
          <div 
            key={game._id} 
            onClick={() => router.push(`/steam/game/${game._id}`)}
            className="bg-gray-800 border border-gray-700 rounded-lg p-4 hover:border-[var(--steam-accent)] hover:bg-gray-750 cursor-pointer transition"
          >
            <div className="flex items-start gap-4 mb-3">
              {game.iconPath && (
                <img 
                  src={`/api/icons/${game.iconPath}`}
                  alt={game.title}
                  className="w-16 h-16 rounded flex-shrink-0 object-cover"
                />
              )}
              <h3 className="font-semibold text-lg line-clamp-2 flex-1">{game.title}</h3>
            </div>
            <div className="text-sm space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Achievements</span>
                <span className="font-medium">{game.achievementsUnlocked} / {game.achievementsTotal}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Completion</span>
                <span className="font-medium text-[var(--steam-accent)]">{game.completionPercent}%</span>
              </div>
            </div>
            <div className="mt-4 bg-gray-700 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-[var(--steam-accent)] h-full transition-all"
                style={{ width: `${game.completionPercent}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
