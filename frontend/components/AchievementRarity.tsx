interface AchievementRarityProps {
  globalPercent?: number | null;
  rarityCategory?: string | null;
  muted?: boolean;
  platform?: 'steam' | 'xbox' | 'playstation';
}

function getPlayStationRarityClass(rarity?: string): string | undefined {
  switch (rarity?.toLowerCase()) {
    case 'ultra rare':
      return 'font-extrabold text-yellow-300';
    case 'very rare':
      return 'font-bold text-yellow-400';
    case 'rare':
      return 'font-semibold text-yellow-400/60';
    default:
      return undefined;
  }
}

/**
 * Shared rarity line used by Steam, Xbox, and PlayStation achievement cards.
 *
 * Shows the exact platform-provided unlock percentage and appends the
 * platform rarity label when it is not "Common".
 */
export default function AchievementRarity({
  globalPercent,
  rarityCategory,
  muted = false,
  platform,
}: AchievementRarityProps) {
  const percent = typeof globalPercent === 'number' && Number.isFinite(globalPercent)
    ? globalPercent
    : undefined;

  const normalizedCategory = rarityCategory?.trim();
  const rareCategory = normalizedCategory && !/^(common|unset)$/i.test(normalizedCategory)
    ? normalizedCategory
    : undefined;

  const rarityForStyle = rareCategory ?? (percent !== undefined && percent < 10 ? 'Rare' : undefined);
  const playStationRarityClass = platform === 'playstation'
    ? getPlayStationRarityClass(rarityForStyle)
    : undefined;
  const percentClass = playStationRarityClass
    ?? (rarityForStyle ? 'font-semibold text-amber-400' : '');

  if (percent === undefined && !rarityForStyle) return null;

  return (
    <p className={`mt-1 text-xs ${muted ? 'text-gray-600' : 'text-gray-500'}`}>
      {percent !== undefined && (
        <>
          <span className={percentClass}>
            {percent.toFixed(1)}%
          </span>{' '}
          of players unlocked this
        </>
      )}
      {rarityForStyle ? `${percent !== undefined ? ' · ' : ''}${rarityForStyle}` : ''}
    </p>
  );
}
