import { Setting, SettingCategory } from '../models/setting.js';
import { config } from '../utils/config.js';

// Setting defaults
const DEFAULTS: Record<string, string> = {
  scheduler_enabled: 'false',
  scheduler_cron: '0 3 * * *',
  sync_batch_size: '20',
  sync_image_concurrency: '10'
};

// Secret setting keys
const SECRET_KEYS = new Set([
  'steamgrid_api_key',
]);

/**
 * ConfigService - Manages application configuration with precedence:
 * 1. Database settings (highest priority)
 * 2. Default values (fallback for non-secret settings)
 * 
 * Note: API keys and credentials are only configured through the UI
 */
export class ConfigService {
  /**
   * Get a setting value with precedence: Database > Default
   * Secret settings (API keys) are only available from database
   */
  async getSetting(key: string): Promise<string | undefined> {
    // 1. Check database first
    const dbSetting = await Setting.findOne({ key });
    if (dbSetting) {
      return dbSetting.getDecryptedValue();
    }

    // 2. Return default (only for non-secret settings)
    return DEFAULTS[key];
  }

  /**
   * Set a setting value (creates or updates)
   */
  async setSetting(
    key: string,
    value: string,
    category: SettingCategory
  ): Promise<void> {
    const isSecret = SECRET_KEYS.has(key);

    // Encrypt if secret
    const storedValue = isSecret ? Setting.encryptValue(value) : value;

    // Upsert setting
    await Setting.findOneAndUpdate(
      { key },
      {
        value: storedValue,
        category,
        isSecret
      },
      {
        upsert: true,
        new: true,
      }
    );
  }

  /**
   * Delete a setting
   */
  async deleteSetting(key: string): Promise<boolean> {
    const result = await Setting.deleteOne({ key });
    return result.deletedCount > 0;
  }

  /**
   * Get all settings by category (with decryption)
   */
  async getSettingsByCategory(category: SettingCategory): Promise<Array<{ key: string; value: string; isSecret: boolean }>> {
    const settings = await Setting.find({ category });
    return settings.map(setting => ({
      key: setting.key,
      value: setting.getDecryptedValue(),
      isSecret: setting.isSecret,
    }));
  }

  /**
   * Get all settings (with decryption)
   */
  async getAllSettings(): Promise<Array<{ key: string; value: string; category: string; isSecret: boolean }>> {
    const settings = await Setting.find();
    return settings.map(setting => ({
      key: setting.key,
      value: setting.getDecryptedValue(),
      category: setting.category,
      isSecret: setting.isSecret,
    }));
  }

  /**
   * Get setting for display (omits secret values)
   */
  async getSettingForDisplay(key: string): Promise<{ key: string; value?: string; isSecret: boolean } | null> {
    const dbSetting = await Setting.findOne({ key });
    if (!dbSetting) {
      return null;
    }

    // Omit value field entirely for secrets
    const result: { key: string; value?: string; isSecret: boolean } = {
      key: dbSetting.key,
      isSecret: dbSetting.isSecret,
    };

    if (!dbSetting.isSecret) {
      result.value = dbSetting.getDecryptedValue();
    }

    return result;
  }

  /**
   * Initialize default settings on first run
   * Note: API keys and credentials are only configured through the UI
   */
  async initializeDefaults(): Promise<void> {
    // Set defaults for non-secret settings only
    for (const [key, value] of Object.entries(DEFAULTS)) {
      const existingSetting = await Setting.findOne({ key });
      if (!existingSetting) {
        const category = key.startsWith('scheduler_') ? SettingCategory.SCHEDULER : SettingCategory.SYNC;
        await this.setSetting(key, value, category);
        console.log(`[ConfigService] Initialized ${key} with default value: ${value}`);
      }
    }

    console.log('[ConfigService] Settings initialization complete');
  }
}

// Export singleton instance
export const configService = new ConfigService();
