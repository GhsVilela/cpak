import { Schema, model, Model, Document } from 'mongoose';
import { encrypt, decrypt } from '../utils/crypto.js';

// Setting categories for organization
export enum SettingCategory {
  IMAGE_PROVIDER = 'image_provider',
  SCHEDULER = 'scheduler',
  SYNC = 'sync'
}

// Setting interface
export interface ISetting extends Document {
  key: string;
  value: string;
  category: SettingCategory;
  isSecret: boolean;
  updatedAt: Date;
}

// Setting methods
export interface ISettingMethods {
  getDecryptedValue(): string;
}

// Setting model
export interface ISettingModel extends Model<ISetting, {}, ISettingMethods> {
  encryptValue(value: string): string;
}

const settingSchema = new Schema<ISetting, ISettingModel, ISettingMethods>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: /^[a-z_]+$/,  // Lowercase letters and underscores only
    },
    value: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      required: true,
      enum: Object.values(SettingCategory),
    },
    isSecret: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
settingSchema.index({ category: 1 });
settingSchema.index({ key: 1 }, { unique: true });

// Instance method: Decrypt value
settingSchema.method('getDecryptedValue', function (): string {
  if (!this.isSecret) {
    return this.value;
  }

  try {
    return decrypt(this.value);
  } catch (error) {
    throw new Error(`Failed to decrypt setting ${this.key}: ${error}`);
  }
});

// Static method: Encrypt value
settingSchema.static('encryptValue', function (value: string): string {
  return encrypt(value);
});

// Model
export const Setting = model<ISetting, ISettingModel>('Setting', settingSchema);
