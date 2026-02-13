import { FastifyRequest, FastifyReply } from 'fastify';
import { configService } from '../../services/configService.js';
import { SettingCategory } from '../../models/setting.js';
import { logger } from '../../utils/logger.js';
import { schedulerService } from '../../services/scheduler.js';
import { z } from 'zod';

// Request validation schemas
const updateSettingSchema = z.object({
  value: z.string().min(1).max(2048),
  category: z.nativeEnum(SettingCategory),
});

type UpdateSettingBody = z.infer<typeof updateSettingSchema>;

/**
 * GET /api/settings
 * Get all settings (secret values are hidden)
 */
export async function getAllSettings(
  req: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const settings = await configService.getAllSettings();
    
    // Omit value field for secret settings
    const masked = settings.map(setting => {
      const result: any = {
        key: setting.key,
        category: setting.category,
        isSecret: setting.isSecret,
      };
      
      // Only include value for non-secret settings
      if (!setting.isSecret) {
        result.value = setting.value;
      }
      
      return result;
    });

    reply.send({ settings: masked });
  } catch (error) {
    logger.error({ error }, '[Settings] Failed to fetch settings');
    reply.status(500).send({ error: 'Internal server error' });
  }
}

/**
 * GET /api/settings/:key
 * Get a specific setting (secret values are hidden)
 */
export async function getSetting(
  req: FastifyRequest<{ Params: { key: string } }>,
  reply: FastifyReply
) {
  try {
    const { key } = req.params;

    if (!key || !/^[a-z_]+$/.test(key)) {
      return reply.status(400).send({ error: 'Invalid setting key format' });
    }

    const setting = await configService.getSettingForDisplay(key);
    
    if (!setting) {
      // Return 404 if setting doesn't exist in database
      // (It might still exist as env var or default, but we only expose database settings)
      return reply.status(404).send({ error: 'Setting not found' });
    }

    reply.send(setting);
  } catch (error) {
    logger.error({ error, key: req.params.key }, '[Settings] Failed to fetch setting');
    reply.status(500).send({ error: 'Internal server error' });
  }
}

/**
 * PUT /api/settings/:key
 * Create or update a setting
 */
export async function updateSetting(
  req: FastifyRequest<{ Params: { key: string }; Body: UpdateSettingBody }>,
  reply: FastifyReply
) {
  try {
    const { key } = req.params;

    // Validate key format
    if (!key || !/^[a-z_]+$/.test(key)) {
      return reply.status(400).send({ error: 'Invalid setting key format (use lowercase with underscores)' });
    }

    // Validate body
    const validation = updateSettingSchema.safeParse(req.body);
    if (!validation.success) {
      return reply.status(400).send({ 
        error: 'Invalid request body', 
        details: validation.error.issues 
      });
    }

    const { value, category } = validation.data;

    // Update or create setting
    await configService.setSetting(key, value, category);

    // Reload scheduler if scheduler settings were updated
    if (key === 'scheduler_enabled' || key === 'scheduler_cron') {
      await schedulerService.reload();
      logger.info({ key, value }, '[Settings] Scheduler reloaded after settings update');
    }

    logger.info({ key, category }, '[Settings] Setting updated');

    reply.send({ 
      success: true, 
      message: `Setting '${key}' updated successfully` 
    });
  } catch (error) {
    logger.error({ error, key: req.params.key }, '[Settings] Failed to update setting');
    reply.status(500).send({ error: 'Internal server error' });
  }
}

/**
 * DELETE /api/settings/:key
 * Delete a setting (falls back to env var or default)
 */
export async function deleteSetting(
  req: FastifyRequest<{ Params: { key: string } }>,
  reply: FastifyReply
) {
  try {
    const { key } = req.params;

    // Validate key format
    if (!key || !/^[a-z_]+$/.test(key)) {
      return reply.status(400).send({ error: 'Invalid setting key format' });
    }

    const deleted = await configService.deleteSetting(key);

    if (!deleted) {
      return reply.status(404).send({ error: 'Setting not found' });
    }

    // Reload scheduler if scheduler settings were deleted
    if (key === 'scheduler_enabled' || key === 'scheduler_cron') {
      await schedulerService.reload();
      logger.info({ key }, '[Settings] Scheduler reloaded after settings deletion');
    }

    logger.info({ key }, '[Settings] Setting deleted');

    reply.send({ 
      success: true, 
      message: `Setting '${key}' deleted successfully` 
    });
  } catch (error) {
    logger.error({ error, key: req.params.key }, '[Settings] Failed to delete setting');
    reply.status(500).send({ error: 'Internal server error' });
  }
}
