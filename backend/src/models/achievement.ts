import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IAchievement extends Document {
  platform: 'steam' | 'xbox' | 'playstation';
  profileId: Types.ObjectId;
  gameId: Types.ObjectId;
  achievementId: string;
  name: string;
  description?: string;
  unlockedAt?: Date;
  iconPath?: string;
  iconGrayPath?: string;
}

const AchievementSchema = new Schema<IAchievement>(
  {
    platform: {
      type: String,
      required: true,
      enum: ['steam', 'xbox', 'playstation'],
    },
    profileId: { type: Schema.Types.ObjectId, ref: 'Profile', required: true },
    gameId: { type: Schema.Types.ObjectId, ref: 'Game', required: true },
    achievementId: { type: String, required: true },
    name: { type: String, required: true },
    description: String,
    unlockedAt: Date,
    iconPath: String,
    iconGrayPath: String,
  },
  { timestamps: true }
);

AchievementSchema.index(
  { platform: 1, profileId: 1, gameId: 1, achievementId: 1 },
  { unique: true }
);
AchievementSchema.index({ unlockedAt: 1 });

export const Achievement = mongoose.model<IAchievement>('Achievement', AchievementSchema);
