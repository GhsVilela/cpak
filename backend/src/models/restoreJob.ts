import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Restore Job Status
 */
export type RestoreJobStatus = 'uploading' | 'extracting' | 'validating' | 'restoring' | 'completed' | 'failed';

/**
 * Restore Mode
 */
export type RestoreMode = 'merge' | 'replace';

/**
 * Warning entry within a restore job
 */
export interface IRestoreWarning {
  message: string;
  timestamp: Date;
}

/**
 * Restore Job Document
 * 
 * Represents a backup restore operation.
 * Tracks upload, extraction, and database restoration progress.
 */
export interface IRestoreJob extends Document {
  _id: Types.ObjectId;
  status: RestoreJobStatus;
  initiatedBy?: string;
  uploadedFileSize: number;
  totalCollections: number;
  collectionsRestored: number;
  totalRecords: number;
  recordsRestored: number;
  totalImages: number;
  imagesRestored: number;
  currentCollection?: string; // Current collection being imported (profiles/games/achievements/images)
  mode: RestoreMode;
  createdAt: Date;
  completedAt?: Date;
  error?: string;
  warnings: IRestoreWarning[];
}

const restoreJobSchema = new Schema<IRestoreJob>(
  {
    status: {
      type: String,
      enum: ['uploading', 'extracting', 'validating', 'restoring', 'completed', 'failed'],
      required: true,
      default: 'uploading',
      index: true,
    },
    initiatedBy: {
      type: String,
    },
    uploadedFileSize: {
      type: Number,
      required: true,
      default: 0,
    },
    totalCollections: {
      type: Number,
      required: true,
      default: 0,
    },
    collectionsRestored: {
      type: Number,
      required: true,
      default: 0,
    },
    totalRecords: {
      type: Number,
      required: true,
      default: 0,
    },
    recordsRestored: {
      type: Number,
      required: true,
      default: 0,
    },
    totalImages: {
      type: Number,
      required: true,
      default: 0,
    },
    imagesRestored: {
      type: Number,
      required: true,
      default: 0,
    },
    currentCollection: {
      type: String,
    },
    mode: {
      type: String,
      enum: ['merge', 'replace'],
      required: true,
      default: 'merge',
    },
    completedAt: {
      type: Date,
    },
    error: {
      type: String,
    },
    warnings: [
      {
        message: { type: String, required: true },
        timestamp: { type: Date, required: true, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
    collection: 'restore_jobs',
  }
);

// Compound index for finding recent restores
restoreJobSchema.index({ status: 1, createdAt: -1 });

// Index for cleanup of old restore records
restoreJobSchema.index({ createdAt: 1 });

export const RestoreJob = mongoose.model<IRestoreJob>('RestoreJob', restoreJobSchema);
