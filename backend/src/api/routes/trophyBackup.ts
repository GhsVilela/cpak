import { FastifyRequest, FastifyReply } from 'fastify';
import { Types } from 'mongoose';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import { Profile } from '../../models/profile.js';
import { Game } from '../../models/game.js';
import { Achievement } from '../../models/achievement.js';
import {
  buildTrophyBackups,
  collectTrophyFilesFromUploadFile,
  TrophyBackupGame,
} from '../../services/ps5TrophyBackup.js';
import { imageStorage } from '../../utils/imageStorage.js';
import { logger } from '../../utils/logger.js';

/** Full console backups can easily exceed 500 MB — allow up to 4 GB. */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024 * 1024;
const UPLOAD_TEMP_DIR = path.join(os.tmpdir(), 'cpak-trophy-import');

/**
 * POST /playstation/trophy-backup/import?profileId=...
 *
 * Upload a PS5 trophy backup (ZIP containing /user/trophy2 and
 * /user/home/<uid>/trophy2, or a single TRPTITLE.DAT / TROPHY.UCP) and import
 * achievement data for games that are not already tracked for the profile.
 * Existing games are never modified — only missing ones are added.
 */
export async function importTrophyBackup(
  req: FastifyRequest<{ Querystring: { profileId?: string } }>,
  reply: FastifyReply
) {
  try {
    const { profileId } = req.query;
    if (!profileId) {
      return reply.status(400).send({ error: 'profileId query parameter is required' });
    }

    const profile = await Profile.findById(profileId);
    if (!profile) {
      return reply.status(404).send({ error: 'Profile not found' });
    }
    if (profile.platform !== 'playstation') {
      return reply
        .status(400)
        .send({ error: 'Trophy backup import is only available for PlayStation profiles' });
    }

    // @ts-ignore - multipart plugin adds file method to request
    const data = await req.file({ limits: { fileSize: MAX_UPLOAD_BYTES } });
    if (!data) {
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    const filename = data.filename || '';
    await fs.promises.mkdir(UPLOAD_TEMP_DIR, { recursive: true });
    const tempPath = path.join(
      UPLOAD_TEMP_DIR,
      `${randomUUID()}${path.extname(filename).toLowerCase()}`,
    );

    let uploads;
    try {
      await pipeline(data.file, createWriteStream(tempPath));

      const stats = await fs.promises.stat(tempPath);
      if (stats.size === 0) {
        return reply.status(400).send({ error: 'Uploaded file is empty' });
      }
      if (stats.size > MAX_UPLOAD_BYTES) {
        return reply.status(413).send({ error: 'File exceeds 4GB limit' });
      }

      logger.info(
        { profileId, filename, size: stats.size },
        '[TrophyBackup] Processing uploaded backup',
      );

      uploads = await collectTrophyFilesFromUploadFile(tempPath, filename);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if ((err as any)?.code === 'FST_REQ_FILE_TOO_LARGE') {
        return reply.status(413).send({
          error: 'Backup file is too large (maximum 4GB).',
        });
      }
      logger.warn({ profileId, filename, err: message }, '[TrophyBackup] Failed to read uploaded backup');
      return reply.status(400).send({ error: message });
    } finally {
      await fs.promises.unlink(tempPath).catch(() => undefined);
    }

    if (uploads.length === 0) {
      return reply.status(400).send({
        error:
          'No TRPTITLE.DAT or TROPHY.UCP files found in the upload. ' +
          'Upload a ZIP of your PS5 trophy2 folders (or a single DAT/UCP file).',
      });
    }

    const { games, errors } = buildTrophyBackups(uploads);

    if (games.length === 0) {
      return reply.status(400).send({
        error: 'No parsable trophy data found in the upload',
        details: errors,
      });
    }

    const imported: Array<{
      gameId: string;
      title: string;
      trophiesTotal: number;
      trophiesUnlocked: number;
    }> = [];
    const skipped: Array<{ gameId: string; reason: string }> = [];

    for (const backup of games) {
      // Never import games with zero unlocked trophies — skip them entirely.
      if (backup.earned === 0) {
        skipped.push({ gameId: backup.npwr, reason: 'no-unlocked-trophies' });
        continue;
      }

      const existing = await Game.findOne({
        profileId: profile._id,
        platform: 'playstation',
        gameId: backup.npwr,
      });
      if (existing) {
        skipped.push({ gameId: backup.npwr, reason: 'already-exists' });
        continue;
      }

      try {
        await importGameFromBackup(profile._id as Types.ObjectId, backup);
        imported.push({
          gameId: backup.npwr,
          title: backup.title,
          trophiesTotal: backup.total,
          trophiesUnlocked: backup.earned,
        });
      } catch (err) {
        errors.push({
          file: backup.npwr,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info(
      { profileId, imported: imported.length, skipped: skipped.length, errors: errors.length },
      '[TrophyBackup] Import finished',
    );

    reply.send({ imported, skipped, errors });
  } catch (error) {
    logger.error({ error }, '[TrophyBackup] Unexpected import error');
    reply.status(500).send({ error: 'Failed to import trophy backup' });
  }
}

async function importGameFromBackup(
  profileObjectId: Types.ObjectId,
  backup: TrophyBackupGame,
): Promise<void> {
  // Store icons first (failures are non-fatal — data matters more than images)
  let iconImagePath: string | undefined;
  if (backup.gameIconPng) {
    try {
      iconImagePath = await imageStorage.storeBuffer(
        backup.gameIconPng,
        'playstation',
        backup.npwr,
        'game',
        'icon',
      );
    } catch (err) {
      logger.warn({ gameId: backup.npwr, err: String(err) }, '[TrophyBackup] Failed to store game icon');
    }
  }

  const iconPathsById = new Map<number, string>();
  for (const [trophyId, png] of backup.trophyIcons) {
    try {
      const path = await imageStorage.storeBuffer(
        png,
        'playstation',
        backup.npwr,
        String(trophyId),
        'icon',
      );
      iconPathsById.set(trophyId, path);
    } catch (err) {
      logger.warn({ gameId: backup.npwr, trophyId, err: String(err) }, '[TrophyBackup] Failed to store trophy icon');
    }
  }

  const earnedBronze = backup.trophies.filter((t) => t.earned && t.grade === 'bronze').length;
  const earnedSilver = backup.trophies.filter((t) => t.earned && t.grade === 'silver').length;
  const earnedGold = backup.trophies.filter((t) => t.earned && t.grade === 'gold').length;
  const earnedPlatinum = backup.trophies.filter((t) => t.earned && t.grade === 'platinum').length;
  const lastUnlock = backup.trophies.reduce<Date | null>((latest, t) => {
    if (!t.unlockedAt) return latest;
    return !latest || t.unlockedAt > latest ? t.unlockedAt : latest;
  }, null);

  const game = await Game.create({
    platform: 'playstation',
    profileId: profileObjectId,
    gameId: backup.npwr,
    title: backup.title,
    achievementsTotal: backup.total,
    achievementsUnlocked: backup.earned,
    completionPercent: backup.total > 0 ? Math.round((backup.earned / backup.total) * 100) : 0,
    devices: ['PS5'], // T2PD/trophy2 backups originate from PS5 trophy data
    trophyBronze: earnedBronze,
    trophySilver: earnedSilver,
    trophyGold: earnedGold,
    trophyPlatinum: earnedPlatinum,
    ...(iconImagePath && { iconImagePath }),
    ...(lastUnlock && { lastPlayed: lastUnlock }),
    lastSyncedAt: new Date(),
  });

  if (backup.trophies.length > 0) {
    const bulkOps = backup.trophies.map((t) => {
      const iconPath = iconPathsById.get(t.id);
      return {
        updateOne: {
          filter: {
            platform: 'playstation' as const,
            profileId: profileObjectId,
            gameId: game._id,
            achievementId: String(t.id),
          },
          update: {
            $set: {
              platform: 'playstation' as const,
              profileId: profileObjectId,
              gameId: game._id,
              achievementId: String(t.id),
              name: t.name,
              description: t.description,
              unlockedAt: t.unlockedAt ?? undefined,
              ...(iconPath && { iconPath, iconGrayPath: iconPath }),
              trophyGrade: t.grade,
              isHidden: t.hidden,
            },
          },
          upsert: true,
        },
      };
    });
    await Achievement.bulkWrite(bulkOps);
  }
}
