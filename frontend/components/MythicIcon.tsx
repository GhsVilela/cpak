'use client';

import { useId } from 'react';

interface MythicIconProps {
  size?: number;
  className?: string;
  muted?: boolean;
  title?: string;
}

/**
 * Xbox Mythic achievement badge: a laurel-framed star. Earned badges use a
 * bright green gradient with a soft glow. Locked badges keep the same badge
 * in grayscale and show a padlock where the inner highlight star would be.
 */
export default function MythicIcon({
  size = 16,
  className = '',
  muted = false,
  title,
}: MythicIconProps) {
  const rawId = useId();
  const baseId = rawId.replace(/:/g, '');
  const gradientId = `mythic-gradient-${baseId}`;
  const glowId = `mythic-glow-${baseId}`;
  const accessibleTitle = title ?? (muted ? 'Mythic achievement locked' : 'Mythic achievement');
  const gradientStops = muted
    ? ['#e5e7eb', '#9ca3af', '#4b5563']
    : ['#e2ff9a', '#9bdc00', '#4e8300'];
  const wreathStroke = muted ? '#6b7280' : '#4f7d00';
  const starStroke = muted ? '#d1d5db' : '#d9ff8a';
  const glowColor = muted ? '#9ca3af' : '#b8ff4d';

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
        <linearGradient id={gradientId} x1="6" y1="2" x2="18" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={gradientStops[0]} />
          <stop offset="0.42" stopColor={gradientStops[1]} />
          <stop offset="1" stopColor={gradientStops[2]} />
        </linearGradient>
        <radialGradient id={glowId} cx="50%" cy="46%" r="54%">
          <stop offset="0" stopColor={glowColor} stopOpacity={muted ? '0.3' : '0.55'} />
          <stop offset="1" stopColor={glowColor} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Soft halo behind the badge */}
      <circle cx="12" cy="11.4" r="10.6" fill={`url(#${glowId})`} />

      {/* Laurel wreath */}
      <g
        fill={`url(#${gradientId})`}
        stroke={wreathStroke}
        strokeWidth="0.55"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <path
          d="M7.3 9.7c-2.4 1.9-3.6 4.5-3.3 8"
          fill="none"
          strokeWidth="1.7"
        />
        <path d="M6.9 10.2c-1.7-.3-3.1.4-4.1 2 1.7.7 3.2.4 4.3-.8.4-.4.3-.8-.2-1.2Z" />
        <path d="M5.9 13.2c-1.8-.4-3.3.4-4.2 2.1 1.8.7 3.4.3 4.5-1 .3-.4.2-.8-.3-1.1Z" />
        <path d="M5.1 16.3c-1.7-.5-3.2.2-4.1 1.9 1.8.8 3.4.4 4.5-.8.3-.4.2-.8-.4-1.1Z" />
        <path d="M5.5 19.2c-1.4.1-2.5.9-3.2 2.3 1.5.4 2.8 0 3.6-1.1.2-.4.1-.8-.4-1.2Z" />
      </g>
      <g
        fill={`url(#${gradientId})`}
        stroke={wreathStroke}
        strokeWidth="0.55"
        strokeLinejoin="round"
        strokeLinecap="round"
        transform="translate(24 0) scale(-1 1)"
      >
        <path
          d="M7.3 9.7c-2.4 1.9-3.6 4.5-3.3 8"
          fill="none"
          strokeWidth="1.7"
        />
        <path d="M6.9 10.2c-1.7-.3-3.1.4-4.1 2 1.7.7 3.2.4 4.3-.8.4-.4.3-.8-.2-1.2Z" />
        <path d="M5.9 13.2c-1.8-.4-3.3.4-4.2 2.1 1.8.7 3.4.3 4.5-1 .3-.4.2-.8-.3-1.1Z" />
        <path d="M5.1 16.3c-1.7-.5-3.2.2-4.1 1.9 1.8.8 3.4.4 4.5-.8.3-.4.2-.8-.4-1.1Z" />
        <path d="M5.5 19.2c-1.4.1-2.5.9-3.2 2.3 1.5.4 2.8 0 3.6-1.1.2-.4.1-.8-.4-1.2Z" />
      </g>

      {/* Central star */}
      <path
        d="M12 3.1l2.37 4.8 5.3.77-3.84 3.74.91 5.28L12 15.2l-4.74 2.49.91-5.28-3.84-3.74 5.3-.77L12 3.1Z"
        fill={`url(#${gradientId})`}
        stroke={starStroke}
        strokeWidth="1"
        strokeLinejoin="round"
      />

      {muted ? (
        /* Locked badges show a padlock where the inner highlight star sits. */
        <g data-mythic-lock="true">
          <path
            d="M10.6 10.2V9.1a1.4 1.4 0 0 1 2.8 0v1.1"
            fill="none"
            stroke="#374151"
            strokeWidth="1.05"
            strokeLinecap="round"
          />
          <rect
            x="9.7"
            y="10.1"
            width="4.6"
            height="3.7"
            rx="1"
            fill="#e5e7eb"
            stroke="#374151"
            strokeWidth="0.5"
          />
          <circle cx="12" cy="11.65" r="0.55" fill="#374151" />
          <path d="M12 11.95v0.9" stroke="#374151" strokeWidth="0.55" strokeLinecap="round" />
        </g>
      ) : (
        <>
          {/* Inner highlight and sparkles make the earned badge pop at small sizes */}
          <path
            d="M12 6.1l1.14 2.3 2.54.37-1.84 1.79.44 2.53L12 11.9l-2.28 1.19.44-2.53-1.84-1.79 2.54-.37L12 6.1Z"
            fill="#f3ffd8"
            opacity="0.85"
          />
          <path d="M19.1 3.8l.42.88.88.42-.88.42-.42.88-.42-.88-.88-.42.88-.42.42-.88Z" fill="#f6ffd9" />
          <circle cx="5.2" cy="5.6" r="0.55" fill="#eaffb0" />
        </>
      )}
    </svg>
  );
}
