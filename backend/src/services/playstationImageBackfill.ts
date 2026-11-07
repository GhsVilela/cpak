import { Types } from 'mongoose';
import { Game } from '../models/game.js';
import { createPlayStationAdapter } from './adapters/playstation.js';
import { createSteamGridDBAdapter } from './adapters/steamgriddb.js';
import { logger } from '../utils/logger.js';

export interface PlayStationImageBackfillOptions {
  /** Only backfill these game ids (e.g. the games just imported from a backup). */
  gameIds?: string[];
  /** Skip these game ids (e.g. the ones the sync loop already handled). */
  excludeGameIds?: string[];
  /** Called after the set of games needing images is known. */
  onPlan?: (total: number) => Promise<void>;
  /** Called after each game has been processed. */
  onProgress?: (completed: number, total: number) => Promise<void>;
}

/**
 * Download cover art for PlayStation games that are missing it.
 *
 * The regular PlayStation sync only walks the titles returned by the PSN API.
 * Games that were imported from a trophy backup are not part of that response,
 * so they never get cover art — they would stay icon-less forever.
 *
 * This runs the exact same provider chain used by a normal sync
 * (SteamGridDB → IGDB → PlayStation CDN) for the requested games, so
 * backup-imported games end up looking like synced ones.
 *
 * @returns the number of games whose image paths were updated
 */
export async function backfillPlayStationGameImages(
  profileId: Types.ObjectId | string,
  options: PlayStationImageBackfillOptions = {},
): Promise<number> {
  const { gameIds, excludeGameIds } = options;

  const filter: Record<string, unknown> = {
    platform: 'playstation',
    profileId,
  };

  const gameIdFilter: Record<string, unknown> = {};
  if (gameIds && gameIds.length > 0) gameIdFilter.$in = gameIds;
  if (excludeGameIds && excludeGameIds.length > 0) gameIdFilter.$nin = excludeGameIds;
  if (Object.keys(gameIdFilter).length > 0) filter.gameId = gameIdFilter;

  const games = await Game.find(filter).select('gameId title capsuleImagePath heroImagePath');
  if (games.length === 0) return 0;

  // Nothing to do when both the cover art and hero are already in place.
  const pendingGames = games.filter((game) => !(game.capsuleImagePath && game.heroImagePath));
  if (pendingGames.length === 0) {
    if (options.onPlan) await options.onPlan(0);
    return 0;
  }

  if (options.onPlan) await options.onPlan(pendingGames.length);

  const adapter = createPlayStationAdapter();
  const steamGridDB = await createSteamGridDBAdapter();

  let updated = 0;
  let processed = 0;

  for (const game of pendingGames) {
    try {
      const imagePaths = await adapter.downloadGameImage(
        game.title,
        game.gameId,
        undefined,
        steamGridDB || undefined,
      );

      const update: Record<string, string> = {};
      if (imagePaths.capsuleImagePath) update.capsuleImagePath = imagePaths.capsuleImagePath;
      if (imagePaths.iconImagePath) update.iconImagePath = imagePaths.iconImagePath;
      if (imagePaths.heroImagePath) update.heroImagePath = imagePaths.heroImagePath;

      if (Object.keys(update).length > 0) {
        await Game.updateOne({ _id: game._id }, { $set: update });
        updated++;
        logger.info(
          { profileId: String(profileId), gameId: game.gameId, title: game.title },
          '[PlayStation] Downloaded images for game missing from the PSN response',
        );
      }
    } catch (err) {
      logger.warn(
        { err, profileId: String(profileId), gameId: game.gameId, title: game.title },
        '[PlayStation] Failed to download images for game missing from the PSN response',
      );
    }

    processed++;
    if (options.onProgress) {
      await options.onProgress(processed, pendingGames.length);
    }
  }

  return updated;
}
