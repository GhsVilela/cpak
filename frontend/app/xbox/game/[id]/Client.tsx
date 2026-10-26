'use client';

import { use, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiClient } from '../../../../services/apiClient';
import { getImageUrl, handleImageError } from '../../../../services/imageUrl';

interface Game {
  _id: string;
  gameId: string;
  title: string;
  customTitle?: string;
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

function AchievementCard({ achievement, locked = false }: { achievement: Achievement; locked?: boolean }) {
  if (locked) {
    return (
      <div className="flex items-start gap-4 rounded-xl border border-[var(--border-muted)] bg-[var(--surface-muted)] p-4 opacity-70 transition-colors">
        <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/30">
          {/* Xbox stores a single icon; locked icons use CSS grayscale */}
          {achievement.iconPath || achievement.iconGrayPath ? (
            <img
              src={getImageUrl(achievement.iconGrayPath ?? achievement.iconPath)}
              onError={(e) => handleImageError(e, achievement.name)}
              className="h-full w-full object-cover grayscale"
            />
          ) : (
            <span className="text-2xl grayscale">🔒</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-gray-400">{achievement.name}</h3>
            {achievement.gamerscore !== undefined && achievement.gamerscore > 0 && (
              <span className="rounded border border-gray-600 bg-gray-700 px-2 py-0.5 text-xs font-bold text-gray-500">
                {achievement.gamerscore}G
              </span>
            )}
          </div>
          {achievement.description && (
            <p className="mt-1 text-sm text-gray-500">{achievement.description}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/30">
        {achievement.iconPath ? (
          <img
            src={getImageUrl(achievement.iconPath)}
            onError={(e) => handleImageError(e, achievement.name)}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-2xl">🏆</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold">{achievement.name}</h3>
          {achievement.gamerscore !== undefined && achievement.gamerscore > 0 && (
            <span className="rounded border border-gray-500 bg-gray-700 px-2 py-0.5 text-xs font-bold text-white">
              {achievement.gamerscore} G
            </span>
          )}
        </div>
        {achievement.description && (
          <p className="mt-1 text-sm text-gray-400">{achievement.description}</p>
        )}
        {achievement.unlockedAt && (
          <p className="mt-2 text-xs text-gray-500">
            Unlocked: {new Date(achievement.unlockedAt).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })}
          </p>
        )}
      </div>
    </div>
  );
}


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
    window.scrollTo(0, 0);
  }, [id]);

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
      <div className="mx-auto max-w-4xl">
        <p className="text-gray-400">Loading game details...</p>
      </div>
    );
  }

  if (error || !game) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 rounded-xl border border-red-500/50 bg-red-900/20 px-4 py-3 text-red-400">
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
    <div className="mx-auto max-w-4xl">
      {/* Back button */}
      <button
        onClick={() => router.push(backHref)}
        className="mb-6 flex items-center gap-2 text-sm text-[var(--xbox-accent)] transition hover:underline"
      >
        <span>←</span> Back to games
      </button>

      {/* Game header */}
      <div className="relative mb-6 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-lg">
        <div
          className="absolute inset-x-0 top-0 h-1"
          style={{ background: 'linear-gradient(90deg, var(--xbox-accent), transparent)' }}
        />
        <h1 className="mb-4 text-3xl font-bold">{game.customTitle || game.title}</h1>
        <div className="flex flex-nowrap items-center gap-0 overflow-x-auto text-sm divide-x divide-[var(--border)]">
          <div className="shrink-0 whitespace-nowrap pr-5">
            <div className="text-xs uppercase tracking-wide text-gray-400">Achievements</div>
            <div className="mt-0.5 font-semibold">
              {game.achievementsUnlocked} / {game.achievementsTotal}
            </div>
          </div>
          {game.maxGamerscore !== undefined && game.maxGamerscore > 0 && (
            <div className="shrink-0 whitespace-nowrap px-5">
              <div className="text-xs uppercase tracking-wide text-gray-400">Gamerscore</div>
              <div className="mt-0.5 font-semibold">
                {(game.currentGamerscore ?? 0).toLocaleString()} / {game.maxGamerscore.toLocaleString()}
              </div>
            </div>
          )}
          <div className="shrink-0 whitespace-nowrap px-5">
            <div className="text-xs uppercase tracking-wide text-gray-400">Completion</div>
            <div className="mt-0.5 font-semibold">{game.completionPercent}%</div>
          </div>
          {game.lastPlayed && (
            <div className="shrink-0 whitespace-nowrap px-5">
              <div className="text-xs uppercase tracking-wide text-gray-400">Last Played</div>
              <div className="mt-0.5 font-semibold" title={new Date(game.lastPlayed).toLocaleString()}>
                {formatLastPlayed(game.lastPlayed)}
              </div>
            </div>
          )}
          {game.playTimeMinutes !== undefined && game.playTimeMinutes > 0 && (
            <div className="shrink-0 whitespace-nowrap px-5">
              <div className="text-xs uppercase tracking-wide text-gray-400">Time Played</div>
              <div className="mt-0.5 font-semibold">{formatPlaytime(game.playTimeMinutes)}</div>
            </div>
          )}
          {game.devices && game.devices.length > 0 && (
            <div className="shrink-0 whitespace-nowrap pl-5">
              <div className="text-xs uppercase tracking-wide text-gray-400">Platforms</div>
              <div className="mt-0.5 font-semibold">{game.devices.join(', ')}</div>
            </div>
          )}
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-[var(--border-muted)]">
          <div
            className="h-full bg-[var(--xbox-accent)] transition-all"
            style={{ width: `${game.completionPercent}%` }}
          />
        </div>
      </div>

      {/* Achievements list */}
      <div className="space-y-6">
        {/* Unlocked achievements */}
        {unlockedAchievements.length > 0 && (
          <div>
            <h2 className="mb-4 text-xl font-semibold text-[var(--xbox-accent)]">
              Unlocked ({unlockedAchievements.length})
            </h2>
            <div className="space-y-2">
              {unlockedAchievements.map((achievement) => (
                <AchievementCard key={achievement._id} achievement={achievement} />
              ))}
            </div>
          </div>
        )}

        {/* Locked achievements */}
        {lockedAchievements.length > 0 && (
          <div>
            <h2 className="mb-4 text-xl font-semibold text-gray-400">
              Locked ({lockedAchievements.length})
            </h2>
            <div className="space-y-2">
              {lockedAchievements.map((achievement) => (
                <AchievementCard key={achievement._id} achievement={achievement} locked />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {achievements.length === 0 && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] py-12 text-center text-gray-400">
            <p>No achievements found for this game.</p>
          </div>
        )}
      </div>
    </div>
  );
}
