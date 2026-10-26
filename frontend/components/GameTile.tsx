'use client';

import { useRouter } from 'next/navigation';
import { getImageUrl, handleImageError } from '../services/imageUrl';

interface GameTileProps {
  game: {
    _id: string;
    gameId: string;
    title: string;
    platform: 'steam' | 'xbox' | 'playstation';
    achievementsTotal: number;
    achievementsUnlocked: number;
    completionPercent: number;
    capsuleImagePath?: string;
    customTitle?: string;
    profileId: string;
    currentGamerscore?: number;
    maxGamerscore?: number;
    isHidden?: boolean;
  };
  onEdit?: () => void;
  onHide?: () => void;
}

export default function GameTile({ game, onEdit, onHide }: GameTileProps) {
  const router = useRouter();

  const displayTitle = game.customTitle || game.title;

  const handleClick = () => {
    router.push(`/${game.platform}/game/${game.gameId}?profileId=${game.profileId}`);
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
      <div className="relative aspect-[2/3] bg-gray-900">
        {game.capsuleImagePath ? (
          <img
            src={getImageUrl(game.capsuleImagePath)}
            alt={game.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            onError={(e) => handleImageError(e, game.title)}
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
        {/* Edit Button */}
        {onEdit && (
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="absolute top-2 left-2 bg-gray-900/80 text-gray-300 hover:text-white p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="Edit game"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        )}
        {/* Hide Button */}
        {onHide && (
          <button
            onClick={(e) => { e.stopPropagation(); onHide(); }}
            className="absolute top-2 left-10 bg-gray-900/80 text-gray-300 hover:text-white p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label={game.isHidden ? 'Unhide game' : 'Hide game'}
            title={game.isHidden ? 'Unhide game' : 'Hide game'}
          >
            {game.isHidden ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
              </svg>
            )}
          </button>
        )}
      </div>

      {/* Game Info */}
      <div className="p-4">
        <h3 className="font-semibold text-sm sm:text-base line-clamp-2 mb-2 group-hover:text-white transition-colors">
          {displayTitle}
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
