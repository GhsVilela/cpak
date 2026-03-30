'use client';

import { useRouter } from 'next/navigation';

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
  };
  onEdit?: () => void;
}

export default function GameHeroCard({ game, onEdit }: GameHeroCardProps) {
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

  return (
    <div
      onClick={handleClick}
      className="group relative rounded-lg overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-xl hover:scale-[1.01]"
    >
      {/* Hero Banner */}
      <div className="relative aspect-[16/5] bg-gray-900">
        {game.heroImagePath ? (
          <img
            src={`/api/icons/${game.heroImagePath}`}
            alt={displayTitle}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
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
        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>
          <h3 className="font-bold text-lg sm:text-xl text-white line-clamp-1 mb-2 drop-shadow-lg">
            {displayTitle}
          </h3>
          <div className="flex items-center gap-4">
            {/* Completion badge */}
            <span
              className={`${getCompletionColor(game.completionPercent)} px-2 py-0.5 rounded-full text-xs font-semibold text-white shadow-md`}
            >
              {game.completionPercent}%
            </span>
            <span className="text-gray-200 text-sm font-medium drop-shadow">
              {game.achievementsUnlocked} / {game.achievementsTotal}
            </span>
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
        {/* 100% completion badge */}
        {game.completionPercent === 100 && (
          <div className="absolute top-3 right-3 bg-green-500 text-white px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
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
    </div>
  );
}
