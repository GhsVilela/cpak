'use client';

import { useState } from 'react';
import GameSearchInput from './GameSearchInput';
import ViewModeSelector, { ViewMode } from './ViewModeSelector';

interface GameToolbarProps {
  accent?: string;
  onSearch: (query: string) => void;
  searchPlaceholder?: string;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onlyCompleted: boolean;
  onOnlyCompletedChange: (value: boolean) => void;
  showHidden: boolean;
  onShowHiddenChange: (value: boolean) => void;
  showHiddenTitle?: string;
  generationOptions?: { value: string; label: string }[];
  generationFilter: string;
  onGenerationFilterChange: (value: string) => void;
  sortByOptions: { value: string; label: string }[];
  sortBy: string;
  onSortByChange: (value: string) => void;
  sortOrder: 'asc' | 'desc';
  onSortOrderChange: (value: 'asc' | 'desc') => void;
}

export default function GameToolbar({
  accent = '#6366f1',
  onSearch,
  searchPlaceholder,
  viewMode,
  onViewModeChange,
  onlyCompleted,
  onOnlyCompletedChange,
  showHidden,
  onShowHiddenChange,
  showHiddenTitle = 'Show games you have manually hidden.',
  generationOptions,
  generationFilter,
  onGenerationFilterChange,
  sortByOptions,
  sortBy,
  onSortByChange,
  sortOrder,
  onSortOrderChange,
}: GameToolbarProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);

  const activeFilterCount =
    (onlyCompleted ? 1 : 0) +
    (showHidden ? 1 : 0) +
    (generationFilter ? 1 : 0) +
    (sortBy !== 'completionPercent' ? 1 : 0) +
    (sortOrder !== 'desc' ? 1 : 0);

  const toggleClass = (on: boolean) =>
    `relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
      on ? '' : 'bg-gray-600'
    }`;

  return (
    <div className="sticky top-0 z-20 -mx-4 mb-3 px-4 pt-2 pb-3 bg-[#0a0a0a]/95 backdrop-blur-md md:static md:z-auto md:mx-0 md:mb-0 md:px-0 md:pt-0 md:pb-0 md:bg-transparent md:backdrop-blur-none">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:flex-wrap md:gap-4">
        {/* Search row: filter icon (mobile) + search input */}
        <div className="flex items-center gap-2 w-full md:w-auto md:flex-none">
          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            aria-label="Toggle filters"
            title={filtersOpen ? 'Hide filters' : 'Show filters'}
            className="md:hidden relative inline-flex items-center justify-center w-10 h-10 flex-shrink-0 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 transition hover:bg-gray-700"
          >
            <svg
              className="w-5 h-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
              />
            </svg>
            {activeFilterCount > 0 && (
              <span
                className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full text-[10px] font-bold text-white"
                style={{ backgroundColor: accent }}
              >
                {activeFilterCount}
              </span>
            )}
          </button>
          <div className="flex-1 md:flex-none min-w-0">
            <GameSearchInput onSearch={onSearch} placeholder={searchPlaceholder} />
          </div>
        </div>

        <ViewModeSelector viewMode={viewMode} onViewModeChange={onViewModeChange} />

        <div className={`${filtersOpen ? 'block' : 'hidden'} md:block w-full md:w-auto`}>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:flex-wrap md:gap-4 border-t md:border-t-0 pt-3 md:pt-0">
            {/* 100% Only toggle */}
            <div className="flex items-center gap-3">
              <button
                role="switch"
                aria-checked={onlyCompleted}
                onClick={() => onOnlyCompletedChange(!onlyCompleted)}
                className={toggleClass(onlyCompleted)}
                style={onlyCompleted ? { backgroundColor: accent } : undefined}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    onlyCompleted ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className="text-sm">100% Only</span>
            </div>

            {/* Show Hidden toggle */}
            <div className="flex items-center gap-3">
              <button
                role="switch"
                aria-checked={showHidden}
                onClick={() => onShowHiddenChange(!showHidden)}
                className={toggleClass(showHidden)}
                style={showHidden ? { backgroundColor: accent } : undefined}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    showHidden ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span
                className="text-sm cursor-default"
                title={showHiddenTitle}
              >
                Show Hidden
              </span>
            </div>

            {/* Generation/platform filter */}
            {generationOptions && (
              <div className="flex flex-col gap-1.5 md:flex-row md:items-center md:gap-2">
                <label className="text-sm text-gray-400">Platform:</label>
                <select
                  value={generationFilter}
                  onChange={(e) => onGenerationFilterChange(e.target.value)}
                  className="w-full md:w-auto px-3 py-2 md:py-1 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:ring-1 focus:ring-gray-500"
                >
                  {generationOptions.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Sort */}
            <div className="flex flex-col gap-1.5 md:flex-row md:items-center md:gap-2">
              <label className="text-sm text-gray-400">Sort:</label>
              <select
                value={sortBy}
                onChange={(e) => onSortByChange(e.target.value)}
                className="w-full md:w-auto px-3 py-2 md:py-1 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:ring-1 focus:ring-gray-500"
              >
                {sortByOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <select
                value={sortOrder}
                onChange={(e) => onSortOrderChange(e.target.value as 'asc' | 'desc')}
                className="w-full md:w-auto px-3 py-2 md:py-1 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:ring-1 focus:ring-gray-500"
              >
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}