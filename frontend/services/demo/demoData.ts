import { getPlaceholderCover, getPlaceholderIcon, getPlaceholderHero } from './demoImages';

export interface DemoProfile {
  _id: string;
  platform: 'steam' | 'xbox' | 'playstation';
  profileId: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

export interface DemoGame {
  _id: string;
  profileId: string;
  platform: 'steam' | 'xbox' | 'playstation';
  gameId: string;
  title: string;
  imagePath: string | null;
  heroImagePath: string | null;
  logoImagePath: string | null;
  iconImagePath: string | null;
  completionPercent: number;
  totalAchievements: number;
  achievementsUnlocked: number;
  lastPlayed?: string | null;
  playtimeForever?: number | null;
  isHidden: boolean;
  createdAt: string;
  updatedAt: string;
  // Platform specific
  gamerscoreTotal?: number;
  gamerscoreEarned?: number;
  gamerscore360Total?: number;
  gamerscore360Earned?: number;
  trophyCounts?: {
    platinum: number;
    gold: number;
    silver: number;
    bronze: number;
  };
  trophyCountsEarned?: {
    platinum: number;
    gold: number;
    silver: number;
    bronze: number;
  };
}

export interface DemoAchievement {
  _id: string;
  gameId: string;
  profileId: string;
  achievementId: string;
  name: string;
  description: string;
  iconPath: string | null;
  iconGrayPath: string | null;
  unlocked: boolean;
  unlockTime?: number | null;
  percent?: number | null;
  gamerscore?: number | null;
  trophyType?: 'bronze' | 'silver' | 'gold' | 'platinum' | null;
  trophyRare?: number | null;
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

function makeGame(id: string, profileId: string, platform: DemoGame['platform'], title: string, total: number, unlocked: number, opts: Partial<DemoGame> = {}): DemoGame {
  const completionPercent = total === 0 ? 0 : Math.round((unlocked / total) * 100);
  const base = {
    _id: `game_${id}`,
    profileId,
    platform,
    gameId: id,
    title,
    imagePath: getPlaceholderCover(`${platform}-${id}`),
    heroImagePath: getPlaceholderHero(`${platform}-${id}`),
    logoImagePath: null,
    iconImagePath: getPlaceholderIcon(`${platform}-${id}`),
    completionPercent,
    totalAchievements: total,
    achievementsUnlocked: unlocked,
    lastPlayed: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
    playtimeForever: Math.floor(Math.random() * 5000),
    isHidden: false,
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
  makeGame('xbox_001', 'demo_xbox_1', 'xbox', 'Eternal Guardians', 40, 40, { gamerscoreTotal: 1000, gamerscoreEarned: 1000 }),
  makeGame('xbox_002', 'demo_xbox_1', 'xbox', 'Racing Legends', 30, 22, { gamerscoreTotal: 750, gamerscoreEarned: 550 }),
  makeGame('xbox_003', 'demo_xbox_1', 'xbox', 'Desert Survival', 50, 10, { gamerscoreTotal: 1250, gamerscoreEarned: 250 }),
  makeGame('xbox_004', 'demo_xbox_1', 'xbox', 'Action Heroes', 35, 35, { gamerscoreTotal: 875, gamerscoreEarned: 875 }),
  makeGame('xbox_005', 'demo_xbox_1', 'xbox', 'Sci-Fi Conquest', 45, 18, { gamerscoreTotal: 1125, gamerscoreEarned: 450 }),
  // PlayStation
  makeGame('psn_001', 'demo_psn_1', 'playstation', 'Mythic Quest', 48, 48, { trophyCounts: { platinum: 1, gold: 5, silver: 12, bronze: 30 }, trophyCountsEarned: { platinum: 1, gold: 5, silver: 12, bronze: 30 } }),
  makeGame('psn_002', 'demo_psn_1', 'playstation', 'Urban Ninja', 42, 28, { trophyCounts: { platinum: 1, gold: 4, silver: 10, bronze: 27 }, trophyCountsEarned: { platinum: 0, gold: 2, silver: 8, bronze: 18 } }),
  makeGame('psn_003', 'demo_psn_1', 'playstation', 'Dragon\'s Legacy', 56, 15, { trophyCounts: { platinum: 1, gold: 6, silver: 14, bronze: 35 }, trophyCountsEarned: { platinum: 0, gold: 1, silver: 4, bronze: 10 } }),
  makeGame('psn_004', 'demo_psn_1', 'playstation', 'Racing Royale', 39, 39, { trophyCounts: { platinum: 1, gold: 3, silver: 9, bronze: 26 }, trophyCountsEarned: { platinum: 1, gold: 3, silver: 9, bronze: 26 } }),
];

function generateAchievements(game: DemoGame): DemoAchievement[] {
  const achievements: DemoAchievement[] = [];
  const total = game.totalAchievements;
  const unlocked = game.achievementsUnlocked;
  for (let i = 0; i < total; i++) {
    const isUnlocked = i < unlocked;
    achievements.push({
      _id: `ach_${game._id}_${i}`,
      gameId: game._id,
      profileId: game.profileId,
      achievementId: `ach_${i}`,
      name: `${game.title} - Challenge ${i + 1}`,
      description: `Complete challenge ${i + 1} in ${game.title}.`,
      iconPath: getPlaceholderIcon(`${game.gameId}-ach-${i}`),
      iconGrayPath: getPlaceholderIcon(`${game.gameId}-ach-${i}-gray`),
      unlocked: isUnlocked,
      unlockTime: isUnlocked ? Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 86400000) : null,
      percent: Math.floor(Math.random() * 80) + 10,
      gamerscore: game.platform === 'xbox' ? (i % 5 === 0 ? 100 : i % 3 === 0 ? 50 : 25) : null,
      trophyType: game.platform === 'playstation' ? (i === 0 && unlocked ? 'platinum' : i < 5 ? 'gold' : i < 15 ? 'silver' : 'bronze') : null,
      trophyRare: game.platform === 'playstation' ? Math.floor(Math.random() * 40) + 5 : null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
  return achievements;
}

export const demoAchievements: DemoAchievement[] = demoGames.flatMap(generateAchievements);

export const demoSyncStatus: Record<string, any> = {
  demo_steam_1: { status: 'idle', lastSyncAt: new Date(Date.now() - 3600000).toISOString(), progress: 100, message: 'Sync completed' },
  demo_steam_2: { status: 'idle', lastSyncAt: new Date(Date.now() - 7200000).toISOString(), progress: 100, message: 'Sync completed' },
  demo_xbox_1: { status: 'idle', lastSyncAt: new Date(Date.now() - 1800000).toISOString(), progress: 100, message: 'Sync completed' },
  demo_psn_1: { status: 'idle', lastSyncAt: new Date(Date.now() - 900000).toISOString(), progress: 100, message: 'Sync completed' },
};

export const demoSettings = {
  settings: [
    { key: 'demo_mode', value: 'true', category: 'general', isSecret: false },
  ],
};

export const demoBackupStatus = {
  backup: { current: null },
  restore: { current: null },
};
