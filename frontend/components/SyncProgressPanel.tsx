/**
 * T055-T058: Sync Progress Panel
 * Displays overall sync progress with detailed metrics:
 * - Games/achievements/icons counters (T055)
 * - Adaptive parameters display (T056)
 * - Estimated time remaining (T057)
 * - Per-game status list (T058)
 */

'use client';

import { useState, useEffect } from 'react';
import ProgressIndicator from './ProgressIndicator';
import { ProgressPayload, CompletePayload, ErrorPayload } from '@/services/sseClient';

interface GameStatus {
  gameId: string;
  gameName: string;
  status: 'pending' | 'syncing' | 'completed' | 'failed';
  achievementCount?: number;
  error?: string;
}

interface SyncProgressPanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentProgress?: ProgressPayload;
  gameStatuses?: GameStatus[];
}

export default function SyncProgressPanel({
  isOpen,
  onClose,
  currentProgress,
  gameStatuses = [],
}: SyncProgressPanelProps) {
  const [elapsedTime, setElapsedTime] = useState(0);

  // Track elapsed time
  useEffect(() => {
    if (!isOpen) {
      setElapsedTime(0);
      return;
    }

    const startTime = Date.now();
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  const progress = currentProgress?.progress || { current: 0, total: 0, percentage: 0 };
  const details = currentProgress?.details || {};
  const estimatedTimeRemaining = currentProgress?.estimatedTimeRemaining;

  // Format time as human-readable (T057)
  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}m ${secs}s`;
    }
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  // Format file size as human-readable
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-lg shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center">
          <h2 className="text-xl font-bold text-white">Sync In Progress</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Overall Progress (T055) */}
          <div className="space-y-4">
            <ProgressIndicator
              current={progress.current}
              total={progress.total}
              percentage={progress.percentage}
              status={currentProgress?.status || 'syncing'}
              label="Overall Progress"
            />

            {/* Status and current step */}
            {currentProgress?.currentStep && (
              <div className="text-sm text-gray-400 italic">
                {currentProgress.currentStep}
              </div>
            )}
          </div>

          {/* Counters Grid (T055) */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-gray-700/50 rounded-lg p-4">
              <div className="text-gray-400 text-sm mb-1">Games</div>
              <div className="text-2xl font-bold text-white">
                {details.gamesProcessed?.toLocaleString() || 0}
              </div>
            </div>
            <div className="bg-gray-700/50 rounded-lg p-4">
              <div className="text-gray-400 text-sm mb-1">Achievements</div>
              <div className="text-2xl font-bold text-white">
                {details.achievementsProcessed?.toLocaleString() || 0}
              </div>
            </div>
            <div className="bg-gray-700/50 rounded-lg p-4">
              <div className="text-gray-400 text-sm mb-1">Icons</div>
              <div className="text-2xl font-bold text-white">
                {details.iconsDownloaded?.toLocaleString() || 0}
              </div>
            </div>
          </div>

          {/* Adaptive Parameters Display (T056) */}
          {(details.currentBatchSize || details.currentConcurrency) && (
            <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4">
              <div className="text-blue-300 text-sm font-medium mb-2">
                Adaptive Performance Settings
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {details.currentBatchSize && (
                  <div>
                    <span className="text-gray-400">Batch Size:</span>
                    <span className="text-white ml-2 font-mono">{details.currentBatchSize}</span>
                  </div>
                )}
                {details.currentConcurrency && (
                  <div>
                    <span className="text-gray-400">Concurrency:</span>
                    <span className="text-white ml-2 font-mono">{details.currentConcurrency}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Time Information (T057) */}
          <div className="flex justify-between text-sm">
            <div>
              <span className="text-gray-400">Elapsed Time:</span>
              <span className="text-white ml-2 font-mono">{formatTime(elapsedTime)}</span>
            </div>
            {estimatedTimeRemaining !== undefined && estimatedTimeRemaining > 0 && (
              <div>
                <span className="text-gray-400">Est. Remaining:</span>
                <span className="text-white ml-2 font-mono">{formatTime(Math.floor(estimatedTimeRemaining / 1000))}</span>
              </div>
            )}
          </div>

          {/* Per-Game Status List (T058) */}
          {gameStatuses.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-300">Game Status</h3>
              <div className="bg-gray-700/30 rounded-lg max-h-64 overflow-y-auto">
                {gameStatuses.map((game) => (
                  <div
                    key={game.gameId}
                    className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50 last:border-b-0"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {/* Status icon */}
                      {game.status === 'completed' && (
                        <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      {game.status === 'syncing' && (
                        <svg className="w-5 h-5 text-blue-500 flex-shrink-0 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      )}
                      {game.status === 'failed' && (
                        <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                      {game.status === 'pending' && (
                        <svg className="w-5 h-5 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}

                      {/* Game name */}
                      <span className="text-white truncate">{game.gameName}</span>
                    </div>

                    {/* Achievement count */}
                    {game.achievementCount !== undefined && (
                      <span className="text-gray-400 text-sm ml-2 flex-shrink-0">
                        {game.achievementCount} achievements
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700 bg-gray-800/50">
          <div className="text-sm text-gray-400 text-center">
            Do not close this window during sync
          </div>
        </div>
      </div>
    </div>
  );
}
