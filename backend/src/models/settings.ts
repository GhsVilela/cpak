import mongoose from 'mongoose';
import { encrypt, decrypt } from '../utils/crypto.js';

export interface ISettings {
  _id: string;
  steamGridApiKey?: string;
  schedulerEnabled?: boolean;
  schedulerCron?: string;
  updatedAt?: Date;
  getDecryptedApiKey(): string | undefined;
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

// Encrypt steamGridApiKey before saving
settingsSchema.pre('save', function (next) {
  // Check if steamGridApiKey exists and is being created or modified
  if (this.steamGridApiKey && (this.isNew || this.isModified('steamGridApiKey'))) {
    // Only encrypt if not already encrypted
    if (!this.steamGridApiKey.startsWith('encrypted:')) {
      this.steamGridApiKey = `encrypted:${encrypt(this.steamGridApiKey)}`;
    }
  }
  next();
});

// Method to get decrypted API key
settingsSchema.methods.getDecryptedApiKey = function() {
  if (!this.steamGridApiKey) return undefined;
  
  try {
    if (this.steamGridApiKey.startsWith('encrypted:')) {
      return decrypt(this.steamGridApiKey.substring(10));
    }
    return this.steamGridApiKey;
  } catch (error) {
    console.error('[Settings] Failed to decrypt API key:', error);
    return undefined;
  }
};

// Override toJSON to hide encrypted key, only show if configured
settingsSchema.methods.toJSON = function() {
  const obj = this.toObject();
  if (obj.steamGridApiKey) {
    obj.steamGridApiKey = undefined;
    obj.steamGridApiKeyConfigured = true;
  } else {
    obj.steamGridApiKeyConfigured = false;
  }
  return obj;
};

export const Settings = mongoose.model<ISettings>('Settings', settingsSchema);
