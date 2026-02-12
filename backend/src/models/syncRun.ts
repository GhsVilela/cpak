import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ISyncRun extends Document {
  platform: 'steam' | 'xbox' | 'playstation';
  profileId: Types.ObjectId;
  startedAt: Date;
  completedAt: Date;
  status: 'success' | 'failed';
  error?: string;
}

const SyncRunSchema = new Schema<ISyncRun>({
  platform: {
    type: String,
    required: true,
    enum: ['steam', 'xbox', 'playstation'],
  },
  profileId: { type: Schema.Types.ObjectId, ref: 'Profile', required: true },
  startedAt: { type: Date, required: true },
  completedAt: { type: Date, required: true },
  status: {
    type: String,
    required: true,
    enum: ['success', 'failed'],
  },
  error: String,
});

export const SyncRun = mongoose.model<ISyncRun>('SyncRun', SyncRunSchema);
