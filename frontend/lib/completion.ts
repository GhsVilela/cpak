export interface CompletionAwareGame {
  platform?: 'steam' | 'xbox' | 'playstation';
  completionPercent?: number;
  hasAchievementGroups?: boolean;
  baseGameAchievementsTotal?: number;
  baseGameAchievementsUnlocked?: number;
}

/**
 * True when a Steam game's base-game achievements are fully unlocked.
 * DLC/update achievement sets are deliberately ignored. When no base-game
 * breakdown is available (legacy sync data), an overall 100% completion is
 * still proof that the base game was completed.
 */
export function isSteamBaseGameCompleted(game: CompletionAwareGame): boolean {
  if (game.platform && game.platform !== 'steam') return false;

  const total = game.baseGameAchievementsTotal ?? 0;
  const unlocked = game.baseGameAchievementsUnlocked ?? 0;
  if (total > 0) return unlocked >= total;

  return game.completionPercent === 100;
}

/** True when the game's Platinum trophy has been earned. */
export function isPlatinumUnlocked(game: { trophyPlatinum?: number | null }): boolean {
  return (game.trophyPlatinum ?? 0) > 0;
}
