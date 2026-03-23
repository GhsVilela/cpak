import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { systemRoutes } from '../../../src/api/routes/system.js';

describe('System Routes', () => {
  it('GET /health returns status ok', async () => {
    const fastify = Fastify();
    await fastify.register(systemRoutes);

    const response = await fastify.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ status: 'ok' });

    await fastify.close();
  });

  it('GET /version returns version string', async () => {
    const fastify = Fastify();
    await fastify.register(systemRoutes);

    const response = await fastify.inject({ method: 'GET', url: '/version' });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).version).toBeDefined();

    await fastify.close();
  });
});
