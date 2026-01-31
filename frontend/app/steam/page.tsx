'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiClient } from '../../services/apiClient';
import ProfileSelector from '../../components/ProfileSelector';
import GameGrid from '../../components/GameGrid';

interface Game {
  _id: string;
  gameId: string;
  title: string;
  platform: 'steam' | 'xbox' | 'playstation';
  achievementsTotal: number;
  achievementsUnlocked: number;
  completionPercent: number;
  iconPath?: string;
  profileId: string;
}

function SteamPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [onlyCompleted, setOnlyCompleted] = useState(false);
  // Initialize from URL immediately, not in useEffect
  const [selectedProfileId, setSelectedProfileId] = useState<string | undefined>(
    searchParams.get('profileId') || undefined
  );

  useEffect(() => {
    if (selectedProfileId) {
      loadGames();
    }
  }, [onlyCompleted, selectedProfileId]);

  const handleProfileChange = (profileId: string) => {
    setSelectedProfileId(profileId);
    // Update URL to include profileId
    router.push(`/steam?profileId=${profileId}`, { scroll: false });
  };

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
            onSelectProfile={handleProfileChange}
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

      {!loading && games.length === 0 && !error && selectedProfileId && (
        <div className="bg-blue-900/20 border border-blue-500 text-blue-400 px-4 py-3 rounded mb-4">
          <p className="font-semibold">Sync in Progress or No Games Found</p>
          <p className="text-sm mt-1">
            Your Steam profile may be syncing. This can take a few minutes. 
            {onlyCompleted && ' If you have games with achievements unlocked but no 100% completions, try disabling the "100% Complete Only" filter.'}
          </p>
        </div>
      )}

      {selectedProfileId && (
        <GameGrid 
          games={games} 
          loading={loading}
          emptyMessage={onlyCompleted ? 'No 100% completed games. Try disabling the filter.' : 'No games found (Steam profile maybe set to Private).'}
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
