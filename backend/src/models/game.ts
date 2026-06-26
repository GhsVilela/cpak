import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IGame extends Document {
  platform: 'steam' | 'xbox' | 'playstation';
  profileId: Types.ObjectId;
  gameId: string;
  title: string;
  achievementsTotal: number;
  achievementsUnlocked: number;
  completionPercent: number;
  capsuleImagePath?: string;
  iconImagePath?: string;
  heroImagePath?: string;
  customTitle?: string;
  /** Xbox-specific: console generations the game supports (e.g. Xbox360, XboxOne, XboxSeries, PC) */
  devices?: string[];
  /** Xbox-specific: how much gamerscore the user has earned for this game */
  currentGamerscore?: number;
  /** Xbox-specific: total gamerscore possible for this game */
  maxGamerscore?: number;
  /** Xbox-specific: last played / last achievement unlock timestamp */
  lastPlayed?: Date;
  /** Xbox-specific: total minutes played (from TitleHub API) */
  playTimeMinutes?: number;
  /** How the game was discovered: owned or played_history (ClientGetLastPlayedTimes / recent) */
  ownershipSource?: 'owned' | 'played_history';
  /** True when achievement data could not be fetched (e.g. refunded/expired license) */
  achievementsFetchFailed?: boolean;
  /** True when the user has manually hidden this game */
  isHidden?: boolean;
  /** PlayStation-specific: count of earned bronze trophies */
  trophyBronze?: number | null;
  /** PlayStation-specific: count of earned silver trophies */
  trophySilver?: number | null;
  /** PlayStation-specific: count of earned gold trophies */
  trophyGold?: number | null;
  /** PlayStation-specific: count of earned platinum trophies (0 or 1) */
  trophyPlatinum?: number | null;
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
    capsuleImagePath: String,
    iconImagePath: String,
    heroImagePath: String,
    customTitle: String,
    devices: { type: [String], default: undefined },
    currentGamerscore: { type: Number },
    maxGamerscore: { type: Number },
    lastPlayed: { type: Date },
    playTimeMinutes: { type: Number },
    ownershipSource: { type: String, enum: ['owned', 'played_history'] },
    achievementsFetchFailed: { type: Boolean },
    isHidden: { type: Boolean },
    trophyBronze: { type: Number, default: null },
    trophySilver: { type: Number, default: null },
    trophyGold: { type: Number, default: null },
    trophyPlatinum: { type: Number, default: null },
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
