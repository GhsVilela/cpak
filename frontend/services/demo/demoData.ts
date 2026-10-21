import { getPlaceholderCover, getPlaceholderIcon, getPlaceholderHero } from './demoImages';

export interface DemoProfile {
  _id: string;
  platform: 'steam' | 'xbox' | 'playstation';
  profileId: string;
  displayName: string;
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
  createdAt: string;
  updatedAt: string;
}

export const demoProfiles: DemoProfile[] = [
  {
    _id: 'demo_steam_1',
    platform: 'steam',
    profileId: '76561198000000001',
    displayName: 'DemoSteamGamer',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'demo_xbox_1',
    platform: 'xbox',
    profileId: '2533274856345678',
    displayName: 'DemoXboxHero',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'demo_psn_1',
    platform: 'playstation',
    profileId: '1234567890123456789',
    displayName: 'DemoTrophyHunter',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'demo_steam_2',
    platform: 'steam',
    profileId: '76561198000000002',
    displayName: 'CasualSteamPlayer',
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
  // Steam profile 1
  makeGame('steam_001', 'demo_steam_1', 'steam', 'Celestial Odyssey', 50, 50),
  makeGame('steam_002', 'demo_steam_1', 'steam', 'Mystic Realms', 40, 30),
  makeGame('steam_003', 'demo_steam_1', 'steam', 'Neon Racer 2087', 30, 15),
  makeGame('steam_004', 'demo_steam_1', 'steam', 'Dungeon Depths', 60, 20),
  makeGame('steam_005', 'demo_steam_1', 'steam', 'Skyward Explorers', 25, 0),
  makeGame('steam_006', 'demo_steam_1', 'steam', 'Puzzle Masters', 80, 60),
  makeGame('steam_007', 'demo_steam_1', 'steam', 'Shadow Tactics', 45, 45),
  makeGame('steam_008', 'demo_steam_1', 'steam', 'Oceanic Adventures', 35, 12),
  // Steam profile 2
  makeGame('steam_101', 'demo_steam_2', 'steam', 'Cozy Garden Simulator', 20, 18),
  makeGame('steam_102', 'demo_steam_2', 'steam', 'Retro Arcade Collection', 100, 25),
  // Xbox
  makeGame('xbox_001', 'demo_xbox_1', 'xbox', 'Eternal Guardians', 40, 40, {
    devices: ['XboxSeries', 'PC'],
    currentGamerscore: 1000,
    maxGamerscore: 1000,
  }),
  makeGame('xbox_002', 'demo_xbox_1', 'xbox', 'Racing Legends', 30, 22, {
    devices: ['Xbox360'],
    currentGamerscore: 550,
    maxGamerscore: 750,
  }),
  makeGame('xbox_003', 'demo_xbox_1', 'xbox', 'Desert Survival', 50, 10, {
    devices: ['XboxOne', 'PC'],
    currentGamerscore: 250,
    maxGamerscore: 1250,
  }),
  makeGame('xbox_004', 'demo_xbox_1', 'xbox', 'Action Heroes', 35, 35, {
    devices: ['XboxOne'],
    currentGamerscore: 875,
    maxGamerscore: 875,
  }),
  makeGame('xbox_005', 'demo_xbox_1', 'xbox', 'Sci-Fi Conquest', 45, 18, {
    devices: ['XboxSeries', 'PC'],
    currentGamerscore: 450,
    maxGamerscore: 1125,
  }),
  // PlayStation
  makeGame('psn_001', 'demo_psn_1', 'playstation', 'Mythic Quest', 48, 48, {
    trophyBronze: 30,
    trophySilver: 12,
    trophyGold: 5,
    trophyPlatinum: 1,
    hasAchievementGroups: true,
  }),
  makeGame('psn_002', 'demo_psn_1', 'playstation', 'Urban Ninja', 42, 28, {
    trophyBronze: 18,
    trophySilver: 8,
    trophyGold: 2,
    trophyPlatinum: 0,
    hasAchievementGroups: true,
  }),
  makeGame('psn_003', 'demo_psn_1', 'playstation', "Dragon's Legacy", 56, 15, {
    trophyBronze: 10,
    trophySilver: 4,
    trophyGold: 1,
    trophyPlatinum: 0,
    hasAchievementGroups: true,
  }),
  makeGame('psn_004', 'demo_psn_1', 'playstation', 'Racing Royale', 39, 39, {
    trophyBronze: 26,
    trophySilver: 9,
    trophyGold: 3,
    trophyPlatinum: 1,
    hasAchievementGroups: true,
  }),
];

function generateAchievements(game: DemoGame): DemoAchievement[] {
  const achievements: DemoAchievement[] = [];
  const total = game.achievementsTotal;
  const unlocked = game.achievementsUnlocked;
  for (let i = 0; i < total; i++) {
    const isUnlocked = i < unlocked;
    const trophyGrade =
      game.platform === 'playstation'
        ? i === 0 && unlocked > 0
          ? 'platinum'
          : i < 5
            ? 'gold'
            : i < 15
              ? 'silver'
              : 'bronze'
        : null;
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
      groupId: 'default',
      groupName: 'Base Game',
      groupOrder: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
  return achievements;
}

export const demoAchievements: DemoAchievement[] = demoGames.flatMap(generateAchievements);

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
