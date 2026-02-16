import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { config, getApiPort, getAllowedOrigins } from '../utils/config.js';
import { connectDB } from '../utils/db.js';
import { registerRoutes } from './routes/index.js';
import { schedulerService } from '../services/scheduler.js';
import { configService } from '../services/configService.js';

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV !== 'production' ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
      },
    } : undefined,
  },
});

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

// Connect to MongoDB
await connectDB();

// Initialize default settings (if not already in database)
await configService.initializeDefaults();
fastify.log.info('Configuration service initialized with defaults');

// Register routes
await fastify.register(registerRoutes, { prefix: config.API_BASE_PATH });

// Start scheduler for automatic syncs
await schedulerService.start();
fastify.log.info('Scheduler started for automatic profile syncs');

// Start server
const port = getApiPort();
const host = '0.0.0.0';

try {
  await fastify.listen({ port, host });
  fastify.log.info(`Server listening on ${host}:${port}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}

// Graceful shutdown
process.on('SIGINT', async () => {
  fastify.log.info('SIGINT received, closing server...');
  schedulerService.stop();
  await fastify.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  fastify.log.info('SIGTERM received, closing server...');
  schedulerService.stop();
  await fastify.close();
  process.exit(0);
});
