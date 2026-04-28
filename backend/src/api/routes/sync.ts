import { FastifyRequest, FastifyReply } from 'fastify';
import { Profile, IProfile } from '../../models/profile.js';
import { SyncOperation } from '../../models/syncOperation.js';
import { SyncRun } from '../../models/syncRun.js';
import { syncService } from '../../services/syncService.js';
import { logger } from '../../utils/logger.js';
import { markSyncAsCancelled } from '../../services/syncCancellation.js';

interface SyncParams {
  platform: 'steam' | 'xbox' | 'playstation';
}

export async function triggerSync(
  req: FastifyRequest<{ Params: SyncParams; Querystring: { profileId?: string } }>,
  reply: FastifyReply
) {
  try {
    const { platform } = req.params;
    const { profileId } = req.query;

    // Validate platform
    if (!['steam', 'xbox', 'playstation'].includes(platform)) {
      return reply.status(400).send({ error: 'Invalid platform' });
    }

    // If profileId specified, sync only that profile (profileId is the MongoDB _id)
    if (profileId) {
      const profile = await Profile.findById(profileId);
      if (!profile) {
        return reply.status(404).send({ error: 'Profile not found' });
      }

      // Verify platform matches
      if (profile.platform !== platform) {
        return reply.status(400).send({ error: 'Platform mismatch' });
      }

      logger.info({ platform, profileId: profile.profileId, _id: profileId }, 'Starting sync for profile');
      // Fire and forget - errors are already logged in syncService
      syncService.syncProfile(profile).catch(() => {
        // Error already logged with full details in syncService
      });

      return reply.send({ message: 'Sync started', platform, profileId: profile.profileId });
    }

    // Otherwise, sync all profiles for the platform
    const profiles = await Profile.find({ platform });
    if (profiles.length === 0) {
      return reply.status(404).send({ error: 'No profiles found for platform' });
    }

    logger.info({ platform, count: profiles.length }, 'Starting sync for all profiles');
    profiles.forEach((profile) => {
      // Fire and forget - errors are already logged in syncService
      syncService.syncProfile(profile).catch(() => {
        // Error already logged with full details in syncService
      });
    });

    reply.send({ message: 'Sync started', platform, count: profiles.length });
  } catch (error) {
    logger.error({ error }, 'Failed to trigger sync');
    reply.status(500).send({ error: 'Internal server error' });
  }
}

/**
 * Get sync status for a profile
 */
