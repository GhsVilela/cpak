'use client';

import { useId } from 'react';

interface SteamCompletionIconProps {
  size?: number;
  className?: string;
  muted?: boolean;
  title?: string;
}

// Steam's piston-and-ring mark. Rendered as a filled silhouette by the path
// below, so the negative space forms the ring, rod and piston head.
const STEAM_MARK =
  'M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 ' +
  '1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 ' +
  '4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 ' +
  '4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 ' +
  '3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 ' +
  '15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 ' +
  '0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 ' +
  '2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 ' +
  '1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 ' +
  '0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 ' +
  '3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 ' +
  '1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 ' +
  '2.265-1.253 0-2.265-1.014-2.265-2.265z';

/**
 * Steam-styled completion icon. The blue gradient follows Steam's palette for
 * completed base games; `muted` renders the same mark in grayscale for base
 * games that are not complete yet.
 */
export default function SteamCompletionIcon({
  size = 16,
  className = '',
  muted = false,
  title,
}: SteamCompletionIconProps) {
  const rawId = useId();
  const gradientId = `steam-complete-${rawId.replace(/:/g, '')}`;
  const accessibleTitle =
    title ?? (muted ? 'Base game not completed' : 'Completed game');
  const stops = muted
    ? ['#e5e7eb', '#9ca3af', '#4b5563']
    : ['#a4e4ff', '#66c0f4', '#1b5f8c'];
  const glowColor = muted ? '#9ca3af' : '#66c0f4';

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
      data-steam-complete="true"
      data-steam-complete-muted={muted ? 'true' : undefined}
    >
      <title>{accessibleTitle}</title>
      <defs>
        <linearGradient
          id={gradientId}
          x1="4"
          y1="2"
          x2="20"
          y2="22"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor={stops[0]} />
          <stop offset="0.5" stopColor={stops[1]} />
          <stop offset="1" stopColor={stops[2]} />
        </linearGradient>
      </defs>

      {/* Soft glow to match the other platform icons on dark surfaces */}
      <circle cx="12" cy="12" r="11" fill={glowColor} opacity="0.16" />
      <path d={STEAM_MARK} fill={`url(#${gradientId})`} />
    </svg>
  );
}
