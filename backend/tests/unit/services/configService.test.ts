import { describe, it, expect } from 'vitest';
import { configService } from '../../../src/services/configService.js';
import { SettingCategory } from '../../../src/models/setting.js';

// configService uses the Setting Mongoose model which is backed by MongoMemoryServer
// (set up globally by tests/setup.ts)

describe('ConfigService', () => {
  it('returns the default value for a known setting key', async () => {
    const value = await configService.getSetting('scheduler_cron');
    expect(value).toBe('0 3 * * *');
  });

  it('returns undefined for an unknown key with no default', async () => {
    const value = await configService.getSetting('totally_unknown_key');
    expect(value).toBeUndefined();
  });

  it('stores and retrieves a setting via setSetting/getSetting', async () => {
    await configService.setSetting('test_key', 'test_value', SettingCategory.GENERAL);
    const value = await configService.getSetting('test_key');
    expect(value).toBe('test_value');
  });

  it('overwrites an existing setting', async () => {
    await configService.setSetting('overwrite_key', 'original', SettingCategory.GENERAL);
    await configService.setSetting('overwrite_key', 'updated', SettingCategory.GENERAL);
    const value = await configService.getSetting('overwrite_key');
    expect(value).toBe('updated');
  });

  it('deleteSetting removes the setting from the database', async () => {
    await configService.setSetting('delete_key', 'to_delete', SettingCategory.GENERAL);
    const deleted = await configService.deleteSetting('delete_key');
    expect(deleted).toBe(true);
    const value = await configService.getSetting('delete_key');
    // Returns default or undefined since it was deleted
    expect(value).toBeUndefined();
  });

  it('deleteSetting returns false for non-existent key', async () => {
    const result = await configService.deleteSetting('nonexistent_key_xyz');
    expect(result).toBe(false);
  });

  it('getAllSettings returns an array', async () => {
    const settings = await configService.getAllSettings();
    expect(Array.isArray(settings)).toBe(true);
  });
});
