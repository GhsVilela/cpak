'use client';

import { useRouter } from 'next/navigation';
import { getImageUrl, handleImageError } from '../services/imageUrl';
import TrophyCounts from './TrophyCounts';
import { getCurrentListReturnTo } from '../lib/navigation';

interface GameListItemProps {
  game: {
    _id: string;
    gameId: string;
    title: string;
    customTitle?: string;
    platform: 'steam' | 'xbox' | 'playstation';
    achievementsTotal: number;
    achievementsUnlocked: number;
    completionPercent: number;
    iconImagePath?: string;
    profileId: string;
    currentGamerscore?: number;
    maxGamerscore?: number;
    trophyBronze?: number;
    trophySilver?: number;
    trophyGold?: number;
    trophyPlatinum?: number;
    /** PlayStation: true when the game defines a Platinum trophy. */
    hasPlatinum?: boolean;
    /** Xbox: true when the game's Mythic achievement has been earned. */
    isMythic?: boolean;
    /** True when achievements/trophies are split into base-game and DLC sets. */
    hasAchievementGroups?: boolean;
    /** Steam: number of achievements in the base-game set. */
    baseGameAchievementsTotal?: number;
    /** Steam: number of base-game achievements unlocked. */
    baseGameAchievementsUnlocked?: number;
    isHidden?: boolean;
  };
  onEdit?: () => void;
  onHide?: () => void;
  onActions?: () => void;
}

export default function GameListItem({ game, onEdit, onHide, onActions }: GameListItemProps) {
  const router = useRouter();
  const displayTitle = game.customTitle || game.title;
  const hasTrophyCounts =
    game.hasPlatinum === true ||
    game.trophyPlatinum != null ||
    game.trophyGold != null ||
    game.trophySilver != null ||
    game.trophyBronze != null;

  const handleClick = () => {
    const params = new URLSearchParams({ profileId: game.profileId });
    const returnTo = getCurrentListReturnTo(game.platform);
    if (returnTo) params.set('returnTo', returnTo);
    router.push(`/${game.platform}/game/${game.gameId}?${params.toString()}`);
  };

  const getCompletionColor = (percent: number) => {
    if (percent === 100) return 'text-green-400';
    if (percent >= 75) return 'text-blue-400';
    if (percent >= 50) return 'text-yellow-400';
    if (percent >= 25) return 'text-orange-400';
    return 'text-gray-400';
  };

  const renderPlatformStats = () => {
    if (game.platform === 'xbox' && game.maxGamerscore !== undefined && game.maxGamerscore > 0) {
      return (
        <span className="flex flex-col items-start gap-1 text-gray-400 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2 sm:gap-y-1">
          <span>{game.achievementsUnlocked} / {game.achievementsTotal}</span>
          <span className="hidden text-gray-600 sm:inline">•</span>
          <span>
            {(game.currentGamerscore ?? 0).toLocaleString()}&thinsp;/&thinsp;{game.maxGamerscore.toLocaleString()} G
          </span>
        </span>
      );
    }
    if (game.platform === 'playstation' && hasTrophyCounts) {
      return (
        <span className="flex flex-col items-start gap-1 text-gray-400 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2 sm:gap-y-1">
          <span>{game.achievementsUnlocked} / {game.achievementsTotal}</span>
          <span className="hidden text-gray-600 sm:inline">•</span>
          <TrophyCounts
            platinum={game.trophyPlatinum}
            gold={game.trophyGold}
            silver={game.trophySilver}
            bronze={game.trophyBronze}
            showPlatinum={game.hasPlatinum === true}
            className="text-gray-400 text-sm"
          />
        </span>
      );
    }
    return (
      <span className="text-gray-400 text-sm">
        {game.achievementsUnlocked} / {game.achievementsTotal}
      </span>
    );
  };

  return (
    <div
      onClick={handleClick}
      className="group flex items-center gap-x-4 p-3 bg-gray-800 rounded-lg cursor-pointer transition-all duration-200 hover:bg-gray-700 hover:shadow-md"
    >
      {/* Icon */}
      <div className="w-16 h-16 flex-shrink-0 rounded-md overflow-hidden bg-gray-900">
        {game.iconImagePath ? (
          <img
            src={getImageUrl(game.iconImagePath)}
            alt={displayTitle}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => handleImageError(e, displayTitle)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-500 text-xl font-bold">
            {displayTitle.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Title & Stats */}
      <div className="flex-1 min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="min-w-0 truncate font-medium text-sm sm:text-base">{displayTitle}</h3>
        </div>
        <div className="flex min-w-0 items-center gap-3 mt-1">
          {renderPlatformStats()}
        </div>
      </div>

      {/* Completion */}
      <div className="flex flex-shrink-0 items-center justify-end gap-3">
        {onHide && (
          <button
            onClick={(e) => { e.stopPropagation(); onHide(); }}
            className="hidden md:inline-flex text-gray-500 hover:text-white p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
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
        {onEdit && (
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="hidden md:inline-flex text-gray-500 hover:text-white p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="Edit game"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        )}
        <div className="w-24 h-2 bg-gray-700 rounded-full overflow-hidden hidden sm:block">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${game.completionPercent}%`,
              backgroundColor: game.completionPercent === 100 ? '#22c55e' : '#6366f1',
            }}
          />
        </div>
        <span className={`font-semibold text-sm ${getCompletionColor(game.completionPercent)}`}>
          {game.completionPercent}%
        </span>
        {onActions && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onActions(); }}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-700 hover:text-white active:bg-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 md:hidden"
            aria-label={`Game options for ${displayTitle}`}
            aria-haspopup="dialog"
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
