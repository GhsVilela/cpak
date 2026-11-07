import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Sync Operation Status
 */
export type SyncOperationStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Platform types
 */
export type Platform = 'steam' | 'xbox' | 'playstation';

/**
 * Sync progress phases.
 *
 * The phase order and weights are centralised in `syncProgress.ts`. Each phase
 * receives a fixed share of the overall 0-100% bar so progress can only move
 * forward, even when a phase finds no work to do.
 */
export type SyncPhase =
  | 'preparing'
  | 'discovering'
  | 'game-images'
  | 'achievements'
  | 'icons'
  | 'saving'
  | 'finalizing';

/**
 * Error entry within a sync operation
 */
export interface ISyncError {
  gameId: string;
  message: string;
  timestamp: Date;
}

/**
 * Current adaptive algorithm parameters
 */
export interface IAdaptiveParams {
  batchSize: number;
  concurrency: number;
  delay: number;
}

/**
 * Sync Operation Document
 * 
 * Represents a synchronization job for a profile.
 * Tracks overall progress across all games being synced.
 */
export interface ISyncOperation extends Document {
  _id: Types.ObjectId;
  profileId: Types.ObjectId;
  platform: Platform;
  status: SyncOperationStatus;
  startedAt: Date;
  completedAt?: Date;
  /** Current progress phase (planned by the sync service before work starts). */
  phase: SyncPhase;
  /** Overall progress 0-100. Monotonic for the lifetime of the operation. */
  progress: number;
  /** User-facing message for the current phase. */
  message: string;
  /** Planned number of work items in the current phase. */
  phaseTotal: number;
  /** Completed work items in the current phase. */
  phaseCompleted: number;
  totalGames: number;
  gamesProcessed: number;
  imagesCompleted: number;
  gamesFailed: number;
  totalAchievements: number;
  achievementsSynced: number;
  iconDownloadsPending: number;
  iconDownloadsCompleted: number;
  iconDownloadsFailed: number;
  syncErrors: ISyncError[];
  adaptiveParams: IAdaptiveParams;
  createdAt: Date;
  updatedAt: Date;
}

const syncOperationSchema = new Schema<ISyncOperation>(
  {
    profileId: {
      type: Schema.Types.ObjectId,
      ref: 'Profile',
      required: true,
      index: true,
    },
    platform: {
      type: String,
      enum: ['steam', 'xbox', 'playstation'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
      required: true,
      default: 'pending',
      index: true,
    },
    startedAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    completedAt: {
      type: Date,
    },
    phase: {
      type: String,
      enum: ['preparing', 'discovering', 'game-images', 'achievements', 'icons', 'saving', 'finalizing'],
      required: true,
      default: 'preparing',
    },
    progress: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 100,
    },
    message: {
      type: String,
      required: true,
      default: 'Preparing sync...',
    },
    phaseTotal: {
      type: Number,
      required: true,
      default: 0,
    },
    phaseCompleted: {
      type: Number,
      required: true,
      default: 0,
    },
    totalGames: {
      type: Number,
      required: true,
      default: 0,
    },
    gamesProcessed: {
      type: Number,
      required: true,
      default: 0,
    },
    imagesCompleted: {
      type: Number,
      required: true,
      default: 0,
    },
    gamesFailed: {
      type: Number,
      required: true,
      default: 0,
    },
    totalAchievements: {
      type: Number,
      required: true,
      default: 0,
    },
    achievementsSynced: {
      type: Number,
      required: true,
      default: 0,
    },
    iconDownloadsPending: {
      type: Number,
      required: true,
      default: 0,
    },
    iconDownloadsCompleted: {
      type: Number,
      required: true,
      default: 0,
    },
    iconDownloadsFailed: {
      type: Number,
      required: true,
      default: 0,
    },
    syncErrors: [
      {
        gameId: { type: String, required: true },
        message: { type: String, required: true },
        timestamp: { type: Date, required: true, default: Date.now },
      },
    ],
    adaptiveParams: {
      batchSize: { type: Number, required: true },
      concurrency: { type: Number, required: true },
      delay: { type: Number, required: true },
    },
  },
  {
    timestamps: true,
    collection: 'sync_operations',
  }
);

// Compound index for querying recent syncs for a profile
syncOperationSchema.index({ profileId: 1, createdAt: -1 });

// Compound index for finding running/stuck operations
syncOperationSchema.index({ status: 1, startedAt: 1 });

export const SyncOperation = mongoose.model<ISyncOperation>('SyncOperation', syncOperationSchema);
