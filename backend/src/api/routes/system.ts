import { FastifyInstance } from 'fastify';

const VERSION = '0.1.0';

export async function systemRoutes(fastify: FastifyInstance) {
  fastify.get('/health', async (request, reply) => {
    reply.send({ status: 'ok' });
  });

  fastify.get('/version', async (request, reply) => {
    reply.send({ version: VERSION });
  });
}
