import mongoose, { Schema, Document } from 'mongoose';

export interface IBackupMetadata extends Document {
  type: 'backup' | 'restore';
  status: 'in-progress' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
  downloadedAt?: Date;
  filePath?: string;
  jobId?: string;
  error?: string;
  metadata?: {
    profiles?: number;
    games?: number;
    achievements?: number;
    settings?: number;
    images?: number;
  };
}

const backupMetadataSchema = new Schema<IBackupMetadata>(
  {
    type: {
      type: String,
      enum: ['backup', 'restore'],
      required: true
    },
    status: {
      type: String,
      enum: ['in-progress', 'completed', 'failed'],
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    completedAt: {
      type: Date
    },
    downloadedAt: {
      type: Date
    },
    filePath: {
      type: String
    },
    jobId: {
      type: String
    },
    error: {
      type: String
    },
    metadata: {
      profiles: Number,
      games: Number,
      achievements: Number,
      settings: Number,
      images: Number
    }
  },
  {
    timestamps: true
  }
);

// Index for quick lookups
backupMetadataSchema.index({ type: 1, status: 1, createdAt: -1 });

export const BackupMetadata = mongoose.model<IBackupMetadata>(
  'BackupMetadata',
  backupMetadataSchema
);
