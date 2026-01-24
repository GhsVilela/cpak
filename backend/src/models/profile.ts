import mongoose, { Schema, Document } from 'mongoose';

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

export const Profile = mongoose.model<IProfile>('Profile', ProfileSchema);
