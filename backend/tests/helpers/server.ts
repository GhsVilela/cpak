import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/api/server.js';

let _server: FastifyInstance | null = null;

/**
 * Creates and returns a Fastify test server.
 * - DB is managed by setup.ts (MongoMemoryServer + mongoose.connect called in beforeAll)
 * - Scheduler and configService init are skipped to keep tests fast and isolated
 * - Logger is silenced
 *
 * Call `teardownTestServer()` in afterAll() to close the server.
 */
export async function createTestServer(): Promise<FastifyInstance> {
  if (_server) return _server;

  _server = await buildServer({
    skipDB: true,         // setup.ts owns the DB connection
    skipMigrations: true,
    skipScheduler: true,
    skipInit: true,
    logger: false,        // silent in test output
  });

  await _server.ready();
  return _server;
}

export async function teardownTestServer(): Promise<void> {
  if (_server) {
    await _server.close();
    _server = null;
  }
}
