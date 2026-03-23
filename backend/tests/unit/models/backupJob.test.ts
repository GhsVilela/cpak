import { describe, it, expect } from 'vitest';
import { BackupJob } from '../../../src/models/backupJob.js';

describe('BackupJob model', () => {
  it('can be imported and is a valid mongoose model', () => {
    expect(BackupJob).toBeTruthy();
    expect(BackupJob.modelName).toBe('BackupJob');
  });

  it('has the expected schema paths', () => {
    const paths = Object.keys(BackupJob.schema.paths);
    expect(paths).toContain('status');
    expect(paths).toContain('totalRecords');
    expect(paths).toContain('recordsProcessed');
    expect(paths).toContain('fileSize');
    expect(paths).toContain('collections');
    expect(paths).toContain('expiresAt');
  });

  it('status field has correct enum values', () => {
    const statusPath = BackupJob.schema.path('status') as any;
    expect(statusPath.enumValues).toEqual(
      expect.arrayContaining(['preparing', 'compressing', 'ready', 'failed', 'expired'])
    );
  });

  it('uses the correct collection name', () => {
    expect(BackupJob.collection.name).toBe('backup_jobs');
  });
});
