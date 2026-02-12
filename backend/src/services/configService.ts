import { Setting, SettingCategory } from '../models/setting.js';
import { config } from '../utils/config.js';

// Setting defaults
const DEFAULTS: Record<string, string> = {
  scheduler_enabled: 'false',
  scheduler_cron: '0 3 * * *',
  sync_batch_size: '10',
  image_download_concurrency: '5',
  sync_rate_limit_per_min: '60',
};

// Secret setting keys
const SECRET_KEYS = new Set([
  'steam_api_key',
  'xbox_client_id',
  'xbox_client_secret',
  'playstation_client_id',
  'playstation_client_secret',
  'steamgrid_api_key',
]);

/**
 * ConfigService - Manages application configuration with precedence:
 * 1. Database settings (highest priority)
 * 2. Environment variables (fallback)
 * 3. Default values (last resort)
 */
export class ConfigService {
  /**
   * Get a setting value with precedence: Database > Env Var > Default
   */
  async getSetting(key: string): Promise<string | undefined> {
    // 1. Check database first
    const dbSetting = await Setting.findOne({ key });
    if (dbSetting) {
      return dbSetting.getDecryptedValue();
    }

    // 2. Check environment variables
    const envKey = key.toUpperCase();
    const envValue = config[envKey as keyof typeof config];
    if (envValue !== undefined && envValue !== '') {
      return String(envValue);
    }

    // 3. Return default
    return DEFAULTS[key];
  }

  /**
   * Set a setting value (creates or updates)
   */
  async setSetting(
    key: string,
    value: string,
    category: SettingCategory,
    updatedBy: string = 'system'
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
        isSecret,
        updatedBy,
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
   * Get setting for display (masks secrets)
   */
  async getSettingForDisplay(key: string): Promise<{ key: string; value: string; isSecret: boolean } | null> {
    const dbSetting = await Setting.findOne({ key });
    if (!dbSetting) {
      return null;
    }

    const value = dbSetting.isSecret ? '********' : dbSetting.getDecryptedValue();

    return {
      key: dbSetting.key,
      value,
      isSecret: dbSetting.isSecret,
    };
  }

  /**
   * Initialize settings from environment variables on first run
   */
  async initializeFromEnvironment(): Promise<void> {
    const envMappings: Array<{ key: string; envKey: keyof typeof config; category: SettingCategory }> = [
      { key: 'steam_api_key', envKey: 'STEAM_API_KEY', category: SettingCategory.IMAGE_PROVIDER },
      { key: 'xbox_client_id', envKey: 'XBOX_CLIENT_ID', category: SettingCategory.IMAGE_PROVIDER },
      { key: 'xbox_client_secret', envKey: 'XBOX_CLIENT_SECRET', category: SettingCategory.IMAGE_PROVIDER },
      { key: 'playstation_client_id', envKey: 'PLAYSTATION_CLIENT_ID', category: SettingCategory.IMAGE_PROVIDER },
      { key: 'playstation_client_secret', envKey: 'PLAYSTATION_CLIENT_SECRET', category: SettingCategory.IMAGE_PROVIDER },
      { key: 'steamgrid_api_key', envKey: 'STEAMGRID_API_KEY', category: SettingCategory.IMAGE_PROVIDER },
      { key: 'scheduler_enabled', envKey: 'SCHEDULER_ENABLED', category: SettingCategory.SCHEDULER },
      { key: 'scheduler_cron', envKey: 'SCHEDULER_CRON', category: SettingCategory.SCHEDULER },
    ];

    for (const { key, envKey, category } of envMappings) {
      const existingSetting = await Setting.findOne({ key });
      if (!existingSetting) {
        const envValue = config[envKey];
        if (envValue !== undefined && envValue !== '') {
          await this.setSetting(key, String(envValue), category, 'environment');
          console.log(`[ConfigService] Imported ${key} from environment variable`);
        }
      }
    }

    // Set defaults for non-secret settings
    for (const [key, value] of Object.entries(DEFAULTS)) {
      const existingSetting = await Setting.findOne({ key });
      if (!existingSetting) {
        const category = key.startsWith('scheduler_') ? SettingCategory.SCHEDULER : SettingCategory.SYNC;
        await this.setSetting(key, value, category, 'system');
        console.log(`[ConfigService] Initialized ${key} with default value`);
      }
    }

    console.log('[ConfigService] Settings initialization complete');
  }
}

// Export singleton instance
export const configService = new ConfigService();
