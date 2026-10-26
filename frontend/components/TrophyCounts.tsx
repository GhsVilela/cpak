'use client';

import TrophyIcon, { type TrophyGrade } from './TrophyIcon';

interface TrophyCountsProps {
  bronze?: number | null;
  silver?: number | null;
  gold?: number | null;
  platinum?: number | null;
  size?: number;
  className?: string;
}

export default function TrophyCounts({
  bronze,
  silver,
  gold,
  platinum,
  size = 14,
  className = '',
}: TrophyCountsProps) {
  const counts: Record<TrophyGrade, number | null | undefined> = {
    platinum,
    gold,
    silver,
    bronze,
  };

  const hasTrophyData = Object.values(counts).some(
    (value) => typeof value === 'number'
  );

  if (!hasTrophyData) return null;

  const entries: { grade: TrophyGrade; count: number }[] = [];

  // Platinum only appears once it has been earned, matching the PlayStation UI.
  if ((platinum ?? 0) > 0) {
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
