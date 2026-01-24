import { FastifyRequest, FastifyReply } from 'fastify';
import { getAllowedOrigins } from '../../utils/config.js';

export async function corsMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const allowedOrigins = getAllowedOrigins();
  const origin = request.headers.origin;

  if (origin && allowedOrigins.includes(origin)) {
    reply.header('Access-Control-Allow-Origin', origin);
  } else if (allowedOrigins.includes('*')) {
    reply.header('Access-Control-Allow-Origin', '*');
  }

  reply.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  reply.header('Access-Control-Allow-Credentials', 'true');

  if (request.method === 'OPTIONS') {
    reply.code(204).send();
  }
}
