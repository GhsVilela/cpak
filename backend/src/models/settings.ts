import mongoose from 'mongoose';

export interface ISettings {
  _id: string;
  steamGridApiKey?: string;
  schedulerEnabled?: boolean;
  schedulerCron?: string;
  updatedAt?: Date;
}

const settingsSchema = new mongoose.Schema<ISettings>(
  {
    _id: { type: String, default: 'global', required: true },
    steamGridApiKey: { type: String, required: false },
    schedulerEnabled: { type: Boolean, required: false, default: false },
    schedulerCron: { type: String, required: false, default: '0 3 * * *' },
  },
  {
    timestamps: true,
  }
);

export const Settings = mongoose.model<ISettings>('Settings', settingsSchema);
