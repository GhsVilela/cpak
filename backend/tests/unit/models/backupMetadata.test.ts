import { describe, it, expect } from 'vitest';
import { BackupMetadata } from '../../../src/models/backupMetadata.js';

describe('BackupMetadata model', () => {
  it('can be imported and is a valid mongoose model', () => {
    expect(BackupMetadata).toBeTruthy();
    expect(BackupMetadata.modelName).toBe('BackupMetadata');
  });

  it('has the expected schema paths', () => {
    const paths = Object.keys(BackupMetadata.schema.paths);
    expect(paths).toContain('type');
    expect(paths).toContain('status');
    expect(paths).toContain('createdAt');
    expect(paths).toContain('filePath');
    expect(paths).toContain('jobId');
    expect(paths).toContain('error');
  });

  it('type field has correct enum values', () => {
    const typePath = BackupMetadata.schema.path('type') as any;
    expect(typePath.enumValues).toEqual(expect.arrayContaining(['backup', 'restore']));
  });

  it('status field has correct enum values', () => {
    const statusPath = BackupMetadata.schema.path('status') as any;
    expect(statusPath.enumValues).toEqual(
      expect.arrayContaining(['in-progress', 'completed', 'failed'])
    );
  });
});
