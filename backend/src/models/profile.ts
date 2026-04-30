import mongoose, { Schema, Document } from 'mongoose';
import { encrypt, decrypt, isEncrypted } from '../utils/crypto.js';

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
  /** Whether this is the default profile for its platform. */
  isDefault?: boolean;
  /** Whether the user has manually edited the display name. */
  displayNameEdited?: boolean;
  /** Total achievements from Steam profile achievement showcase (null if not available). */
  steamShowcaseAchievements?: number | null;
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
    isDefault: { type: Boolean, default: false },
    displayNameEdited: { type: Boolean, default: false },
    steamShowcaseAchievements: { type: Number, default: null },
  },
  { timestamps: true }
);

ProfileSchema.index({ platform: 1, profileId: 1 }, { unique: true });

// Encrypt sensitive fields before saving
ProfileSchema.pre('save', function (next) {
  // Check if credentials exist and are being created or modified
  if (this.credentials && (this.isNew || this.isModified('credentials'))) {
    const creds = this.credentials as any;
    
    // Encrypt sensitive tokens (encrypt() now adds prefix automatically)
    if (creds.steamApiKey && !isEncrypted(creds.steamApiKey)) {
      creds.steamApiKey = encrypt(creds.steamApiKey);
    }
    if (creds.accessToken && !isEncrypted(creds.accessToken)) {
      creds.accessToken = encrypt(creds.accessToken);
    }
    if (creds.refreshToken && !isEncrypted(creds.refreshToken)) {
      creds.refreshToken = encrypt(creds.refreshToken);
    }
  }
  next();
});

// Method to get decrypted credentials
ProfileSchema.methods.getDecryptedCredentials = function() {
  const creds = { ...this.credentials } as any;
  
  try {
    // decrypt() now handles prefix automatically
    if (creds.steamApiKey && isEncrypted(creds.steamApiKey)) {
      creds.steamApiKey = decrypt(creds.steamApiKey);
    }
    if (creds.accessToken && isEncrypted(creds.accessToken)) {
      creds.accessToken = decrypt(creds.accessToken);
    }
    if (creds.refreshToken && isEncrypted(creds.refreshToken)) {
      creds.refreshToken = decrypt(creds.refreshToken);
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
    const hasApiKey = !!(obj.credentials.steamApiKey);
    obj.credentials = { 
      configured: true,
      steamApiKeyConfigured: hasApiKey,
      // Only expose non-sensitive metadata
      tokenType: obj.credentials.tokenType,
      expiresAt: obj.credentials.expiresAt,
      scopes: obj.credentials.scopes
    };
  }
  return obj;
};

export const Profile = mongoose.model<IProfile>('Profile', ProfileSchema);
