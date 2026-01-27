'use client';

import { useRouter } from 'next/navigation';

interface GameTileProps {
  game: {
    _id: string;
    gameId: string;
    title: string;
    platform: 'steam' | 'xbox' | 'playstation';
    achievementsTotal: number;
    achievementsUnlocked: number;
    completionPercent: number;
    iconPath?: string;
  };
}

export default function GameTile({ game }: GameTileProps) {
  const router = useRouter();

  const handleClick = () => {
    router.push(`/${game.platform}/game/${game.gameId}`);
  };

  const getCompletionColor = (percent: number) => {
    if (percent === 100) return 'text-green-400';
    if (percent >= 75) return 'text-blue-400';
    if (percent >= 50) return 'text-yellow-400';
    if (percent >= 25) return 'text-orange-400';
    return 'text-gray-400';
  };

  const getPlatformAccent = (platform: string) => {
    switch (platform) {
      case 'steam':
        return 'var(--steam-accent)';
      case 'xbox':
        return 'var(--xbox-accent)';
      case 'playstation':
        return 'var(--playstation-accent)';
      default:
        return '#6366f1';
    }
  };

  return (
    <div
      onClick={handleClick}
      className="group relative bg-gray-800 rounded-lg overflow-hidden cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-xl"
      style={{
        borderTop: `3px solid ${getPlatformAccent(game.platform)}`,
      }}
    >
      {/* Game Image */}
      <div className="relative aspect-[3/4] sm:aspect-[4/3] bg-gray-900">
        {game.iconPath ? (
          <img
            src={`/api/icons/${game.iconPath}`}
            alt={game.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-600">
            <svg
              className="w-16 h-16"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
        )}

        {/* Completion Badge */}
        {game.completionPercent === 100 && (
          <div className="absolute top-2 right-2 bg-green-500 text-white px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1">
            <svg
              className="w-3 h-3"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            100%
          </div>
        )}
      </div>

      {/* Game Info */}
      <div className="p-4">
        <h3 className="font-semibold text-sm sm:text-base line-clamp-2 mb-2 group-hover:text-white transition-colors">
          {game.title}
        </h3>

        {/* Achievement Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs sm:text-sm">
            <span className="text-gray-400">
              {game.achievementsUnlocked} / {game.achievementsTotal}
            </span>
            <span className={`font-semibold ${getCompletionColor(game.completionPercent)}`}>
              {game.completionPercent}%
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${game.completionPercent}%`,
                backgroundColor: getPlatformAccent(game.platform),
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
