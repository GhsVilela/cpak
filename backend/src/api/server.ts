import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { fileURLToPath } from 'url';
import { config, getApiPort, getAllowedOrigins } from '../utils/config.js';
import { connectDB } from '../utils/db.js';
import { registerRoutes } from './routes/index.js';
import { schedulerService } from '../services/scheduler.js';
import { configService } from '../services/configService.js';
import { migrateAchievementIndexes } from '../migrations/add-achievement-indexes.js';
import { migrateGameIndexes } from '../migrations/add-game-indexes.js';

export interface BuildServerOptions {
  /** Skip DB connection (test setup manages its own connection) */
  skipDB?: boolean;
  /** Skip running migrations (skipped when skipDB is true) */
  skipMigrations?: boolean;
  /** Skip starting the scheduler */
  skipScheduler?: boolean;
  /** Skip configService.initializeDefaults() */
  skipInit?: boolean;
  /** Override logger config — pass false for silent logger in tests */
  logger?: boolean | object;
}

export async function buildServer(options: BuildServerOptions = {}): Promise<FastifyInstance> {
  const {
    skipDB = false,
    skipMigrations = false,
    skipScheduler = false,
    skipInit = false,
    logger = {
      level: process.env.LOG_LEVEL || 'info',
      transport: process.env.NODE_ENV !== 'production' ? {
        target: 'pino-pretty',
        options: { colorize: true },
      } : undefined,
    },
  } = options;

  const fastify = Fastify({ logger });

  // Register CORS
  await fastify.register(cors, {
    origin: getAllowedOrigins(),
    credentials: true,
  });

  // Register multipart for file uploads
  await fastify.register(multipart, {
    limits: {
      fileSize: 1024 * 1024 * 500, // 500 MB max file size
    },
  });

  if (!skipDB) {
    // Connect to MongoDB
    await connectDB();

    if (!skipMigrations) {
      // Run database migrations
      fastify.log.info('Running database migrations...');
      try {
        await migrateAchievementIndexes();
        await migrateGameIndexes();
        fastify.log.info('✓ Database migrations completed successfully');
      } catch (error) {
        fastify.log.error({ error }, '✗ Database migration failed');
        throw error;
      }
    }

    if (!skipInit) {
      // Initialize default settings (if not already in database)
      await configService.initializeDefaults();
      fastify.log.info('Configuration service initialized with defaults');
    }
  }

  // Register routes
  await fastify.register(registerRoutes, { prefix: config.API_BASE_PATH });

  if (!skipScheduler) {
    // Start scheduler for automatic syncs
    await schedulerService.start();
    fastify.log.info('Scheduler started for automatic profile syncs');
  }

  return fastify;
}

// Entry point — only execute when this module is run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = await buildServer();
  const port = getApiPort();
  const host = '0.0.0.0';

  try {
    await app.listen({ port, host });
    app.log.info(`Server listening on ${host}:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  process.on('SIGINT', async () => {
    app.log.info('SIGINT received, closing server...');
    schedulerService.stop();
    await app.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    app.log.info('SIGTERM received, closing server...');
    schedulerService.stop();
    await app.close();
    process.exit(0);
  });
}
