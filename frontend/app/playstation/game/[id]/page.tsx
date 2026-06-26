'use client';

import { use, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiClient } from '../../../../services/apiClient';
import TrophyGradeBadge from '../../../../components/TrophyGradeBadge';

interface Game {
  _id: string;
  gameId: string;
  title: string;
  achievementsTotal: number;
  achievementsUnlocked: number;
  completionPercent: number;
  platform: string;
  devices?: string[];
  lastPlayed?: string | null;
  playTimeMinutes?: number | null;
  trophyBronze?: number | null;
  trophySilver?: number | null;
  trophyGold?: number | null;
  trophyPlatinum?: number | null;
}

interface Achievement {
  _id: string;
  achievementId: string;
  name: string;
  description?: string | null;
  unlockedAt?: string | null;
  iconPath?: string | null;
  iconGrayPath?: string | null;
  trophyGrade?: 'bronze' | 'silver' | 'gold' | 'platinum' | null;
  isHidden?: boolean;
  gamerscore?: number | null;
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

export default function PlayStationGameDetailsPage({ params }: { params: Promise<{ id: string }> }) {
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
      const queryParams = new URLSearchParams({ platform: 'playstation' });
      if (profileId) queryParams.append('profileId', profileId);

      const gameData = await apiClient.get<Game>(`/games/${id}?${queryParams.toString()}`);
      setGame(gameData);

      const achievementsData = await apiClient.get<Achievement[]>(
        `/achievements?gameId=${gameData._id}${profileId ? `&profileId=${profileId}` : ''}`
      );
      setAchievements(achievementsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load game details');
    } finally {
      setLoading(false);
    }
  };

  const backHref = profileId ? `/playstation?profileId=${profileId}` : '/playstation';

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
          className="text-[var(--playstation-accent)] hover:underline"
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
        className="text-[var(--playstation-accent)] hover:underline mb-6 flex items-center gap-2"
      >
        <span>←</span> Back to games
      </button>

      {/* Game header */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
        <h1 className="text-3xl font-bold mb-4">{game.title}</h1>
        <div className="flex items-center gap-0 text-sm divide-x divide-gray-600 overflow-x-auto flex-nowrap">
          <div className="pr-5 shrink-0 whitespace-nowrap">
            <div className="text-gray-400 text-xs uppercase tracking-wide">Trophies</div>
            <div className="font-semibold mt-0.5">
              {game.achievementsUnlocked} / {game.achievementsTotal}
            </div>
          </div>
          <div className="px-5 shrink-0 whitespace-nowrap">
            <div className="text-gray-400 text-xs uppercase tracking-wide">Completion</div>
            <div className="font-semibold mt-0.5">{game.completionPercent}%</div>
          </div>
          {/* Trophy grade breakdown */}
          {(game.trophyPlatinum != null || game.trophyGold != null) && (
            <div className="px-5 shrink-0 whitespace-nowrap">
              <div className="text-gray-400 text-xs uppercase tracking-wide mb-1">Grades</div>
              <div className="flex items-center gap-1 flex-wrap">
                {(game.trophyPlatinum ?? 0) > 0 && (
                  <span className="text-xs" style={{ color: '#a0b4c8' }}>P:{game.trophyPlatinum}</span>
                )}
                {(game.trophyGold ?? 0) > 0 && (
                  <span className="text-xs" style={{ color: '#c8a800' }}>G:{game.trophyGold}</span>
                )}
                {(game.trophySilver ?? 0) > 0 && (
                  <span className="text-xs" style={{ color: '#a8a8a8' }}>S:{game.trophySilver}</span>
                )}
                {(game.trophyBronze ?? 0) > 0 && (
                  <span className="text-xs" style={{ color: '#cd7f32' }}>B:{game.trophyBronze}</span>
                )}
              </div>
            </div>
          )}
          {/* Conditionally render last played — omit when null */}
          {game.lastPlayed && (
            <div className="px-5 shrink-0 whitespace-nowrap">
              <div className="text-gray-400 text-xs uppercase tracking-wide">Last Played</div>
              <div className="font-semibold mt-0.5" title={new Date(game.lastPlayed).toLocaleString()}>
                {formatLastPlayed(game.lastPlayed)}
              </div>
            </div>
          )}
          {/* Conditionally render play time — omit when null */}
          {game.playTimeMinutes != null && game.playTimeMinutes > 0 && (
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
            className="bg-[var(--playstation-accent)] h-full transition-all"
            style={{ width: `${game.completionPercent}%` }}
          />
        </div>
      </div>

      {/* Trophy list */}
      <div className="space-y-6">
        {/* Unlocked trophies */}
        {unlockedAchievements.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold mb-4 text-[var(--playstation-accent)]">
              Unlocked ({unlockedAchievements.length})
            </h2>
            <div className="space-y-2">
              {unlockedAchievements.map((trophy) => (
                <div
                  key={trophy._id}
                  className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex gap-4 items-start"
                >
                  <div className="flex-shrink-0 w-16 h-16 bg-gray-700 rounded flex items-center justify-center overflow-hidden">
                    {trophy.iconPath ? (
                      <img
                        src={`/api/icons/${trophy.iconPath}`}
                        alt={trophy.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-2xl">🏆</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-lg">{trophy.name}</h3>
                      {trophy.trophyGrade && <TrophyGradeBadge grade={trophy.trophyGrade} />}
                    </div>
                    {trophy.description && (
                      <p className="text-sm text-gray-400 mt-1">{trophy.description}</p>
                    )}
                    {trophy.unlockedAt && (
                      <p className="text-xs text-gray-500 mt-2">
                        Unlocked: {new Date(trophy.unlockedAt).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Locked trophies */}
        {lockedAchievements.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold mb-4 text-gray-400">
              Locked ({lockedAchievements.length})
            </h2>
            <div className="space-y-2">
              {lockedAchievements.map((trophy) => (
                <div
                  key={trophy._id}
                  className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-4 flex gap-4 items-start opacity-60"
                >
                  <div className="flex-shrink-0 w-16 h-16 bg-gray-700/50 rounded flex items-center justify-center overflow-hidden">
                    {/* PSN stores a single icon URL; lock state uses CSS grayscale */}
                    {trophy.iconPath || trophy.iconGrayPath ? (
                      <img
                        src={`/api/icons/${trophy.iconGrayPath ?? trophy.iconPath}`}
                        alt={trophy.isHidden ? 'Hidden Trophy' : trophy.name}
                        className="w-full h-full object-cover grayscale"
                      />
                    ) : (
                      <span className="text-2xl">🔒</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-lg text-gray-400">
                        {/* Hidden trophy: show resolved name if available, else placeholder */}
                        {trophy.isHidden && trophy.name === 'Hidden Trophy'
                          ? 'Hidden Trophy'
                          : trophy.name}
                      </h3>
                      {trophy.trophyGrade && <TrophyGradeBadge grade={trophy.trophyGrade} />}
                    </div>
                    {trophy.description && !trophy.isHidden && (
                      <p className="text-sm text-gray-500 mt-1">{trophy.description}</p>
                    )}
                    {trophy.isHidden && !trophy.unlockedAt && (
                      <p className="text-sm text-gray-600 mt-1 italic">Secret trophy</p>
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
            <p>No trophies found for this game.</p>
          </div>
        )}
      </div>
    </div>
  );
}
