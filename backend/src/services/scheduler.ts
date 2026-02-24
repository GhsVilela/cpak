import cron, { ScheduledTask } from 'node-cron';
import { syncService } from './syncService.js';
import { Profile } from '../models/profile.js';
import { BackupJob } from '../models/backupJob.js';
import { RestoreJob } from '../models/restoreJob.js';
import { logger } from '../utils/logger.js';
import { configService } from './configService.js';

class SchedulerService {
  private task: ScheduledTask | null = null;
  private cleanupTask: ScheduledTask | null = null;
  private cronExpression: string;
  private cleanupCronExpression: string;

  constructor() {
    // Default: Daily at 3am UTC (0 3 * * *)
    this.cronExpression = '0 3 * * *';
    // Default: Daily at 2am UTC for cleanup (0 2 * * *)
    this.cleanupCronExpression = '0 2 * * *';
    this.loadConfiguration();
  }

  private async loadConfiguration(): Promise<void> {
    try {
      // Load scheduler cron from database settings (defaults handled by configService)
      this.cronExpression = await configService.getSetting('scheduler_cron') || '0 3 * * *';
    } catch (error) {
      logger.debug({ error }, 'Failed to load scheduler configuration from settings, using defaults');
      this.cronExpression = '0 3 * * *';
    }
  }

  /**
   * Start the scheduled sync task
   */
  async start(): Promise<void> {
    // Reload configuration from database on start
    await this.loadConfiguration();
    
    // Start cleanup scheduler (always runs, independent of sync scheduler)
    this.startCleanupScheduler();
    
    // Check if profile sync scheduler is enabled
    const isEnabled = await configService.getSetting('scheduler_enabled');
    if (isEnabled === 'false' || isEnabled === undefined) {
      logger.info('[Scheduler] Profile sync disabled - cleanup scheduler still running');
      return;
    }
    
    if (this.task) {
      logger.info('[Scheduler] Profile sync already running');
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

    logger.info(`[Scheduler] Profile sync configured with schedule: ${this.cronExpression}`);
  }

  /**
   * Start the cleanup scheduler for expired jobs
   */
  private startCleanupScheduler(): void {
    if (this.cleanupTask) {
      logger.debug('[Scheduler] Cleanup task already running');
      return;
    }

    if (!cron.validate(this.cleanupCronExpression)) {
      logger.error(`[Scheduler] Invalid cleanup cron expression: ${this.cleanupCronExpression}`);
      return;
    }

    this.cleanupTask = cron.schedule(this.cleanupCronExpression, async () => {
      logger.info('[Scheduler] Running cleanup tasks');
      await this.cleanupExpiredJobs();
    });

    logger.info(`[Scheduler] Cleanup task configured with schedule: ${this.cleanupCronExpression}`);
  }

  /**
   * Reload scheduler configuration and restart if necessary
   * Call this after scheduler settings are updated in the UI
   */
  async reload(): Promise<void> {
    logger.info('[Scheduler] Reloading configuration');
    
    // Stop existing task if running
    this.stop();
    
    // Start with new configuration (will check enabled state)
    await this.start();
  }

  /**
   * Stop the scheduled sync task
   */
  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      logger.info('[Scheduler] Profile sync stopped');
    }
    
    if (this.cleanupTask) {
      this.cleanupTask.stop();
      this.cleanupTask = null;
      logger.info('[Scheduler] Cleanup task stopped');
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

  /**
   * T050 & T051: Run cleanup jobs for expired BackupJob and orphaned RestoreJob records
   */
  private async cleanupExpiredJobs(): Promise<void> {
    try {
      await this.cleanupExpiredBackupJobs();
      await this.cleanupOrphanedRestoreJobs();
      logger.info('[Scheduler] Cleanup tasks completed');
    } catch (error) {
      logger.error({ error }, '[Scheduler] Error during cleanup tasks');
    }
  }

  /**
   * T050: Clean up expired BackupJob records (24 hours after creation)
   * Note: MongoDB TTL index handles this automatically, but this provides manual fallback
   */
  private async cleanupExpiredBackupJobs(): Promise<void> {
    try {
      const now = new Date();
      const result = await BackupJob.deleteMany({
        expiresAt: { $lt: now },
      });

      if (result.deletedCount > 0) {
        logger.info(
          { deletedCount: result.deletedCount },
          '[Scheduler] Cleaned up expired BackupJob records'
        );
      } else {
        logger.debug('[Scheduler] No expired BackupJob records to clean up');
      }
    } catch (error) {
      logger.error({ error }, '[Scheduler] Error cleaning up expired BackupJob records');
    }
  }

  /**
   * T051: Clean up orphaned RestoreJob records older than 7 days
   */
  private async cleanupOrphanedRestoreJobs(): Promise<void> {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const result = await RestoreJob.deleteMany({
        createdAt: { $lt: sevenDaysAgo },
      });

      if (result.deletedCount > 0) {
        logger.info(
          { deletedCount: result.deletedCount },
          '[Scheduler] Cleaned up orphaned RestoreJob records older than 7 days'
        );
      } else {
        logger.debug('[Scheduler] No orphaned RestoreJob records to clean up');
      }
    } catch (error) {
      logger.error({ error }, '[Scheduler] Error cleaning up orphaned RestoreJob records');
    }
  }
}

export const schedulerService = new SchedulerService();
