interface AchievementRarityProps {
  globalPercent?: number | null;
  rarityCategory?: string | null;
  muted?: boolean;
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
}: AchievementRarityProps) {
  const percent = typeof globalPercent === 'number' && Number.isFinite(globalPercent)
    ? globalPercent
    : undefined;

  const normalizedCategory = rarityCategory?.trim();
  const rareCategory = normalizedCategory && !/^(common|unset)$/i.test(normalizedCategory)
    ? normalizedCategory
    : undefined;

  const rare = rareCategory ?? (percent !== undefined && percent < 10 ? 'Rare' : undefined);

  if (percent === undefined && !rare) return null;

  return (
    <p className={`mt-1 text-xs ${muted ? 'text-gray-600' : 'text-gray-500'}`}>
      {percent !== undefined && (
        <>
          <span className={rare ? 'font-semibold text-amber-400' : ''}>
            {percent.toFixed(1)}%
          </span>{' '}
          of players unlocked this
        </>
      )}
      {rare ? `${percent !== undefined ? ' · ' : ''}${rare}` : ''}
    </p>
  );
}
