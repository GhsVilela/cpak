import mongoose, { Schema, Document } from 'mongoose';
import { encrypt, decrypt } from '../utils/crypto.js';

export interface IProfile extends Document {
  platform: 'steam' | 'xbox' | 'playstation';
  profileId: string;
  displayName: string;
  credentials: {
    steamApiKey?: string;
    tokenType?: string;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: Date;
    scopes?: string[];
  };
  createdAt: Date;
  updatedAt: Date;
  getDecryptedCredentials(): any;
}

const ProfileSchema = new Schema<IProfile>(
  {
    platform: {
      type: String,
      required: true,
      enum: ['steam', 'xbox', 'playstation'],
    },
    profileId: { type: String, required: true },
    displayName: { type: String, required: true },
    credentials: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

ProfileSchema.index({ platform: 1, profileId: 1 }, { unique: true });

// Encrypt sensitive fields before saving
ProfileSchema.pre('save', function (next) {
  if (this.isModified('credentials')) {
    const creds = this.credentials as any;
    
    // Encrypt sensitive tokens
    if (creds.steamApiKey && !creds.steamApiKey.startsWith('encrypted:')) {
      creds.steamApiKey = `encrypted:${encrypt(creds.steamApiKey)}`;
    }
    if (creds.accessToken && !creds.accessToken.startsWith('encrypted:')) {
      creds.accessToken = `encrypted:${encrypt(creds.accessToken)}`;
    }
    if (creds.refreshToken && !creds.refreshToken.startsWith('encrypted:')) {
      creds.refreshToken = `encrypted:${encrypt(creds.refreshToken)}`;
    }
  }
  next();
});

// Method to get decrypted credentials
ProfileSchema.methods.getDecryptedCredentials = function() {
  const creds = { ...this.credentials } as any;
  
  try {
    if (creds.steamApiKey?.startsWith('encrypted:')) {
      creds.steamApiKey = decrypt(creds.steamApiKey.substring(10));
    }
    if (creds.accessToken?.startsWith('encrypted:')) {
      creds.accessToken = decrypt(creds.accessToken.substring(10));
    }
    if (creds.refreshToken?.startsWith('encrypted:')) {
      creds.refreshToken = decrypt(creds.refreshToken.substring(10));
    }
  } catch (error) {
    console.error('[Profile] Failed to decrypt credentials:', error);
  }
  
  return creds;
};

// Always exclude encrypted credentials from JSON responses
ProfileSchema.methods.toJSON = function() {
  const obj = this.toObject();
  // Remove sensitive data from API responses
  if (obj.credentials) {
    obj.credentials = { 
      configured: true,
      // Only expose non-sensitive metadata
      tokenType: obj.credentials.tokenType,
      expiresAt: obj.credentials.expiresAt,
      scopes: obj.credentials.scopes
    };
  }
  return obj;
};

export const Profile = mongoose.model<IProfile>('Profile', ProfileSchema);