export async function getSyncStatus(
  req: FastifyRequest<{ Querystring: { profileId?: string } }>,
  reply: FastifyReply
) {
  try {
    const { profileId } = req.query;

    let result: any = {};

    // If profileId specified, get status for that profile
    if (profileId) {
      // Find active sync operation
      const activeSyncOp = await SyncOperation.findOne({
        profileId,
        status: { $in: ['pending', 'running'] }
      }).sort({ startedAt: -1 });

      if (activeSyncOp) {
        // Calculate progress based on sync phase
        let progress = 0;
        let message = 'Preparing sync...';

        if (activeSyncOp.totalGames > 0) {
          // Phase 1: Downloading game images (0-33% progress)
          // imagesCompleted is incremented per-title as each image resolves.
          // gamesProcessed stays 0 until after all game images are fetched, so
          // this phase naturally ends when gamesProcessed is set to totalGames.
          if (activeSyncOp.gamesProcessed === 0) {
            const imgProgress = Math.floor((activeSyncOp.imagesCompleted / activeSyncOp.totalGames) * 33);
            progress = imgProgress;
            message = `Downloading game images... (${activeSyncOp.imagesCompleted}/${activeSyncOp.totalGames})`;
          }
          // Phase 2: Fetching achievements (33-66% progress)
          else if (activeSyncOp.gamesProcessed < activeSyncOp.totalGames) {
            const fetchProgress = Math.floor((activeSyncOp.gamesProcessed / activeSyncOp.totalGames) * 33);
            progress = 33 + fetchProgress;
            message = `Fetching achievements... (${activeSyncOp.gamesProcessed}/${activeSyncOp.totalGames})`;
          }
          // Phase 3: Downloading achievement icons — starting (66%)
          else if (activeSyncOp.iconDownloadsPending > 0 && activeSyncOp.iconDownloadsCompleted === 0) {
            progress = 66;
            message = `Fetching achievement icons... (0/${activeSyncOp.iconDownloadsPending})`;
          }
          // Phase 3: Downloading achievement icons — in progress (66-100%)
          else if (activeSyncOp.iconDownloadsPending > 0 && activeSyncOp.iconDownloadsCompleted < activeSyncOp.iconDownloadsPending) {
            const iconProgress = Math.floor((activeSyncOp.iconDownloadsCompleted / activeSyncOp.iconDownloadsPending) * 34);
            progress = 66 + iconProgress;
            message = `Fetching achievement icons... (${activeSyncOp.iconDownloadsCompleted}/${activeSyncOp.iconDownloadsPending})`;
          }
          // Transitional: games done but icons not yet queued — hold at 66%
          else if (activeSyncOp.iconDownloadsPending === 0 && activeSyncOp.status === 'running') {
            progress = 66;
            message = 'Processing achievements...';
          }
          // Phase 4: Finalizing
          else {
            progress = 100;
            message = 'Finalizing sync...';
          }
        }

        result.current = {
          operationId: activeSyncOp._id.toString(),
          status: activeSyncOp.status,
          progress,
          message
        };
      }

      // Get last completed sync run
      const lastSync = await SyncRun.findOne({
        profileId,
        status: { $in: ['success', 'failed'] }
      }).sort({ completedAt: -1 });

      if (lastSync) {
        result.lastCompleted = {
          completedAt: lastSync.completedAt.toISOString(),
          status: lastSync.status,
          error: lastSync.error
        };
      }
    } else {
      // Get status for all profiles
      const allActiveSyncs = await SyncOperation.find({
        status: { $in: ['pending', 'running'] }
      }).populate('profileId', 'platform displayName');

      result.activeSyncs = allActiveSyncs.map(op => ({
        operationId: op._id.toString(),
        profileId: op.profileId,
        platform: op.platform,
        status: op.status,
        startedAt: op.startedAt.toISOString()
      }));
    }

    reply.send(result);
  } catch (error) {
    logger.error({ error }, 'Failed to get sync status');
    reply.status(500).send({ error: 'Internal server error' });
  }
}

/**
 * Cancel sync operation
 */
export async function cancelSync(
  req: FastifyRequest<{ Params: { operationId: string } }>,
  reply: FastifyReply
) {
  try {
    const { operationId } = req.params;
    
    // Find the SyncOperation in MongoDB
    const syncOp = await SyncOperation.findById(operationId);
    
    if (!syncOp) {
      return reply.status(404).send({ error: 'Sync operation not found' });
    }

    if (syncOp.status === 'completed' || syncOp.status === 'failed' || syncOp.status === 'cancelled') {
      return reply.status(400).send({ error: 'Sync operation already finished' });
    }

    // Mark operation as cancelled
    markSyncAsCancelled(operationId);
    
    // Update SyncOperation status and record error
    syncOp.status = 'cancelled';
    syncOp.completedAt = new Date();
    syncOp.syncErrors.push({
      gameId: 'N/A',
      message: 'Sync cancelled by user',
      timestamp: new Date(),
    });
    await syncOp.save();

    // Record cancelled sync run
    await SyncRun.create({
      profileId: syncOp.profileId,
      platform: syncOp.platform,
      startedAt: syncOp.startedAt,
      completedAt: new Date(),
      status: 'failed',
      error: 'Cancelled by user',
    });

    logger.info({ operationId, profileId: syncOp.profileId }, '[Sync] Operation cancelled by user');
    reply.send({ message: 'Sync cancelled' });
  } catch (error) {
    logger.error({ error }, '[Sync] Failed to cancel operation');
    reply.status(500).send({ error: 'Failed to cancel sync operation' });
  }
}
