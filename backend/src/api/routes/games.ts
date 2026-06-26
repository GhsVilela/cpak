import { FastifyRequest, FastifyReply } from 'fastify';
import { Game } from '../../models/game.js';
import { Profile } from '../../models/profile.js';
import { logger } from '../../utils/logger.js';

interface GamesQuery {
  platform?: 'steam' | 'xbox' | 'playstation';
  profileId?: string;
  onlyCompleted?: string;
  excludeHidden?: string;
  limit?: string;
  offset?: string;
  sortBy?: string;
  sortOrder?: string;
  /** Console generation / platform filter for Xbox games: Xbox360 | XboxOne | XboxSeries | PC | PlayAnywhere | ConsoleOnly */
  device?: string;
}

export async function getGames(
  req: FastifyRequest<{ Querystring: GamesQuery }>,
  reply: FastifyReply
) {
  try {
    const { 
      platform, 
      profileId, 
      onlyCompleted, 
      excludeHidden,
      limit = '50', 
      offset = '0',
      sortBy = 'title',
      sortOrder = 'asc',
      device,
    } = req.query;

    // Parse and validate pagination params
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500); // Max 500
    const offsetNum = Math.max(parseInt(offset, 10) || 0, 0);

    const filter: any = {};

    // Filter by platform
    if (platform) {
      if (!['steam', 'xbox', 'playstation'].includes(platform)) {
        return reply.status(400).send({ error: 'Invalid platform' });
      }
      filter.platform = platform;
    }

    // Filter by profileId
    if (profileId) {
      const profile = await Profile.findById(profileId);
      if (!profile) {
        return reply.status(404).send({ error: 'Profile not found' });
      }
      filter.profileId = profile._id;
    }

    // Filter by completion (100% only)
    if (onlyCompleted === 'true') {
      filter.completionPercent = 100;
    }

    // Exclude hidden games (revoked licenses: played_history + achievementsFetchFailed)
    if (excludeHidden === 'true') {
      filter.$or = [
        { ownershipSource: { $ne: 'played_history' } },
        { achievementsFetchFailed: { $ne: true } },
      ];
    }

    // Filter by console generation / platform (Xbox only — matches devices[] array field)
    if (device === 'PlayAnywhere') {
      // Games available on both PC and at least one Xbox console
      filter.$and = [
        { devices: 'PC' },
        { devices: { $in: ['XboxSeries', 'XboxOne', 'Xbox360'] } },
      ];
    } else if (device === 'ConsoleOnly') {
      // Games on Xbox consoles but NOT on PC
      filter.$and = [
        { devices: { $in: ['XboxSeries', 'XboxOne', 'Xbox360'] } },
        { devices: { $nin: ['PC'] } },
      ];
    } else if (device) {
      // Inclusive match: games that include this platform (e.g. XboxSeries includes Play Anywhere)
      filter.devices = device;
    }

    // Validate and build sort object
    const validSortFields = ['title', 'completionPercent', 'lastSyncedAt', 'achievementsTotal', 'currentGamerscore'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'title';
    const sortDirection = sortOrder === 'desc' ? -1 : 1;

    // Get total count for pagination metadata
    const totalCount = await Game.countDocuments(filter);

    // For Xbox profiles, aggregate total gamerscore across all games (not just current page)
    let totalCurrentGamerscore: number | undefined;
    let totalMaxGamerscore: number | undefined;
    if (filter.platform === 'xbox' && filter.profileId) {
      const gsAgg = await Game.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            totalCurrentGamerscore: { $sum: { $ifNull: ['$currentGamerscore', 0] } },
            totalMaxGamerscore: { $sum: { $ifNull: ['$maxGamerscore', 0] } },
          },
        },
      ]);
      if (gsAgg.length > 0) {
        totalCurrentGamerscore = gsAgg[0].totalCurrentGamerscore;
        totalMaxGamerscore = gsAgg[0].totalMaxGamerscore;
      }
    }

    // For Steam profiles, aggregate total achievements unlocked across all games
    let totalAchievementsUnlocked: number | undefined;
    if (filter.platform === 'steam' && filter.profileId) {
      const achAgg = await Game.aggregate([
        { $match: filter },
        { $group: { _id: null, total: { $sum: { $ifNull: ['$achievementsUnlocked', 0] } } } },
      ]);
      if (achAgg.length > 0) {
        totalAchievementsUnlocked = achAgg[0].total;
      }
    }

    // For PlayStation profiles, aggregate trophy summary across all games
    let trophySummary: { totalBronze: number; totalSilver: number; totalGold: number; totalPlatinum: number } | undefined;
    if (filter.platform === 'playstation' && filter.profileId) {
      const trophyAgg = await Game.aggregate([
        { $match: { profileId: filter.profileId, platform: 'playstation' } },
        {
          $group: {
            _id: null,
            totalBronze: { $sum: { $ifNull: ['$trophyBronze', 0] } },
            totalSilver: { $sum: { $ifNull: ['$trophySilver', 0] } },
            totalGold: { $sum: { $ifNull: ['$trophyGold', 0] } },
            totalPlatinum: { $sum: { $ifNull: ['$trophyPlatinum', 0] } },
          },
        },
      ]);
      if (trophyAgg.length > 0) {
        trophySummary = {
          totalBronze: trophyAgg[0].totalBronze,
          totalSilver: trophyAgg[0].totalSilver,
          totalGold: trophyAgg[0].totalGold,
          totalPlatinum: trophyAgg[0].totalPlatinum,
        };
      }
    }

    // When sorting by completionPercent, use achievementsUnlocked as tiebreaker
    // so that games with 1 unlocked (0%) sort above games with 0 unlocked (0%)
    const sortSpec: Record<string, 1 | -1> = { [sortField]: sortDirection as 1 | -1 };
    if (sortField === 'completionPercent') {
      sortSpec.achievementsUnlocked = sortDirection as 1 | -1;
    }

    const games = await Game.find(filter)
      .collation({ locale: 'en', strength: 2 }) // Case-insensitive sorting
      .sort(sortSpec)
      .limit(limitNum)
      .skip(offsetNum)
      .lean();

    reply.send({
      data: games,
      pagination: {
        total: totalCount,
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + games.length < totalCount,
        ...(totalCurrentGamerscore !== undefined && { totalCurrentGamerscore }),
        ...(totalMaxGamerscore !== undefined && { totalMaxGamerscore }),
        ...(totalAchievementsUnlocked !== undefined && { totalAchievementsUnlocked }),
        ...(trophySummary !== undefined && { trophySummary }),
      }
    });
  } catch (error) {
    logger.error({ error }, 'Failed to fetch games');
    reply.status(500).send({ error: 'Internal server error' });
  }
}

export async function getGameById(
  req: FastifyRequest<{ Params: { id: string }; Querystring: { platform?: string; profileId?: string } }>,
  reply: FastifyReply
) {
  try {
    const { id } = req.params;
    const { platform, profileId } = req.query;

    let game;
    
    // If platform is provided, search by gameId and platform
    // Otherwise, assume id is MongoDB _id for backward compatibility
    if (platform) {
      const filter: any = { gameId: id, platform };
      
      // If profileId is provided, filter by it to ensure we get the correct profile's game
      if (profileId) {
        const profile = await Profile.findById(profileId);
        if (!profile) {
          return reply.status(404).send({ error: 'Profile not found' });
        }
        filter.profileId = profile._id;
      }
      
      game = await Game.findOne(filter).lean();
    } else {
      game = await Game.findById(id).lean();
    }
    
    if (!game) {
      return reply.status(404).send({ error: 'Game not found' });
    }

    reply.send(game);
  } catch (error) {
    logger.error({ error }, 'Failed to fetch game');
    reply.status(500).send({ error: 'Internal server error' });
  }
}
