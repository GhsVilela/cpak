/**
 * Restore Upload Progress Modal
 * Shows upload progress when uploading a backup file to the server
 */

'use client';

import { useState, useEffect } from 'react';
import ProgressIndicator from './ProgressIndicator';
import { ProgressPayload, CompletePayload } from '@/services/sseClient';

interface RestoreProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProgress?: ProgressPayload;
}

export default function RestoreProgressModal({
  isOpen,
  onClose,
  currentProgress,
}: RestoreProgressModalProps) {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);

  // Track elapsed time - don't reset on complete
  useEffect(() => {
    if (!isOpen) {
      setElapsedTime(0);
      setStartTime(null);
      return;
    }

    if (!startTime) {
      setStartTime(Date.now());
    }

    const interval = setInterval(() => {
      if (startTime) {
        setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, startTime]);

  if (!isOpen) return null;

  const progress = currentProgress?.progress || { current: 0, total: 0, percentage: 0 };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  // Format time
  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-lg shadow-2xl max-w-lg w-full">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">Upload Backup</h2>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Status Icon */}
          <div className="flex flex-col items-center text-center space-y-3">
            <svg className="w-16 h-16 text-orange-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <div className="text-lg text-white font-medium">
              Uploading backup file...
            </div>
            {currentProgress?.currentStep && (
              <div className="text-sm text-gray-400">{currentProgress.currentStep}</div>
            )}
          </div>

          {/* Progress Bar */}
          <ProgressIndicator
            current={progress.current}
            total={progress.total}
            percentage={progress.percentage}
            status="uploading"
            label="Uploaded"
            showNumbers={false}
          />

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4">
            {/* File Size */}
            {progress.total > 0 && (
              <div className="bg-gray-700/50 rounded-lg p-4">
                <div className="text-gray-400 text-sm mb-1">File Size</div>
                <div className="text-xl font-bold text-white">
                  {formatFileSize(progress.total)}
                </div>
              </div>
            )}

            {/* Uploaded */}
            {progress.current > 0 && (
              <div className="bg-gray-700/50 rounded-lg p-4">
                <div className="text-gray-400 text-sm mb-1">Uploaded</div>
                <div className="text-xl font-bold text-white">
                  {formatFileSize(progress.current)}
                </div>
              </div>
            )}

            {/* Elapsed Time */}
            <div className="bg-gray-700/50 rounded-lg p-4">
              <div className="text-gray-400 text-sm mb-1">Elapsed Time</div>
              <div className="text-xl font-bold text-white font-mono">
                {formatTime(elapsedTime)}
              </div>
            </div>

            {/* Speed */}
            {elapsedTime > 0 && progress.current > 0 && (
              <div className="bg-gray-700/50 rounded-lg p-4">
                <div className="text-gray-400 text-sm mb-1">Speed</div>
                <div className="text-xl font-bold text-white">
                  {formatFileSize(progress.current / elapsedTime)}/s
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
