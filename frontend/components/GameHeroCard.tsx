'use client';

import { useRouter } from 'next/navigation';
import { getImageUrl, handleImageError } from '../services/imageUrl';
import TrophyCounts from './TrophyCounts';

interface GameHeroCardProps {
  game: {
    _id: string;
    gameId: string;
    title: string;
    customTitle?: string;
    platform: 'steam' | 'xbox' | 'playstation';
    achievementsTotal: number;
    achievementsUnlocked: number;
    completionPercent: number;
    heroImagePath?: string;
    profileId: string;
    currentGamerscore?: number;
    maxGamerscore?: number;
    trophyBronze?: number;
    trophySilver?: number;
    trophyGold?: number;
    trophyPlatinum?: number;
    isHidden?: boolean;
  };
  onEdit?: () => void;
  onHide?: () => void;
}

export default function GameHeroCard({ game, onEdit, onHide }: GameHeroCardProps) {
  const router = useRouter();
  const displayTitle = game.customTitle || game.title;

  const handleClick = () => {
    router.push(`/${game.platform}/game/${game.gameId}?profileId=${game.profileId}`);
  };

  const getCompletionColor = (percent: number) => {
    if (percent === 100) return 'bg-green-500';
    if (percent >= 75) return 'bg-blue-500';
    if (percent >= 50) return 'bg-yellow-500';
    return 'bg-indigo-500';
  };

  const getPlatformAccent = (platform: string) => {
    switch (platform) {
      case 'steam': return 'var(--steam-accent)';
      case 'xbox': return 'var(--xbox-accent)';
      case 'playstation': return 'var(--playstation-accent)';
      default: return '#6366f1';
    }
  };

  const renderProgressLabel = () => {
    if (game.platform === 'xbox' && game.maxGamerscore !== undefined && game.maxGamerscore > 0) {
      return (
        <span className="inline-flex items-center gap-2">
          <span>{game.achievementsUnlocked} / {game.achievementsTotal}</span>
          <span className="text-gray-400">•</span>
          <span>
            {(game.currentGamerscore ?? 0).toLocaleString()}&thinsp;/&thinsp;{game.maxGamerscore.toLocaleString()} G
          </span>
        </span>
      );
    }

    const hasTrophyCounts =
      game.trophyPlatinum != null ||
      game.trophyGold != null ||
      game.trophySilver != null ||
      game.trophyBronze != null;

    if (game.platform === 'playstation' && hasTrophyCounts) {
      return (
        <span className="inline-flex flex-wrap items-center gap-2">
          <span>{game.achievementsUnlocked} / {game.achievementsTotal}</span>
          <span className="text-gray-400">•</span>
          <TrophyCounts
            platinum={game.trophyPlatinum}
            gold={game.trophyGold}
            silver={game.trophySilver}
            bronze={game.trophyBronze}
            size={14}
            className="text-sm text-gray-200"
          />
        </span>
      );
    }

    return <>{game.achievementsUnlocked} / {game.achievementsTotal}</>;
  };

  return (
    <div
      onClick={handleClick}
      className="group relative rounded-lg overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-xl hover:scale-[1.01]"
    >
      {/* Hero Banner */}
      <div className="relative aspect-[16/5] bg-gray-900">
        {game.heroImagePath ? (
          <img
            src={getImageUrl(game.heroImagePath)}
            alt={displayTitle}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            onError={(e) => handleImageError(e, displayTitle)}
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{
              background: `linear-gradient(135deg, ${getPlatformAccent(game.platform)}33 0%, #1f2937 100%)`,
            }}
          >
            <span className="text-4xl sm:text-6xl font-bold text-gray-600">
              {displayTitle.charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        {/* Gradient overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/10" />

        {/* Title & Info overlay */}
        <div className="absolute bottom-0 left-0 right-0 flex flex-col items-start gap-2 px-4 py-3 sm:px-6" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>
          <div className="relative w-fit max-w-full">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 backdrop-blur-[2px]"
              style={{
                WebkitMaskImage: 'radial-gradient(ellipse at center, black 50%, transparent 90%)',
                maskImage: 'radial-gradient(ellipse at center, black 50%, transparent 90%)',
              }}
            />
            <h3 className="relative font-bold text-lg sm:text-xl text-white line-clamp-1 drop-shadow-lg">
              {displayTitle}
            </h3>
          </div>
          <div className="relative w-fit max-w-full">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 backdrop-blur-[2px]"
              style={{
                WebkitMaskImage: 'radial-gradient(ellipse at center, black 50%, transparent 90%)',
                maskImage: 'radial-gradient(ellipse at center, black 50%, transparent 90%)',
              }}
            />
            <div className="relative flex flex-wrap items-center gap-x-4 gap-y-1">
              {/* Completion badge */}
              <span
                className={`${getCompletionColor(game.completionPercent)} px-2 py-0.5 rounded-full text-xs font-semibold text-white shadow-md`}
              >
                {game.completionPercent}%
              </span>
              <span className="text-gray-200 text-sm font-medium drop-shadow">
                {renderProgressLabel()}
              </span>
            </div>
          </div>
        </div>
        {/* Edit Button */}
        {onEdit && (
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="absolute top-3 left-3 bg-gray-900/80 text-gray-300 hover:text-white p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
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
            className="absolute top-3 left-12 bg-gray-900/80 text-gray-300 hover:text-white p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
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
    </div>
  );
}
