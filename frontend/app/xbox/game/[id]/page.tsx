'use client';

import { use, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiClient } from '../../../../services/apiClient';

interface Game {
  _id: string;
  gameId: string;
  title: string;
  achievementsTotal: number;
  achievementsUnlocked: number;
  completionPercent: number;
  platform: string;
  devices?: string[];
  currentGamerscore?: number;
  maxGamerscore?: number;
  lastPlayed?: string;
  playTimeMinutes?: number;
}

interface Achievement {
  _id: string;
  achievementId: string;
  name: string;
  description?: string;
  unlockedAt?: string;
  /** Xbox stores the same icon URL for locked/unlocked — CSS handles grayscale */
  iconPath?: string;
  iconGrayPath?: string;
  gamerscore?: number;
}

function formatLastPlayed(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) === 1 ? '' : 's'} ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) === 1 ? '' : 's'} ago`;
  return date.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatPlaytime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// Make this page dynamic (not static)
export const dynamic = 'force-dynamic';

export default function XboxGameDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const profileId = searchParams.get('profileId');
  const [game, setGame] = useState<Game | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadGameDetails();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, profileId]);

  const loadGameDetails = async () => {
    setLoading(true);
    setError('');

    try {
      const queryParams = new URLSearchParams({ platform: 'xbox' });
      if (profileId) {
        queryParams.append('profileId', profileId);
      }

      const gameData = await apiClient.get<Game>(`/games/${id}?${queryParams.toString()}`);
      setGame(gameData);

      const achievementsData = await apiClient.get<Achievement[]>(
        `/achievements?gameId=${gameData._id}`
      );
      setAchievements(achievementsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load game details');
    } finally {
      setLoading(false);
    }
  };

  const backHref = profileId ? `/xbox?profileId=${profileId}` : '/xbox';

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <p>Loading game details...</p>
      </div>
    );
  }

  if (error || !game) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-red-900/20 border border-red-500 text-red-400 px-4 py-2 rounded mb-4">
          {error || 'Game not found'}
        </div>
        <button
          onClick={() => router.push(backHref)}
          className="text-[var(--xbox-accent)] hover:underline"
        >
          ← Back to games
        </button>
      </div>
    );
  }

  const unlockedAchievements = achievements.filter((a) => a.unlockedAt);
  const lockedAchievements = achievements.filter((a) => !a.unlockedAt);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Back button */}
      <button
        onClick={() => router.push(backHref)}
        className="text-[var(--xbox-accent)] hover:underline mb-6 flex items-center gap-2"
      >
        <span>←</span> Back to games
      </button>

      {/* Game header */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
        <h1 className="text-3xl font-bold mb-4">{game.title}</h1>
        <div className="flex items-center gap-0 text-sm divide-x divide-gray-600 overflow-x-auto flex-nowrap">
          <div className="pr-5 shrink-0 whitespace-nowrap">
            <div className="text-gray-400 text-xs uppercase tracking-wide">Achievements</div>
            <div className="font-semibold mt-0.5">
              {game.achievementsUnlocked} / {game.achievementsTotal}
            </div>
          </div>
          {game.maxGamerscore !== undefined && game.maxGamerscore > 0 && (
            <div className="px-5 shrink-0 whitespace-nowrap">
              <div className="text-gray-400 text-xs uppercase tracking-wide">Gamerscore</div>
              <div className="font-semibold mt-0.5">
                {(game.currentGamerscore ?? 0).toLocaleString()} / {game.maxGamerscore.toLocaleString()}
              </div>
            </div>
          )}
          <div className="px-5 shrink-0 whitespace-nowrap">
            <div className="text-gray-400 text-xs uppercase tracking-wide">Completion</div>
            <div className="font-semibold mt-0.5">
              {game.completionPercent}%
            </div>
          </div>
          {game.lastPlayed && (
            <div className="px-5 shrink-0 whitespace-nowrap">
              <div className="text-gray-400 text-xs uppercase tracking-wide">Last Played</div>
              <div className="font-semibold mt-0.5" title={new Date(game.lastPlayed).toLocaleString()}>
                {formatLastPlayed(game.lastPlayed)}
              </div>
            </div>
          )}
          {game.playTimeMinutes !== undefined && game.playTimeMinutes > 0 && (
            <div className="px-5 shrink-0 whitespace-nowrap">
              <div className="text-gray-400 text-xs uppercase tracking-wide">Time Played</div>
              <div className="font-semibold mt-0.5">{formatPlaytime(game.playTimeMinutes)}</div>
            </div>
          )}
          {game.devices && game.devices.length > 0 && (
            <div className="pl-5 shrink-0 whitespace-nowrap">
              <div className="text-gray-400 text-xs uppercase tracking-wide">Platforms</div>
              <div className="font-semibold mt-0.5">{game.devices.join(', ')}</div>
            </div>
          )}
        </div>
        <div className="mt-4 bg-gray-700 rounded-full h-3 overflow-hidden">
          <div
            className="bg-[var(--xbox-accent)] h-full transition-all"
            style={{ width: `${game.completionPercent}%` }}
          />
        </div>
      </div>

      {/* Achievements list */}
      <div className="space-y-6">
        {/* Unlocked achievements */}
        {unlockedAchievements.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold mb-4 text-[var(--xbox-accent)]">
              Unlocked ({unlockedAchievements.length})
            </h2>
            <div className="space-y-2">
              {unlockedAchievements.map((achievement) => (
                <div
                  key={achievement._id}
                  className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex gap-4 items-start"
                >
                  <div className="flex-shrink-0 w-16 h-16 bg-gray-700 rounded flex items-center justify-center overflow-hidden">
                    {achievement.iconPath ? (
                      <img
                        src={`/api/icons/${achievement.iconPath}`}
                        alt={achievement.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-2xl">🏆</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-lg">{achievement.name}</h3>
                      {achievement.gamerscore !== undefined && achievement.gamerscore > 0 && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-gray-700 text-white border border-gray-500">
                          {achievement.gamerscore} G
                        </span>
                      )}
                    </div>
                    {achievement.description && (
                      <p className="text-sm text-gray-400 mt-1">{achievement.description}</p>
                    )}
                    {achievement.unlockedAt && (
                      <p className="text-xs text-gray-500 mt-2">
                        Unlocked: {new Date(achievement.unlockedAt).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Locked achievements */}
        {lockedAchievements.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold mb-4 text-gray-400">
              Locked ({lockedAchievements.length})
            </h2>
            <div className="space-y-2">
              {lockedAchievements.map((achievement) => (
                <div
                  key={achievement._id}
                  className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-4 flex gap-4 items-start opacity-60"
                >
                  <div className="flex-shrink-0 w-16 h-16 bg-gray-700/50 rounded flex items-center justify-center overflow-hidden">
                    {/* Xbox stores a single icon; locked icons use CSS grayscale */}
                    {achievement.iconPath || achievement.iconGrayPath ? (
                      <img
                        src={`/api/icons/${achievement.iconGrayPath ?? achievement.iconPath}`}
                        alt={achievement.name}
                        className="w-full h-full object-cover grayscale"
                      />
                    ) : (
                      <span className="text-2xl grayscale">🔒</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-lg text-gray-400">{achievement.name}</h3>
                      {achievement.gamerscore !== undefined && achievement.gamerscore > 0 && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-gray-700 text-gray-500 border border-gray-600">
                          {achievement.gamerscore}G
                        </span>
                      )}
                    </div>
                    {achievement.description && (
                      <p className="text-sm text-gray-500 mt-1">{achievement.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {achievements.length === 0 && (
          <div className="text-gray-400 text-center py-12">
            <p>No achievements found for this game.</p>
          </div>
        )}
      </div>
    </div>
  );
}
