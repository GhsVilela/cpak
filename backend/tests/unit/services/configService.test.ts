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

  it('getSettingsByCategory returns settings for a given category', async () => {
    await configService.setSetting('cat_test_key', 'cat_test_val', SettingCategory.STEAM);
    const settings = await configService.getSettingsByCategory(SettingCategory.STEAM);
    expect(settings.some(s => s.key === 'cat_test_key')).toBe(true);
  });

  it('getSettingForDisplay returns null for non-existent key', async () => {
    const result = await configService.getSettingForDisplay('no_such_key_xyz');
    expect(result).toBeNull();
  });

  it('getSettingForDisplay returns non-secret setting with value', async () => {
    await configService.setSetting('display_test', 'visible', SettingCategory.GENERAL);
    const result = await configService.getSettingForDisplay('display_test');
    expect(result).not.toBeNull();
    expect(result!.value).toBe('visible');
    expect(result!.isSecret).toBe(false);
  });

  it('getSettingForDisplay hides value for secret settings', async () => {
    // 'steamgrid_api_key' is in SECRET_KEYS
    await configService.setSetting('steamgrid_api_key', 'my-api-key', SettingCategory.STEAM);
    const result = await configService.getSettingForDisplay('steamgrid_api_key');
    expect(result).not.toBeNull();
    expect(result!.isSecret).toBe(true);
    expect(result!.value).toBeUndefined();
  });

  it('getAllSettings masks secret setting values', async () => {
    await configService.setSetting('steamgrid_api_key', 'secret-val', SettingCategory.STEAM);
    const settings = await configService.getAllSettings();
    const secretSetting = settings.find(s => s.key === 'steamgrid_api_key');
    expect(secretSetting).toBeDefined();
    expect(secretSetting!.isSecret).toBe(true);
    expect(secretSetting!.value).toBe('');
  });

  it('getAllSettings returns plain value for non-secret settings', async () => {
    await configService.setSetting('scheduler_cron', '0 3 * * *', SettingCategory.SCHEDULER);
    const settings = await configService.getAllSettings();
    const setting = settings.find(s => s.key === 'scheduler_cron');
    expect(setting).toBeDefined();
    expect(setting!.isSecret).toBe(false);
    expect(setting!.value).toBe('0 3 * * *');
  });

  it('initializeDefaults creates default settings', async () => {
    // Delete all existing settings first
    const { Setting } = await import('../../../src/models/setting.js');
    await Setting.deleteMany({});
    
    await configService.initializeDefaults();
    
    // Default settings should now exist
    const schedulerEnabled = await configService.getSetting('scheduler_enabled');
    expect(schedulerEnabled).toBe('false');
    const schedulerCron = await configService.getSetting('scheduler_cron');
    expect(schedulerCron).toBe('0 3 * * *');
  });

  it('initializeDefaults does not overwrite existing settings', async () => {
    await configService.setSetting('scheduler_enabled', 'true', SettingCategory.SCHEDULER);
    await configService.initializeDefaults();
    const value = await configService.getSetting('scheduler_enabled');
    expect(value).toBe('true');
  });
});
