interface MythicBadgeProps {
  className?: string;
  title?: string;
}

const BADGE_CLASSES =
  'inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-300/60 ' +
  'bg-gradient-to-r from-emerald-500/30 via-emerald-400/20 to-lime-300/25 ' +
  'px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-emerald-100 ' +
  'shadow-[0_0_12px_rgba(52,211,153,0.3)]';

/**
 * Compact text badge used in the game list / hero views. The full laurel icon
 * is reserved for the achievement page, where it has enough room to read.
 */
export default function MythicBadge({
  className = '',
  title = 'Mythic achievement earned',
}: MythicBadgeProps) {
  return (
    <span
      title={title}
      aria-label={title}
      className={`${BADGE_CLASSES} ${className}`}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_6px_rgba(110,231,183,0.9)]"
      />
      Mythic
    </span>
  );
}
