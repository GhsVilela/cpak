import { describe, it, expect } from 'vitest';
import { SyncRun } from '../../../src/models/syncRun.js';

describe('SyncRun model', () => {
  it('can be imported and is a valid mongoose model', () => {
    expect(SyncRun).toBeTruthy();
    expect(SyncRun.modelName).toBe('SyncRun');
  });

  it('has the expected schema paths', () => {
    const paths = Object.keys(SyncRun.schema.paths);
    expect(paths).toContain('platform');
    expect(paths).toContain('profileId');
    expect(paths).toContain('startedAt');
    expect(paths).toContain('completedAt');
    expect(paths).toContain('status');
    expect(paths).toContain('error');
  });

  it('platform field has correct enum values', () => {
    const platformPath = SyncRun.schema.path('platform') as any;
    expect(platformPath.enumValues).toEqual(['steam', 'xbox', 'playstation']);
  });

  it('status field has correct enum values', () => {
    const statusPath = SyncRun.schema.path('status') as any;
    expect(statusPath.enumValues).toEqual(['success', 'failed']);
  });

  it('creates a valid sync run document', () => {
    const now = new Date();
    const run = new SyncRun({
      platform: 'playstation',
      profileId: '507f1f77bcf86cd799439011',
      startedAt: now,
      completedAt: now,
      status: 'success',
    });
    expect(run.platform).toBe('playstation');
    expect(run.status).toBe('success');
    expect(run.error).toBeUndefined();
  });

  it('stores error message for failed runs', () => {
    const run = new SyncRun({
      platform: 'xbox',
      profileId: '507f1f77bcf86cd799439011',
      startedAt: new Date(),
      completedAt: new Date(),
      status: 'failed',
      error: 'Token expired',
    });
    expect(run.status).toBe('failed');
    expect(run.error).toBe('Token expired');
  });
});
