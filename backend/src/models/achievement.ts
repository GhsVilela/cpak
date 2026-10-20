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
  /** Xbox-specific: gamerscore value for this achievement */
  gamerscore?: number;
  /** PlayStation-specific: trophy grade (bronze, silver, gold, platinum). null for non-PlayStation platforms. */
  trophyGrade?: 'bronze' | 'silver' | 'gold' | 'platinum' | null;
  /** PlayStation-specific: whether this is a hidden/secret trophy */
  isHidden?: boolean;
  /**
   * Achievement set / trophy group identifier this achievement belongs to.
   * PlayStation: "default" for the base game, "001"/"002"… for DLC/updates.
   * Steam: the numeric achievement set (group) id as a string ("0" = base game).
   */
  groupId?: string;
  /** Human-readable name of the achievement set / trophy group. */
  groupName?: string;
  /** Display order of the group (base game first). */
  groupOrder?: number;
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
    gamerscore: { type: Number },
    trophyGrade: {
      type: String,
      enum: ['bronze', 'silver', 'gold', 'platinum', null],
      default: null,
    },
    isHidden: { type: Boolean, default: false },
    groupId: { type: String },
    groupName: { type: String },
    groupOrder: { type: Number, default: null },
  },
  { timestamps: true }
);

AchievementSchema.index(
  { platform: 1, profileId: 1, gameId: 1, achievementId: 1 },
  { unique: true }
);
AchievementSchema.index({ unlockedAt: 1 });

// Performance optimization indexes (added for 003-performance-optimization)
// Compound index for fast lookups by profile and game
AchievementSchema.index({ profileId: 1, gameId: 1, achievementId: 1 }, { name: 'idx_achievements_profile_game_achievement' });
// Index for game-level queries
AchievementSchema.index({ profileId: 1, gameId: 1 }, { name: 'idx_achievements_profile_game' });

export const Achievement = mongoose.model<IAchievement>('Achievement', AchievementSchema);
