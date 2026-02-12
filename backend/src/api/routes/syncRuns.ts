import { FastifyInstance, FastifyRequest } from 'fastify';
import { SyncRun } from '../../models/syncRun.js';
import { Types } from 'mongoose';

interface SyncRunsQuery {
  profileId?: string;
  limit?: string;
}

export async function syncRunsRoutes(fastify: FastifyInstance) {
  // GET /api/sync/runs?profileId=...&limit=20
  fastify.get<{ Querystring: SyncRunsQuery }>(
    '/runs',
    async (request: FastifyRequest<{ Querystring: SyncRunsQuery }>, reply) => {
      try {
        const { profileId, limit = '20' } = request.query;

        const filter: any = {};
        if (profileId && Types.ObjectId.isValid(profileId)) {
          filter.profileId = new Types.ObjectId(profileId);
        }

        const runs = await SyncRun.find(filter)
          .sort({ startedAt: -1 })
          .limit(parseInt(limit, 10))
          .populate('profileId', 'platform profileId displayName');

        reply.send(runs);
      } catch (error) {
        fastify.log.error(error);
        reply.status(500).send({
          error: 'Failed to retrieve sync runs',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  // GET /api/sync/runs/:id - Get specific sync run
  fastify.get<{ Params: { id: string } }>(
    '/runs/:id',
    async (request, reply) => {
      try {
        const { id } = request.params;

        if (!Types.ObjectId.isValid(id)) {
          return reply.status(400).send({ error: 'Invalid sync run ID' });
        }

        const run = await SyncRun.findById(id).populate(
          'profileId',
          'platform profileId displayName'
        );

        if (!run) {
          return reply.status(404).send({ error: 'Sync run not found' });
        }

        reply.send(run);
      } catch (error) {
        fastify.log.error(error);
        reply.status(500).send({
          error: 'Failed to retrieve sync run',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );
}
