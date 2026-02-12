import cron, { ScheduledTask } from 'node-cron';
import { syncService } from './syncService.js';
import { Profile } from '../models/profile.js';
import { logger } from '../utils/logger.js';

class SchedulerService {
  private task: ScheduledTask | null = null;
  private readonly cronExpression: string;

  constructor() {
    // Default: Daily at 3am UTC (0 3 * * *)
    this.cronExpression = process.env.SCHEDULER_CRON || '0 3 * * *';
  }

  /**
   * Start the scheduled sync task
   */
  start(): void {
    if (this.task) {
      logger.info('[Scheduler] Already running');
      return;
    }

    if (!cron.validate(this.cronExpression)) {
      logger.error(`[Scheduler] Invalid cron expression: ${this.cronExpression}`);
      return;
    }

    this.task = cron.schedule(this.cronExpression, async () => {
      logger.info('[Scheduler] Running scheduled sync for all profiles');
      await this.syncAllProfiles();
    });

    logger.info(`[Scheduler] Started with schedule: ${this.cronExpression}`);
  }

  /**
   * Stop the scheduled sync task
   */
  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      logger.info('[Scheduler] Stopped');
    }
  }

  /**
   * Sync all profiles sequentially
   */
  private async syncAllProfiles(): Promise<void> {
    try {
      const profiles = await Profile.find();
      
      if (profiles.length === 0) {
        logger.info('[Scheduler] No profiles to sync');
        return;
      }

      logger.info(`[Scheduler] Found ${profiles.length} profile(s) to sync`);

      for (const profile of profiles) {
        try {
          logger.info(`[Scheduler] Syncing ${profile.platform}:${profile.profileId}`);
          await syncService.syncProfile(profile);
          logger.info(`[Scheduler] Successfully synced ${profile.platform}:${profile.profileId}`);
        } catch (error) {
          logger.error(
            { error, platform: profile.platform, profileId: profile.profileId },
            `[Scheduler] Failed to sync ${profile.platform}:${profile.profileId}`
          );
          // Continue with next profile even if one fails
        }
      }

      logger.info('[Scheduler] Completed scheduled sync');
    } catch (error) {
      logger.error({ error }, '[Scheduler] Error during scheduled sync');
    }
  }

  /**
   * Run a manual sync for all profiles (useful for testing)
   */
  async runManualSync(): Promise<void> {
    logger.info('[Scheduler] Running manual sync');
    await this.syncAllProfiles();
  }
}

export const schedulerService = new SchedulerService();
