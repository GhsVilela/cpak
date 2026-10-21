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
  lastPlayed?: string;
  playTimeMinutes?: number;
  ownershipSource?: 'owned' | 'played_history';
  achievementsFetchFailed?: boolean;
  hasAchievementGroups?: boolean;
}

interface Achievement {
  _id: string;
  achievementId: string;
  name: string;
  description?: string;
  unlockedAt?: string;
  iconPath?: string;
  iconGrayPath?: string;
  groupId?: string;
  groupName?: string;
  groupOrder?: number;
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

interface AchievementGroup {
  id: string;
  name: string;
  order: number;
  items: Achievement[];
}

function groupAchievements(achievements: Achievement[]): AchievementGroup[] {
  const map = new Map<string, AchievementGroup>();
  for (const achievement of achievements) {
    const id = achievement.groupId ?? '__default__';
    if (!map.has(id)) {
      map.set(id, {
        id,
        name: achievement.groupName ?? 'Base Game',
        order: achievement.groupOrder ?? 0,
        items: [],
      });
    }
    map.get(id)!.items.push(achievement);
  }
  return Array.from(map.values()).sort((a, b) => a.order - b.order);
}

function AchievementCard({ achievement, locked = false }: { achievement: Achievement; locked?: boolean }) {
  if (locked) {
    return (
      <div className="flex items-start gap-4 rounded-xl border border-[var(--border-muted)] bg-[var(--surface-muted)] p-4 opacity-70 transition-colors">
        <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/30">
          {achievement.iconGrayPath ? (
            <img
              src={getImageUrl(achievement.iconGrayPath)}
              onError={(e) => handleImageError(e, achievement.name)}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-2xl grayscale">🔒</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold text-gray-400">{achievement.name}</h3>
          {achievement.description && (
            <p className="mt-1 text-sm text-gray-500">{achievement.description}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--steam-accent)]">
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
        <h3 className="text-lg font-semibold">{achievement.name}</h3>
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

function AchievementGroupSection({ group }: { group: AchievementGroup }) {
  const [open, setOpen] = useState(false);
  const groupUnlocked = group.items.filter((a) => a.unlockedAt);
  const groupLocked = group.items.filter((a) => !a.unlockedAt);
  const percent = group.items.length > 0 ? Math.round((groupUnlocked.length / group.items.length) * 100) : 0;

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] transition-colors">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-[var(--surface-raised)]"
      >
        <span className={`text-xs text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-4">
            <span className="truncate text-lg font-semibold text-[var(--steam-accent)]">{group.name}</span>
            <span className="shrink-0 text-sm text-gray-400">
              {groupUnlocked.length} / {group.items.length}
            </span>
          </span>
          <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-[var(--border-muted)]">
            <span
              className="block h-full rounded-full bg-[var(--steam-accent)] transition-all"
              style={{ width: `${percent}%` }}
            />
          </span>
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-[var(--border-muted)] px-4 pb-4 pt-4">
          {groupUnlocked.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Unlocked ({groupUnlocked.length})
              </h3>
              <div className="space-y-2">
                {groupUnlocked.map((achievement) => (
                  <AchievementCard key={achievement._id} achievement={achievement} />
                ))}
              </div>
            </div>
          )}
          {groupLocked.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Locked ({groupLocked.length})
              </h3>
              <div className="space-y-2">
                {groupLocked.map((achievement) => (
                  <AchievementCard key={achievement._id} achievement={achievement} locked />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function GameDetailsPage({ params }: { params: Promise<{ id: string }> }) {
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
      // Build query parameters
      const params = new URLSearchParams({
        platform: 'steam',
      });
      
      if (profileId) {
        params.append('profileId', profileId);
      }

      // Fetch game details with profileId filter
      const gameData = await apiClient.get<Game>(`/games/${id}?${params.toString()}`);
      setGame(gameData);

      // Fetch achievements for this game using the MongoDB _id
      const achievementsData = await apiClient.get<Achievement[]>(`/achievements?gameId=${gameData._id}`);
      setAchievements(achievementsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load game details');
    } finally {
      setLoading(false);
    }
  };

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
          onClick={() => router.push(profileId ? `/steam?profileId=${profileId}` : '/steam')}
          className="text-[var(--steam-accent)] hover:underline"
        >
          ← Back to games
        </button>
      </div>
    );
  }

  const unlockedAchievements = achievements.filter(a => a.unlockedAt);
  const lockedAchievements = achievements.filter(a => !a.unlockedAt);
  const groups = groupAchievements(achievements);
  const showGroups = !!game.hasAchievementGroups && groups.length > 1;

  return (
    <div className="mx-auto max-w-4xl">
      {/* Back button */}
      <button
        onClick={() => router.push(profileId ? `/steam?profileId=${profileId}` : '/steam')}
        className="mb-6 flex items-center gap-2 text-sm text-[var(--steam-accent)] transition hover:underline"
      >
        <span>←</span> Back to games
      </button>

      {/* Game header */}
      <div className="relative mb-6 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-lg">
        <div
          className="absolute inset-x-0 top-0 h-1"
          style={{ background: 'linear-gradient(90deg, var(--steam-accent), transparent)' }}
        />
        <h1 className="mb-4 text-3xl font-bold">{game.customTitle || game.title}</h1>
        <div className="flex flex-nowrap items-center gap-0 overflow-x-auto text-sm divide-x divide-[var(--border)]">
          <div className="shrink-0 whitespace-nowrap pr-5">
            <div className="text-xs uppercase tracking-wide text-gray-400">Achievements</div>
            <div className="mt-0.5 font-semibold">
              {game.achievementsUnlocked} / {game.achievementsTotal}
            </div>
          </div>
          <div className="shrink-0 whitespace-nowrap px-5">
            <div className="text-xs uppercase tracking-wide text-gray-400">Completion</div>
            <div className="mt-0.5 font-semibold">
              {game.completionPercent}%
            </div>
          </div>
          {game.playTimeMinutes !== undefined && game.playTimeMinutes > 0 && (
            <div className="shrink-0 whitespace-nowrap px-5">
              <div className="text-xs uppercase tracking-wide text-gray-400">Time Played</div>
              <div className="mt-0.5 font-semibold">{formatPlaytime(game.playTimeMinutes)}</div>
            </div>
          )}
          {game.lastPlayed && (
            <div className="shrink-0 whitespace-nowrap px-5">
              <div className="text-xs uppercase tracking-wide text-gray-400">Last Played</div>
              <div className="mt-0.5 font-semibold" title={new Date(game.lastPlayed).toLocaleString()}>
                {formatLastPlayed(game.lastPlayed)}
              </div>
            </div>
          )}
          {game.ownershipSource === 'played_history' && (
            <div className="shrink-0 whitespace-nowrap px-5">
              <div className="text-xs uppercase tracking-wide text-gray-400">Source</div>
              <div className="mt-0.5 font-semibold text-yellow-400" title="This game is not in the owned games list">
                {game.achievementsFetchFailed ? 'Revoked License' : 'Family Sharing'}
              </div>
            </div>
          )}
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-[var(--border-muted)]">
          <div
            className="h-full bg-[var(--steam-accent)] transition-all"
            style={{ width: `${game.completionPercent}%` }}
          />
        </div>
      </div>

      {/* Warning banner for games with failed achievement fetch */}
      {game.achievementsFetchFailed && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-yellow-600/60 bg-yellow-900/20 px-4 py-3 text-yellow-400">
          <span className="mt-0.5 text-xl">⚠️</span>
          <div>
            <p className="font-semibold">Achievement data unavailable</p>
            <p className="mt-1 text-sm text-yellow-500">
              This game appears in your play history but unlocked achievements could not be fetched.
              This usually happens when a game license has been revoked due to a refunded game, a limited-time free-to-play campaign, or no longer being part of a family sharing group.
              The game is still shown in your library for reference.
            </p>
          </div>
        </div>
      )}

      {/* Achievements list */}
      <div className="space-y-6">
        {showGroups ? (
          groups.map((group) => (
            <AchievementGroupSection key={group.id} group={group} />
          ))
        ) : (
          <>
            {/* Unlocked achievements */}
            {unlockedAchievements.length > 0 && (
              <div>
                <h2 className="mb-4 text-xl font-semibold text-[var(--steam-accent)]">
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
          </>
        )}

        {achievements.length === 0 && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] py-12 text-center text-gray-400">
            <p>No achievement data available for this game or sync is still in progress.</p>
          </div>
        )}
      </div>
    </div>
  );
}
