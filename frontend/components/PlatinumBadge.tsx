'use client';

import TrophyIcon from './TrophyIcon';

interface PlatinumBadgeProps {
  /** Icon size in pixels. */
  iconSize?: number;
  /** Outer circle size in pixels. Defaults to iconSize + 6. */
  size?: number;
  /** Render the badge greyed out (Platinum not yet earned). */
  muted?: boolean;
  className?: string;
}

/**
 * Platinum trophy inside a glowing circular border, matching the circular
 * Xbox and Steam platform badges used next to game titles.
 */
export default function PlatinumBadge({
  iconSize = 14,
  size = iconSize + 6,
  muted = false,
  className = '',
}: PlatinumBadgeProps) {
  const title = muted
    ? 'Complete the base game to unlock the Platinum trophy'
    : 'Platinum trophy earned';

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full border ${
        muted
          ? 'border-gray-500/60 bg-gradient-to-br from-gray-500/20 to-gray-700/40'
          : 'border-[#7cc4ff]/70 bg-gradient-to-br from-[#7cc4ff]/30 to-[#0067b8]/40 shadow-[0_0_10px_rgba(124,196,255,0.35)]'
      } ${className}`}
      style={{ width: size, height: size }}
      title={title}
    >
      <TrophyIcon grade="platinum" size={iconSize} muted={muted} title={title} />
    </span>
  );
}
