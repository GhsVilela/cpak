import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Game Sync Status
 */
export type GameSyncStatusType = 'pending' | 'syncing' | 'completed' | 'failed';

/**
 * Game Sync Status Document
 * 
 * Tracks sync status for an individual game within a sync operation.
 * Provides granular progress for UI display.
 */
export interface IGameSyncStatus extends Document {
  _id: Types.ObjectId;
  syncOperationId: Types.ObjectId;
  profileId: Types.ObjectId;
  gameId: string;
  gameName: string;
  status: GameSyncStatusType;
  totalAchievements: number;
  achievementsSynced: number;
  iconsDownloaded: number;
  iconsFailed: number;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const gameSyncStatusSchema = new Schema<IGameSyncStatus>(
  {
    syncOperationId: {
      type: Schema.Types.ObjectId,
      ref: 'SyncOperation',
      required: true,
      index: true,
    },
    profileId: {
      type: Schema.Types.ObjectId,
      ref: 'Profile',
      required: true,
      index: true,
    },
    gameId: {
      type: String,
      required: true,
    },
    gameName: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'syncing', 'completed', 'failed'],
      required: true,
      default: 'pending',
      index: true,
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
    iconsDownloaded: {
      type: Number,
      required: true,
      default: 0,
    },
    iconsFailed: {
      type: Number,
      required: true,
      default: 0,
    },
    startedAt: {
      type: Date,
    },
    completedAt: {
      type: Date,
    },
    error: {
      type: String,
    },
  },
  {
    timestamps: true,
    collection: 'game_sync_statuses',
  }
);

// Compound index for querying games by sync operation
gameSyncStatusSchema.index({ syncOperationId: 1, status: 1 });

// Compound index for finding game status for specific profile
gameSyncStatusSchema.index({ profileId: 1, gameId: 1 });

export const GameSyncStatus = mongoose.model<IGameSyncStatus>('GameSyncStatus', gameSyncStatusSchema);
