'use client';

import GameTile from './GameTile';

interface Game {
  _id: string;
  gameId: string;
  title: string;
  platform: 'steam' | 'xbox' | 'playstation';
  achievementsTotal: number;
  achievementsUnlocked: number;
  completionPercent: number;
  iconPath?: string;
}

interface GameGridProps {
  games: Game[];
  loading?: boolean;
  emptyMessage?: string;
}

export default function GameGrid({ games, loading = false, emptyMessage = 'No games found' }: GameGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
        {[...Array(12)].map((_, i) => (
          <div
            key={i}
            className="bg-gray-800 rounded-lg overflow-hidden animate-pulse"
          >
            <div className="aspect-[2/3] bg-gray-700" />
            <div className="p-4 space-y-2">
              <div className="h-4 bg-gray-700 rounded w-3/4" />
              <div className="h-3 bg-gray-700 rounded w-1/2" />
              <div className="h-2 bg-gray-700 rounded w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <svg
          className="w-16 h-16 mx-auto mb-4 text-gray-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
          />
        </svg>
        <p className="text-lg">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
      {games.map((game) => (
        <GameTile key={game._id} game={game} />
      ))}
    </div>
  );
}
