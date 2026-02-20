import { Achievement } from '../models/achievement.js';
import { logger } from '../utils/logger.js';

/**
 * Migration: Add compound indexes to achievements collection
 * 
 * Purpose: Eliminate COLLSCAN queries causing 500ms+ response times
 * Target: Queries filtering by profileId, gameId, and achievementId
 * 
 * Expected Impact: Query time reduction from ~498ms to <10ms
 */
export async function migrateAchievementIndexes(): Promise<void> {
  logger.info('Creating compound indexes on achievements collection');
  
  try {
    // Primary compound index for achievement lookups
    await Achievement.collection.createIndex(
      { profileId: 1, gameId: 1, achievementId: 1 },
      { 
        background: true,
        name: 'idx_achievements_profile_game_achievement' 
      }
    );
    
    logger.info('✓ Created compound index: idx_achievements_profile_game_achievement');
    
    // Secondary index for game-level queries
    await Achievement.collection.createIndex(
      { profileId: 1, gameId: 1 },
      { 
        background: true,
        name: 'idx_achievements_profile_game' 
      }
    );
    
    logger.info('✓ Created compound index: idx_achievements_profile_game');
    logger.info('Achievement indexes created successfully');
  } catch (error: any) {
    // Index may already exist - log but don't fail
    if (error.code === 85 || error.code === 86) {
      logger.info('Achievement indexes already exist, skipping');
    } else {
      logger.error({ error }, 'Failed to create achievement indexes');
      throw error;
    }
  }
}
