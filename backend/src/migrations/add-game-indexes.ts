import { Game } from '../models/game.js';
import { logger } from '../utils/logger.js';

/**
 * Migration: Add compound indexes to games collection
 * 
 * Purpose: Optimize game queries by profile and platform
 * Target: Queries filtering games for a specific profile/platform combination
 * 
 * Expected Impact: Faster game list queries during sync initialization
 */
export async function migrateGameIndexes(): Promise<void> {
  logger.info('Creating compound index on games collection');
  
  try {
    // Compound index for profile + platform queries
    await Game.collection.createIndex(
      { profileId: 1, platform: 1 },
      {
        background: true,
        name: 'idx_games_profile_platform'
      }
    );
    
    logger.info('✓ Created compound index: idx_games_profile_platform');
    logger.info('Game indexes created successfully');
  } catch (error: any) {
    // Index may already exist - log but don't fail
    if (error.code === 85 || error.code === 86) {
      logger.info('Game indexes already exist, skipping');
    } else {
      logger.error({ error }, 'Failed to create game indexes');
      throw error;
    }
  }
}
