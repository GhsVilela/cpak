'use client';

import { useId } from 'react';

interface MythicIconProps {
  size?: number;
  className?: string;
  muted?: boolean;
  title?: string;
}

// Xbox sphere mark: the four negative-space lobes around the X. Combined with
// the circular mask below, it produces the classic green sphere with white X.
const XBOX_MARK =
  'M4.102 21.033C6.211 22.881 8.977 24 12 24c3.026 0 5.789-1.119 ' +
  '7.902-2.967 1.877-1.912-4.316-8.709-7.902-11.417-3.582 ' +
  '2.708-9.779 9.505-7.898 11.417zm11.16-14.406c2.5 2.961 7.484 10.313 ' +
  '6.076 12.912C23.002 17.48 24 14.861 24 12.004c0-3.34-1.365-6.362-3.57-8.536 ' +
  '0 0-.027-.022-.082-.042-.063-.022-.152-.045-.281-.045-.592 ' +
  '0-1.985.434-4.805 3.246zM3.654 3.426c-.057.02-.082.041-.086.042C1.365 ' +
  '5.642 0 8.664 0 12.004c0 2.854.998 5.473 2.661 7.533-1.401-2.605 ' +
  '3.579-9.951 6.08-12.91-2.82-2.813-4.216-3.245-4.806-3.245-.131 ' +
  '0-.223.021-.281.046v-.002zM12 3.551S9.055 1.828 6.755 ' +
  '1.746c-.903-.033-1.454.295-1.521.339C7.379.646 9.659 0 11.984 0H12c2.334 ' +
  '0 4.605.646 6.766 2.085-.068-.046-.615-.372-1.52-.339C14.946 1.828 12 ' +
  '3.545 12 3.545v.006z';

/**
 * Xbox Mythic achievement icon: the circular Xbox sphere logo.
 * Earned badges use the Xbox green gradient with a white X; locked badges are
 * the same logo in grayscale.
 */
export default function MythicIcon({
  size = 16,
  className = '',
  muted = false,
  title,
}: MythicIconProps) {
  const rawId = useId();
  const baseId = rawId.replace(/:/g, '');
  const sphereId = `mythic-sphere-${baseId}`;
  const xMaskId = `mythic-x-mask-${baseId}`;
  const accessibleTitle = title ?? (muted ? 'Mythic achievement locked' : 'Mythic achievement');

  const stops = muted
    ? ['#e5e7eb', '#9ca3af', '#4b5563']
    : ['#b9f24a', '#6dbb2f', '#2f6b00'];
  const emblemStroke = muted ? '#6b7280' : '#2f5300';
  const xFill = muted ? '#f3f4f6' : '#ffffff';

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
        <radialGradient id={sphereId} cx="35%" cy="26%" r="82%">
          <stop offset="0" stopColor={stops[0]} />
          <stop offset="0.55" stopColor={stops[1]} />
          <stop offset="1" stopColor={stops[2]} />
        </radialGradient>
        <mask
          id={xMaskId}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="24"
          height="24"
        >
          <circle cx="12" cy="12" r="11.7" fill="#ffffff" />
          <path d={XBOX_MARK} fill="#000000" />
        </mask>
      </defs>

      {/* Xbox sphere */}
      <circle
        data-mythic-emblem="true"
        cx="12"
        cy="12"
        r="11.7"
        fill={`url(#${sphereId})`}
        stroke={emblemStroke}
        strokeWidth="0.8"
      />

      {/* White X, cut from the sphere mark */}
      <circle
        data-mythic-x="true"
        cx="12"
        cy="12"
        r="11.7"
        fill={xFill}
        mask={`url(#${xMaskId})`}
      />
    </svg>
  );
}
