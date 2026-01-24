import { FastifyRequest, FastifyReply } from 'fastify';
import { Achievement } from '../../models/achievement.js';
import { Game } from '../../models/game.js';
import { logger } from '../../utils/logger.js';

interface AchievementsQuery {
  gameId?: string;
  profileId?: string;
}

export async function getAchievements(
  req: FastifyRequest<{ Querystring: AchievementsQuery }>,
  reply: FastifyReply
) {
  try {
    const { gameId, profileId } = req.query;

    const filter: any = {};

    if (gameId) {
      const game = await Game.findById(gameId);
      if (!game) {
        return reply.status(404).send({ error: 'Game not found' });
      }
      filter.gameId = game._id;
    }

    if (profileId) {
      filter.profileId = profileId;
    }

    const achievements = await Achievement.find(filter)
      .sort({ unlocked: -1, name: 1 })
      .lean();

    reply.send(achievements);
  } catch (error) {
    logger.error({ error }, 'Failed to fetch achievements');
    reply.status(500).send({ error: 'Internal server error' });
  }
}
