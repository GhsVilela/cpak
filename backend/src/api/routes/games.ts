import { FastifyRequest, FastifyReply } from 'fastify';
import { Game } from '../../models/game.js';
import { Profile } from '../../models/profile.js';
import { logger } from '../../utils/logger.js';

interface GamesQuery {
  platform?: 'steam' | 'xbox' | 'playstation';
  profileId?: string;
  onlyCompleted?: string;
}

export async function getGames(
  req: FastifyRequest<{ Querystring: GamesQuery }>,
  reply: FastifyReply
) {
  try {
    const { platform, profileId, onlyCompleted } = req.query;

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

    const games = await Game.find(filter)
      .sort({ title: 1 })
      .lean();

    reply.send(games);
  } catch (error) {
    logger.error({ error }, 'Failed to fetch games');
    reply.status(500).send({ error: 'Internal server error' });
  }
}

export async function getGameById(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  try {
    const { id } = req.params;
    const game = await Game.findById(id).lean();
    
    if (!game) {
      return reply.status(404).send({ error: 'Game not found' });
    }

    reply.send(game);
  } catch (error) {
    logger.error({ error }, 'Failed to fetch game');
    reply.status(500).send({ error: 'Internal server error' });
  }
}
