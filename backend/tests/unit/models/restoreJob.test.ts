import { describe, it, expect } from 'vitest';
import { RestoreJob } from '../../../src/models/restoreJob.js';

describe('RestoreJob model', () => {
  it('can be imported and is a valid mongoose model', () => {
    expect(RestoreJob).toBeTruthy();
    expect(RestoreJob.modelName).toBe('RestoreJob');
  });

  it('has the expected schema paths', () => {
    const paths = Object.keys(RestoreJob.schema.paths);
    expect(paths).toContain('status');
    expect(paths).toContain('totalRecords');
    expect(paths).toContain('recordsRestored');
    expect(paths).toContain('totalImages');
    expect(paths).toContain('imagesRestored');
    expect(paths).toContain('mode');
    expect(paths).toContain('warnings');
  });

  it('status field has correct enum values', () => {
    const statusPath = RestoreJob.schema.path('status') as any;
    expect(statusPath.enumValues).toEqual(
      expect.arrayContaining(['uploading', 'extracting', 'validating', 'restoring', 'completed', 'failed'])
    );
  });

  it('mode field has correct enum values', () => {
    const modePath = RestoreJob.schema.path('mode') as any;
    expect(modePath.enumValues).toEqual(expect.arrayContaining(['merge', 'replace']));
  });

  it('uses the correct collection name', () => {
    expect(RestoreJob.collection.name).toBe('restore_jobs');
  });
});
