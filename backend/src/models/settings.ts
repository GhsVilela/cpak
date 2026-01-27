import mongoose from 'mongoose';

export interface ISettings {
  _id: string;
  steamGridApiKey?: string;
  updatedAt?: Date;
}

const settingsSchema = new mongoose.Schema<ISettings>(
  {
    _id: { type: String, default: 'global', required: true },
    steamGridApiKey: { type: String, required: false },
  },
  {
    timestamps: true,
  }
);

export const Settings = mongoose.model<ISettings>('Settings', settingsSchema);
