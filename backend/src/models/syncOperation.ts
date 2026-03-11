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
