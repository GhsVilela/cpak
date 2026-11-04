import { getPlaceholderCover, getPlaceholderIcon, getPlaceholderHero } from './demoImages';

export interface DemoProfile {
  _id: string;
  platform: 'steam' | 'xbox' | 'playstation';
  profileId: string;
  displayName: string;
  /** Whether this profile is the "favorite" shown by default on its platform. */
  isDefault?: boolean;
  credentials?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Mirrors the backend Game model (backend/src/models/game.ts) so the demo
 * renders exactly like the real API.
 */
export interface DemoGame {
  _id: string;
  platform: 'steam' | 'xbox' | 'playstation';
  profileId: string;
  gameId: string;
  title: string;
  achievementsTotal: number;
  achievementsUnlocked: number;
  completionPercent: number;
  capsuleImagePath?: string;
  iconImagePath?: string;
  heroImagePath?: string;
  customTitle?: string;
  devices?: string[];
  currentGamerscore?: number;
  maxGamerscore?: number;
  lastPlayed?: string;
  playTimeMinutes?: number;
  ownershipSource?: 'owned' | 'played_history';
  achievementsFetchFailed?: boolean;
  isHidden?: boolean;
  trophyBronze?: number | null;
  trophySilver?: number | null;
  trophyGold?: number | null;
  trophyPlatinum?: number | null;
  hasAchievementGroups?: boolean;
  /** Xbox-specific Mythic support metadata. */
  isMythic?: boolean;
  baseGameAchievementsTotal?: number;
  baseGameAchievementsUnlocked?: number;
  lastSyncedAt: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Mirrors the backend Achievement model (backend/src/models/achievement.ts).
 */
export interface DemoAchievement {
  _id: string;
  platform: 'steam' | 'xbox' | 'playstation';
  profileId: string;
  gameId: string;
  achievementId: string;
  name: string;
  description?: string;
  unlockedAt?: string | null;
  iconPath?: string;
  iconGrayPath?: string;
  gamerscore?: number;
  trophyGrade?: 'bronze' | 'silver' | 'gold' | 'platinum' | null;
  isHidden?: boolean;
  groupId?: string;
  groupName?: string;
  groupOrder?: number;
  /** Steam-specific global unlock percentage (0–100). */
  globalPercent?: number;
  createdAt: string;
  updatedAt: string;
}

export const demoProfiles: DemoProfile[] = [
  {
    _id: 'demo_steam_1',
    platform: 'steam',
    profileId: '76561198000000001',
    displayName: 'SteamProfile1',
    isDefault: true,
    credentials: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'demo_xbox_1',
    platform: 'xbox',
    profileId: '2533274856345678',
    displayName: 'XboxProfile',
    isDefault: true,
    credentials: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'demo_psn_1',
    platform: 'playstation',
    profileId: '1234567890123456789',
    displayName: 'PlaystationProfile',
    isDefault: true,
    credentials: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'demo_steam_2',
    platform: 'steam',
    profileId: '76561198000000002',
    displayName: 'SteamProfile2',
    isDefault: false,
    credentials: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

function makeGame(
  id: string,
  profileId: string,
  platform: DemoGame['platform'],
  title: string,
  total: number,
  unlocked: number,
  opts: Partial<DemoGame> = {}
): DemoGame {
  const completionPercent = total === 0 ? 0 : Math.round((unlocked / total) * 100);
  const base: DemoGame = {
    _id: `game_${id}`,
    profileId,
    platform,
    gameId: id,
    title,
    achievementsTotal: total,
    achievementsUnlocked: unlocked,
    completionPercent,
    capsuleImagePath: getPlaceholderCover(`${platform}-${id}`),
    heroImagePath: getPlaceholderHero(`${platform}-${id}`),
    iconImagePath: getPlaceholderIcon(`${platform}-${id}`),
    lastPlayed: new Date(Date.now() - Math.floor(Math.random() * 30) * 86400000).toISOString(),
    playTimeMinutes: Math.floor(Math.random() * 5000),
    ownershipSource: 'owned',
    achievementsFetchFailed: false,
    isHidden: false,
    lastSyncedAt: new Date(Date.now() - 3600000).toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return { ...base, ...opts };
}

export const demoGames: DemoGame[] = [
  // Steam profile 1 — includes split base/DLC groups and rare achievements.
  makeGame('steam_001', 'demo_steam_1', 'steam', 'Celestial Odyssey', 50, 50, {
    hasAchievementGroups: true,
    baseGameAchievementsTotal: 40,
  }),
  makeGame('steam_002', 'demo_steam_1', 'steam', 'Mystic Realms', 40, 30, {
    hasAchievementGroups: true,
    baseGameAchievementsTotal: 30,
  }),
  makeGame('steam_003', 'demo_steam_1', 'steam', 'Neon Racer 2087', 30, 15),
  makeGame('steam_004', 'demo_steam_1', 'steam', 'Dungeon Depths', 60, 20),
  makeGame('steam_005', 'demo_steam_1', 'steam', 'Skyward Explorers', 25, 0),
  makeGame('steam_006', 'demo_steam_1', 'steam', 'Puzzle Masters', 80, 60),
  makeGame('steam_007', 'demo_steam_1', 'steam', 'Shadow Tactics', 45, 45, {
    hasAchievementGroups: true,
    baseGameAchievementsTotal: 35,
  }),
  makeGame('steam_008', 'demo_steam_1', 'steam', 'Oceanic Adventures', 35, 12),
  // Steam profile 2
  makeGame('steam_101', 'demo_steam_2', 'steam', 'Cozy Garden Simulator', 20, 18),
  makeGame('steam_102', 'demo_steam_2', 'steam', 'Retro Arcade Collection', 100, 25),
  // Xbox
  makeGame('xbox_001', 'demo_xbox_1', 'xbox', 'Eternal Guardians', 40, 40, {
    devices: ['XboxSeries', 'PC'],
    currentGamerscore: 1000,
    maxGamerscore: 1000,
    hasAchievementGroups: true,
    isMythic: true,
    baseGameAchievementsTotal: 35,
    baseGameAchievementsUnlocked: 35,
  }),
  makeGame('xbox_002', 'demo_xbox_1', 'xbox', 'Racing Legends', 30, 22, {
    devices: ['Xbox360'],
    currentGamerscore: 550,
    maxGamerscore: 750,
    hasAchievementGroups: true,
    isMythic: false,
    baseGameAchievementsTotal: 24,
    baseGameAchievementsUnlocked: 22,
  }),
  makeGame('xbox_003', 'demo_xbox_1', 'xbox', 'Desert Survival', 50, 10, {
    devices: ['XboxOne', 'PC'],
    currentGamerscore: 250,
    maxGamerscore: 1250,
    hasAchievementGroups: true,
    isMythic: false,
    baseGameAchievementsTotal: 40,
    baseGameAchievementsUnlocked: 10,
  }),
  makeGame('xbox_004', 'demo_xbox_1', 'xbox', 'Action Heroes', 35, 35, {
    devices: ['XboxOne'],
    currentGamerscore: 875,
    maxGamerscore: 875,
    hasAchievementGroups: true,
    isMythic: true,
    baseGameAchievementsTotal: 30,
    baseGameAchievementsUnlocked: 30,
  }),
  makeGame('xbox_005', 'demo_xbox_1', 'xbox', 'Sci-Fi Conquest', 45, 18, {
    devices: ['XboxSeries', 'PC'],
    currentGamerscore: 450,
    maxGamerscore: 1125,
    hasAchievementGroups: true,
    isMythic: false,
    baseGameAchievementsTotal: 35,
    baseGameAchievementsUnlocked: 18,
  }),
  // PlayStation
  makeGame('psn_001', 'demo_psn_1', 'playstation', 'Mythic Quest', 48, 48, {
    trophyBronze: 30,
    trophySilver: 12,
    trophyGold: 5,
    trophyPlatinum: 1,
    hasAchievementGroups: true,
    baseGameAchievementsTotal: 36,
  }),
  makeGame('psn_002', 'demo_psn_1', 'playstation', 'Urban Ninja', 42, 28, {
    trophyBronze: 18,
    trophySilver: 8,
    trophyGold: 2,
    trophyPlatinum: 0,
    hasAchievementGroups: true,
    baseGameAchievementsTotal: 32,
  }),
  makeGame('psn_003', 'demo_psn_1', 'playstation', "Dragon's Legacy", 56, 15, {
    trophyBronze: 10,
    trophySilver: 4,
    trophyGold: 1,
    trophyPlatinum: 0,
    hasAchievementGroups: true,
    baseGameAchievementsTotal: 40,
  }),
  makeGame('psn_004', 'demo_psn_1', 'playstation', 'Racing Royale', 39, 39, {
    trophyBronze: 26,
    trophySilver: 9,
    trophyGold: 3,
    trophyPlatinum: 1,
    hasAchievementGroups: true,
    baseGameAchievementsTotal: 30,
  }),
];

function generateAchievements(game: DemoGame): DemoAchievement[] {
  const achievements: DemoAchievement[] = [];
  const total = game.achievementsTotal;
  const unlocked = game.achievementsUnlocked;
  const baseCount = Math.min(game.baseGameAchievementsTotal ?? total, total);
  const hasGroups = !!game.hasAchievementGroups && baseCount < total;

  for (let i = 0; i < total; i++) {
    const isBaseGame = i < baseCount;
    const localIndex = isBaseGame ? i : i - baseCount;
    // Platinum sits at the end of the base list: it only unlocks when the
    // whole base game is complete, which makes incomplete demos realistic.
    const isPlatinum = game.platform === 'playstation' && isBaseGame && i === baseCount - 1;
    const trophyGrade =
      game.platform === 'playstation'
        ? isPlatinum
          ? 'platinum'
          : localIndex < 2
            ? 'gold'
            : localIndex < 7
              ? 'silver'
              : 'bronze'
        : null;
    const isUnlocked = i < unlocked;
    // Steam rarity: every sixth achievement is below Steam's 10% rare cutoff.
    const globalPercent =
      game.platform === 'steam'
        ? i % 6 === 0
          ? 3.5 + (i % 5)
          : 20 + (i % 70)
        : undefined;

    achievements.push({
      _id: `ach_${game._id}_${i}`,
      platform: game.platform,
      gameId: game._id,
      profileId: game.profileId,
      achievementId: `ach_${i}`,
      name: `${game.title} - Challenge ${i + 1}`,
      description: `Complete challenge ${i + 1} in ${game.title}.`,
      unlockedAt: isUnlocked
        ? new Date(Date.now() - Math.floor(Math.random() * 86400000)).toISOString()
        : null,
      iconPath: getPlaceholderIcon(`${game.gameId}-ach-${i}`),
      iconGrayPath: getPlaceholderIcon(`${game.gameId}-ach-${i}-gray`),
      gamerscore: game.platform === 'xbox' ? (i % 5 === 0 ? 100 : i % 3 === 0 ? 50 : 25) : undefined,
      trophyGrade,
      isHidden: false,
      groupId: hasGroups ? (isBaseGame ? 'base' : 'addon') : 'base',
      groupName: hasGroups ? (isBaseGame ? 'Base Game' : 'DLC / Update') : 'Base Game',
      groupOrder: hasGroups && !isBaseGame ? 1 : 0,
      globalPercent,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
  return achievements;
}

export const demoAchievements: DemoAchievement[] = demoGames.flatMap(generateAchievements);

// Keep the aggregate fields on the game records consistent with the generated
// achievements, so library stats and game-page badges tell the same story.
for (const game of demoGames) {
  const gameAchievements = demoAchievements.filter((achievement) => achievement.gameId === game._id);
  const unlockedAchievements = gameAchievements.filter((achievement) => achievement.unlockedAt);

  if (game.platform === 'xbox') {
    game.maxGamerscore = gameAchievements.reduce((sum, achievement) => sum + (achievement.gamerscore ?? 0), 0);
    game.currentGamerscore = unlockedAchievements.reduce(
      (sum, achievement) => sum + (achievement.gamerscore ?? 0),
      0
    );
    if (game.isMythic) {
      const baseAchievements = gameAchievements.filter((achievement) => achievement.groupId === 'base');
      game.baseGameAchievementsTotal = baseAchievements.length;
      game.baseGameAchievementsUnlocked = baseAchievements.filter((achievement) => achievement.unlockedAt).length;
    }
  }

  if (game.platform === 'playstation') {
    game.trophyPlatinum = unlockedAchievements.filter((achievement) => achievement.trophyGrade === 'platinum').length;
    game.trophyGold = unlockedAchievements.filter((achievement) => achievement.trophyGrade === 'gold').length;
    game.trophySilver = unlockedAchievements.filter((achievement) => achievement.trophyGrade === 'silver').length;
    game.trophyBronze = unlockedAchievements.filter((achievement) => achievement.trophyGrade === 'bronze').length;
  }
}

/**
 * Mirrors the backend's /api/sync/status: `current` is only set while a sync
 * is actually running, so the pages show the aggregated stats instead of a
 * progress bar.
 */
export const demoSyncStatus: Record<string, any> = {
  demo_steam_1: {
    lastCompleted: {
      completedAt: new Date(Date.now() - 3600000).toISOString(),
      status: 'success',
    },
  },
  demo_steam_2: {
    lastCompleted: {
      completedAt: new Date(Date.now() - 7200000).toISOString(),
      status: 'success',
    },
  },
  demo_xbox_1: {
    lastCompleted: {
      completedAt: new Date(Date.now() - 1800000).toISOString(),
      status: 'success',
    },
  },
  demo_psn_1: {
    lastCompleted: {
      completedAt: new Date(Date.now() - 900000).toISOString(),
      status: 'success',
    },
  },
};

export const demoSettings = {
  settings: [
    { key: 'demo_mode', value: 'true', category: 'general', isSecret: false },
  ],
};

export const demoBackupStatus = {
  backup: { current: null, lastCompleted: null, ready: false },
  restore: { current: null, lastCompleted: null, ready: false },
};
