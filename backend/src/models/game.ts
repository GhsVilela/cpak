import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IGame extends Document {
  platform: 'steam' | 'xbox' | 'playstation';
  profileId: Types.ObjectId;
  gameId: string;
  title: string;
  achievementsTotal: number;
  achievementsUnlocked: number;
  completionPercent: number;
  iconPath?: string;
  imageRefs?: {
    provider: 'steamgriddb' | 'native' | 'custom';
    urls: string[];
  };
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
    iconPath: String,
    imageRefs: {
      provider: {
        type: String,
        enum: ['steamgriddb', 'native', 'custom'],
      },
      urls: [String],
    },
    lastSyncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

GameSchema.index({ platform: 1, profileId: 1, gameId: 1 }, { unique: true });
GameSchema.index({ completionPercent: 1 });

export const Game = mongoose.model<IGame>('Game', GameSchema);
