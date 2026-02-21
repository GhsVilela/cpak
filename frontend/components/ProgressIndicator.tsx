/**
 * T054: Generic Progress Indicator Component
 * Displays progress bar, percentage, and status text
 */

'use client';

/**
 * Progress payload interface for tracking operation progress
 * Shared across backup, restore, and sync operations
 */
export interface ProgressPayload {
  progress: {
    current: number;
    total: number;
    percentage: number;
  };
  currentStep?: string;
  details?: Record<string, any>;
  status?: string;
  estimatedTimeRemaining?: number;
}

interface ProgressIndicatorProps {
  current: number;
  total: number;
  percentage: number;
  status: string;
  label?: string;
  showNumbers?: boolean;
  className?: string;
}

export default function ProgressIndicator({
  current,
  total,
  percentage,
  status,
  label,
  showNumbers = true,
  className = '',
}: ProgressIndicatorProps) {
  // Ensure percentage is within 0-100
  const normalizedPercentage = Math.min(Math.max(percentage, 0), 100);

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Label and status */}
      <div className="flex justify-between items-center text-sm">
        <span className="text-gray-300 font-medium">{label || status}</span>
        {showNumbers && (
          <span className="text-gray-400">
            {current.toLocaleString()} / {total.toLocaleString()}
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="relative w-full h-2 bg-gray-700 rounded-full overflow-hidden">
        <div
          className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300 ease-out rounded-full"
          style={{ width: `${normalizedPercentage}%` }}
        >
          {/* Animated shimmer effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
        </div>
      </div>

      {/* Percentage */}
      <div className="text-right text-sm text-gray-400">
        {normalizedPercentage.toFixed(1)}%
      </div>
    </div>
  );
}
