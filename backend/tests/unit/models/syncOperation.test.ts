import { describe, it, expect } from 'vitest';
import { SyncOperation } from '../../../src/models/syncOperation.js';

describe('SyncOperation model', () => {
  it('can be imported and is a valid mongoose model', () => {
    expect(SyncOperation).toBeTruthy();
    expect(SyncOperation.modelName).toBe('SyncOperation');
  });

  it('has the expected schema paths', () => {
    const paths = Object.keys(SyncOperation.schema.paths);
    expect(paths).toContain('profileId');
    expect(paths).toContain('platform');
    expect(paths).toContain('status');
    expect(paths).toContain('startedAt');
    expect(paths).toContain('completedAt');
    expect(paths).toContain('totalGames');
    expect(paths).toContain('gamesProcessed');
    expect(paths).toContain('imagesCompleted');
    expect(paths).toContain('gamesFailed');
    expect(paths).toContain('totalAchievements');
    expect(paths).toContain('achievementsSynced');
    expect(paths).toContain('iconDownloadsPending');
    expect(paths).toContain('iconDownloadsCompleted');
    expect(paths).toContain('iconDownloadsFailed');
    expect(paths).toContain('syncErrors');
    expect(paths).toContain('adaptiveParams.batchSize');
    expect(paths).toContain('adaptiveParams.concurrency');
    expect(paths).toContain('adaptiveParams.delay');
  });

  it('platform field has correct enum values', () => {
    const platformPath = SyncOperation.schema.path('platform') as any;
    expect(platformPath.enumValues).toEqual(['steam', 'xbox', 'playstation']);
  });

  it('status field has correct enum values', () => {
    const statusPath = SyncOperation.schema.path('status') as any;
    expect(statusPath.enumValues).toEqual(['pending', 'running', 'completed', 'failed', 'cancelled']);
  });

  it('uses the correct collection name', () => {
    expect(SyncOperation.collection.name).toBe('sync_operations');
  });

  it('has indexes for profileId and status', () => {
    const indexes = SyncOperation.schema.indexes();
    const profileIndex = indexes.find((idx) => idx[0].profileId === 1 && idx[0].createdAt === -1);
    const statusIndex = indexes.find((idx) => idx[0].status === 1 && idx[0].startedAt === 1);
    expect(profileIndex).toBeTruthy();
    expect(statusIndex).toBeTruthy();
  });

  it('creates a valid sync operation document with defaults', () => {
    const op = new SyncOperation({
      profileId: '507f1f77bcf86cd799439011',
      platform: 'steam',
      status: 'running',
      startedAt: new Date(),
      adaptiveParams: { batchSize: 150, concurrency: 25, delay: 250 },
    });
    expect(op.platform).toBe('steam');
    expect(op.status).toBe('running');
    expect(op.totalGames).toBe(0);
    expect(op.gamesProcessed).toBe(0);
    expect(op.gamesFailed).toBe(0);
    expect(op.totalAchievements).toBe(0);
    expect(op.achievementsSynced).toBe(0);
    expect(op.iconDownloadsPending).toBe(0);
    expect(op.iconDownloadsCompleted).toBe(0);
    expect(op.iconDownloadsFailed).toBe(0);
  });

  it('stores adaptive params correctly', () => {
    const op = new SyncOperation({
      profileId: '507f1f77bcf86cd799439011',
      platform: 'xbox',
      status: 'pending',
      startedAt: new Date(),
      adaptiveParams: { batchSize: 100, concurrency: 10, delay: 500 },
    });
    expect(op.adaptiveParams.batchSize).toBe(100);
    expect(op.adaptiveParams.concurrency).toBe(10);
    expect(op.adaptiveParams.delay).toBe(500);
  });
});
