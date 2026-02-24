import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Backup Job Status
 */
export type BackupJobStatus = 'preparing' | 'compressing' | 'ready' | 'failed' | 'expired';

/**
 * Backup Job Document
 * 
 * Represents a backup creation operation.
 * Tracks preparation, compression, and download readiness.
 */
export interface IBackupJob extends Document {
  _id: Types.ObjectId;
  status: BackupJobStatus;
  initiatedBy?: string;
  totalCollections: number;
  collectionsProcessed: number;
  totalRecords: number;
  recordsProcessed: number;
  fileSize: number;
  filePath?: string; // Optional - set when backup completes
  collections: string[];
  createdAt: Date;
  completedAt?: Date;
  expiresAt: Date; // Auto-set to 24 hours from creation
  error?: string;
  metadata?: {
    totalFiles?: number; // Total files to archive (including data.json)
  };
}

const backupJobSchema = new Schema<IBackupJob>(
  {
    status: {
      type: String,
      enum: ['preparing', 'compressing', 'ready', 'failed', 'expired'],
      required: true,
      default: 'preparing',
      // No single-field index - covered by compound index below
    },
    initiatedBy: {
      type: String,
    },
    totalCollections: {
      type: Number,
      required: true,
      default: 0,
    },
    collectionsProcessed: {
      type: Number,
      required: true,
      default: 0,
    },
    totalRecords: {
      type: Number,
      required: true,
      default: 0,
    },
    recordsProcessed: {
      type: Number,
      required: true,
      default: 0,
    },
    fileSize: {
      type: Number,
      required: true,
      default: 0,
    },
    filePath: {
      type: String,
      required: false, // Optional - set when backup file is created
    },
    collections: {
      type: [String],
      required: true,
      default: [],
    },
    completedAt: {
      type: Date,
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from creation
      // TTL index defined explicitly below with expireAfterSeconds
    },
    error: {
      type: String,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: 'backup_jobs',
  }
);

// Compound index for finding recent backups
backupJobSchema.index({ status: 1, createdAt: -1 });

// TTL index for automatic expiration (MongoDB will auto-delete when expiresAt is reached)
backupJobSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const BackupJob = mongoose.model<IBackupJob>('BackupJob', backupJobSchema);
