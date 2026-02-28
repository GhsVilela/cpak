import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IGame extends Document {
  platform: 'steam' | 'xbox' | 'playstation';
  profileId: Types.ObjectId;
  gameId: string;
  title: string;
  achievementsTotal: number;
  achievementsUnlocked: number;
  completionPercent: number;
  imagePath?: string;
  /** Xbox-specific: console generations the game supports (e.g. Xbox360, XboxOne, XboxSeries, PC) */
  devices?: string[];
  lastSyncedAt: Date;
}

const GameSchema = new Schema<IGame>(
  {
    platform: {
      type: String,
      required: true,
      enum: ['steam', 'xbox', 'playstation'],
    },
    profileId: { type: Schema.Types.ObjectId, ref: 'Profile', required: true },
    gameId: { type: String, required: true },
    title: { type: String, required: true },
    achievementsTotal: { type: Number, required: true, default: 0 },
    achievementsUnlocked: { type: Number, required: true, default: 0 },
    completionPercent: { type: Number, required: true, default: 0 },
    imagePath: String,
    devices: { type: [String], default: undefined },
    lastSyncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

GameSchema.index({ platform: 1, profileId: 1, gameId: 1 }, { unique: true });
GameSchema.index({ completionPercent: 1 });

// Performance optimization index (added for 003-performance-optimization)
// Compound index for fast profile + platform queries during sync
GameSchema.index({ profileId: 1, platform: 1 }, { name: 'idx_games_profile_platform' });

export const Game = mongoose.model<IGame>('Game', GameSchema);
