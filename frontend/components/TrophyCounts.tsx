'use client';

import TrophyIcon, { type TrophyGrade } from './TrophyIcon';

interface TrophyCountsProps {
  bronze?: number | null;
  silver?: number | null;
  gold?: number | null;
  platinum?: number | null;
  /** Show the Platinum entry even when it has not been earned yet. */
  showPlatinum?: boolean;
  size?: number;
  className?: string;
}

export default function TrophyCounts({
  bronze,
  silver,
  gold,
  platinum,
  showPlatinum = false,
  size = 14,
  className = '',
}: TrophyCountsProps) {
  const counts: Record<TrophyGrade, number | null | undefined> = {
    platinum,
    gold,
    silver,
    bronze,
  };

  const hasTrophyData =
    showPlatinum || Object.values(counts).some((value) => typeof value === 'number');

  if (!hasTrophyData) return null;

  const entries: { grade: TrophyGrade; count: number }[] = [];

  // Platinum normally only appears once it has been earned. Callers can opt in
  // to showing a zeroed Platinum when the game/category defines one.
  if ((platinum ?? 0) > 0 || showPlatinum) {
    entries.push({ grade: 'platinum', count: platinum ?? 0 });
  }

  // Gold, silver and bronze always show, including zero, so the layout is stable.
  entries.push({ grade: 'gold', count: gold ?? 0 });
  entries.push({ grade: 'silver', count: silver ?? 0 });
  entries.push({ grade: 'bronze', count: bronze ?? 0 });

  return (
    <span
      className={`inline-flex items-center gap-x-2 whitespace-nowrap ${className}`}
      data-testid="trophy-counts"
    >
      {entries.map(({ grade, count }) => (
        <span
          key={grade}
          className="inline-flex items-center gap-1"
          title={`${count} ${grade} ${count === 1 ? 'trophy' : 'trophies'}`}
        >
          <TrophyIcon grade={grade} size={size} />
          <span className="tabular-nums">{count}</span>
        </span>
      ))}
    </span>
  );
}
