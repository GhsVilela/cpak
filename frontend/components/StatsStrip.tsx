'use client';

import type { ReactNode } from 'react';

interface StatTileProps {
  label: string;
  value?: ReactNode;
  dotColor?: string;
  icon?: ReactNode;
  title?: string;
  spanFull?: boolean;
  valueClassName?: string;
  bold?: boolean;
}

export function StatTile({
  label,
  value,
  dotColor,
  icon,
  title,
  spanFull = false,
  valueClassName = '',
  bold = true,
}: StatTileProps) {
  return (
    <div
      title={title}
      className={`flex flex-col justify-center gap-0.5 bg-gray-800/60 rounded-lg px-3 py-2 md:flex-row md:items-center md:gap-0 md:bg-transparent md:rounded-none md:px-5 md:py-0 ${
        spanFull ? 'col-span-2' : ''
      }`}
    >
      <span className="inline-flex items-center gap-1.5 text-xs text-gray-400 md:text-sm">
        {icon ? (
          <span className="inline-flex shrink-0 items-center justify-center">{icon}</span>
        ) : dotColor ? (
          <span className="shrink-0 leading-none" style={{ color: dotColor }}>
            ●
          </span>
        ) : null}
        <span>{label}</span>
        <span className="hidden md:inline">:</span>
      </span>
      {value !== undefined && (
        <span
          className={`text-sm md:inline md:ml-1 ${bold ? 'font-bold' : ''} ${valueClassName}`}
        >
          {value}
        </span>
      )}
    </div>
  );
}

export function StatsStrip({
  children,
  className = '',
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`grid grid-cols-2 gap-2 md:flex md:items-center md:gap-0 md:divide-x md:divide-gray-600 ${className}`}
    >
      {children}
    </div>
  );
}