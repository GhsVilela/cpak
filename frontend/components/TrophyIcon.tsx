'use client';

import { useId } from 'react';

export type TrophyGrade = 'bronze' | 'silver' | 'gold' | 'platinum';

interface TrophyIconProps {
  grade: TrophyGrade | null | undefined;
  size?: number;
  className?: string;
  muted?: boolean;
  title?: string;
}

const GRADIENTS: Record<
  TrophyGrade,
  { from: string; to: string; edge: string; label: string }
> = {
  platinum: {
    from: '#7cc4ff',
    to: '#0067b8',
    edge: '#bfe3ff',
    label: 'Platinum',
  },
  gold: {
    from: '#ffe27a',
    to: '#b88a00',
    edge: '#fff3b8',
    label: 'Gold',
  },
  silver: {
    from: '#f2f4f7',
    to: '#8c929b',
    edge: '#ffffff',
    label: 'Silver',
  },
  bronze: {
    from: '#e0a06a',
    to: '#8a4b1f',
    edge: '#f3c9a4',
    label: 'Bronze',
  },
};

const MUTED_GRADIENT = {
  from: '#9ca3af',
  to: '#4b5563',
  edge: '#d1d5db',
};

export default function TrophyIcon({
  grade,
  size = 16,
  className = '',
  muted = false,
  title,
}: TrophyIconProps) {
  const rawId = useId();
  const gradientId = `trophy-gradient-${rawId.replace(/:/g, '')}`;

  if (!grade) return null;

  const palette = GRADIENTS[grade];
  if (!palette) return null;

  const colors = muted ? MUTED_GRADIENT : palette;
  const accessibleTitle =
    title ?? `${muted ? 'Locked' : ''} ${palette.label} trophy`.trim();

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
        <linearGradient
          id={gradientId}
          x1="5"
          y1="3"
          x2="19"
          y2="21"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor={colors.from} />
          <stop offset="1" stopColor={colors.to} />
        </linearGradient>
      </defs>

      {/* Cup body */}
      <path
        d="M6.5 3.5h11v4.25a5.5 5.5 0 0 1-11 0V3.5Z"
        fill={`url(#${gradientId})`}
        stroke={colors.edge}
        strokeWidth="0.6"
        strokeLinejoin="round"
      />

      {/* Bowl highlight */}
      <path
        d="M6.5 4.6h11"
        stroke={colors.edge}
        strokeOpacity="0.55"
        strokeWidth="0.8"
        strokeLinecap="round"
      />

      {/* Handles */}
      <path
        d="M6.5 5.3H4.7v1.35a3.8 3.8 0 0 0 3.1 3.73"
        stroke={`url(#${gradientId})`}
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M17.5 5.3h1.8v1.35a3.8 3.8 0 0 1-3.1 3.73"
        stroke={`url(#${gradientId})`}
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Stem */}
      <path
        d="M11.2 13.25h1.6v3.1h-1.6z"
        fill={`url(#${gradientId})`}
      />

      {/* Base */}
      <path
        d="M10.1 16.35h3.8l.5 1.15H9.6l.5-1.15Z"
        fill={`url(#${gradientId})`}
        stroke={colors.edge}
        strokeWidth="0.45"
        strokeLinejoin="round"
      />
      <path
        d="M8.2 19h7.6l.85 2H7.35l.85-2Z"
        fill={`url(#${gradientId})`}
        stroke={colors.edge}
        strokeWidth="0.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
