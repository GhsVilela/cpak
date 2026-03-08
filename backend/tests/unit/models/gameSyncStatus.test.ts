import { describe, it, expect } from 'vitest';
import { GameSyncStatus } from '../../../src/models/gameSyncStatus.js';

describe('GameSyncStatus model', () => {
  it('can be imported and is a valid mongoose model', () => {
    expect(GameSyncStatus).toBeTruthy();
    expect(GameSyncStatus.modelName).toBe('GameSyncStatus');
  });

  it('has the expected schema paths', () => {
    const paths = Object.keys(GameSyncStatus.schema.paths);
    expect(paths).toContain('syncOperationId');
    expect(paths).toContain('profileId');
    expect(paths).toContain('gameId');
    expect(paths).toContain('gameName');
    expect(paths).toContain('status');
    expect(paths).toContain('totalAchievements');
    expect(paths).toContain('achievementsSynced');
    expect(paths).toContain('iconsDownloaded');
    expect(paths).toContain('iconsFailed');
    expect(paths).toContain('startedAt');
    expect(paths).toContain('completedAt');
    expect(paths).toContain('error');
  });

  it('status field has correct enum values', () => {
    const statusPath = GameSyncStatus.schema.path('status') as any;
    expect(statusPath.enumValues).toEqual(['pending', 'syncing', 'completed', 'failed']);
  });

  it('uses the correct collection name', () => {
    expect(GameSyncStatus.collection.name).toBe('game_sync_statuses');
  });
});
