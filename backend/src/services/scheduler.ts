import cron, { ScheduledTask } from 'node-cron';
import { syncService } from './syncService.js';
import { Profile } from '../models/profile.js';

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
      console.log('[Scheduler] Already running');
      return;
    }

    if (!cron.validate(this.cronExpression)) {
      console.error(`[Scheduler] Invalid cron expression: ${this.cronExpression}`);
      return;
    }

    this.task = cron.schedule(this.cronExpression, async () => {
      console.log('[Scheduler] Running scheduled sync for all profiles');
      await this.syncAllProfiles();
    });

    console.log(`[Scheduler] Started with schedule: ${this.cronExpression}`);
  }

  /**
   * Stop the scheduled sync task
   */
  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      console.log('[Scheduler] Stopped');
    }
  }

  /**
   * Sync all profiles sequentially
   */
  private async syncAllProfiles(): Promise<void> {
    try {
      const profiles = await Profile.find();
      
      if (profiles.length === 0) {
        console.log('[Scheduler] No profiles to sync');
        return;
      }

      console.log(`[Scheduler] Found ${profiles.length} profile(s) to sync`);

      for (const profile of profiles) {
        try {
          console.log(`[Scheduler] Syncing ${profile.platform}:${profile.profileId}`);
          await syncService.syncProfile(profile);
          console.log(`[Scheduler] Successfully synced ${profile.platform}:${profile.profileId}`);
        } catch (error) {
          console.error(
            `[Scheduler] Failed to sync ${profile.platform}:${profile.profileId}:`,
            error instanceof Error ? error.message : error
          );
          // Continue with next profile even if one fails
        }
      }

      console.log('[Scheduler] Completed scheduled sync');
    } catch (error) {
      console.error('[Scheduler] Error during scheduled sync:', error);
    }
  }

  /**
   * Run a manual sync for all profiles (useful for testing)
   */
  async runManualSync(): Promise<void> {
    console.log('[Scheduler] Running manual sync');
    await this.syncAllProfiles();
  }
}

export const schedulerService = new SchedulerService();
