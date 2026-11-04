'use client';

import { useId } from 'react';

interface MythicIconProps {
  size?: number;
  className?: string;
  muted?: boolean;
  title?: string;
}

/**
 * Xbox Mythic achievement badge: a laurel-framed star. Used alongside the
 * Gamerscore stats and on the Base Game achievement group.
 */
export default function MythicIcon({
  size = 16,
  className = '',
  muted = false,
  title,
}: MythicIconProps) {
  const rawId = useId();
  const gradientId = `mythic-gradient-${rawId.replace(/:/g, '')}`;
  const accessibleTitle = title ?? (muted ? 'Mythic achievement locked' : 'Mythic achievement');
  const accent = '#7fba00';
  // Locked Mythic badges are drawn as a green outline; earned badges use a
  // filled green gradient.
  const fill = muted ? 'none' : `url(#${gradientId})`;
  const edge = accent;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={accessibleTitle}
    >
      <title>{accessibleTitle}</title>
      <defs>
        <linearGradient id={gradientId} x1="4" y1="3" x2="20" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={accent} />
          <stop offset="1" stopColor={accent} />
        </linearGradient>
      </defs>

      {/* Star */}
      <path
        d="M12 2.8l2.8 5.7 6.3.9-4.55 4.44 1.07 6.27L12 17.15l-5.62 2.96 1.07-6.27L2.9 9.4l6.3-.9L12 2.8Z"
        fill={fill}
        stroke={edge}
        strokeWidth={muted ? 1.2 : 0.7}
        strokeLinejoin="round"
      />

      {/* Laurel leaves */}
      <path
        d="M3.9 11.5c-1.6 1.3-2.1 3.4-1.3 5.6M20.1 11.5c1.6 1.3 2.1 3.4 1.3 5.6"
        stroke={muted ? edge : `url(#${gradientId})`}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M4.2 14.3c-1.4.1-2.4.9-3 2.2M19.8 14.3c1.4.1 2.4.9 3 2.2"
        stroke={muted ? edge : `url(#${gradientId})`}
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}
