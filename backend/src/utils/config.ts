import { z } from 'zod';

const configSchema = z.object({
  // Fixed internal ports for containerized deployment
  API_PORT: z.string().default('8080'),
  API_BASE_PATH: z.string().default('/api'),
  
  // Database configuration
  MONGO_URI: z.string().default('mongodb://localhost:27017/cpak'),
  MONGO_USERNAME: z.string().optional(),
  MONGO_PASSWORD: z.string().optional(),
  
  // CORS - auto-detect from request headers in container deployment
  ALLOWED_ORIGINS: z.string().default('*'),
  
  // Scheduler configuration (UI-configurable in future)
  SCHEDULER_ENABLED: z.string().default('false'),
  SCHEDULER_CRON: z.string().default('0 3 * * *'),
  SYNC_RATE_LIMIT_PER_MIN: z.string().default('60'),
  
  // Platform API keys (UI-configurable in future)
  STEAM_API_KEY: z.string().optional(),
  XBOX_CLIENT_ID: z.string().optional(),
  XBOX_CLIENT_SECRET: z.string().optional(),
  XBOX_REDIRECT_URI: z.string().optional(),
  PLAYSTATION_CLIENT_ID: z.string().optional(),
  PLAYSTATION_CLIENT_SECRET: z.string().optional(),
  PLAYSTATION_REDIRECT_URI: z.string().optional(),
  STEAMGRID_API_KEY: z.string().optional(),
  
  // Fixed internal path for containerized deployment
  IMAGES_DIR: z.string().default('/data/images'),
});

export type Config = z.infer<typeof configSchema>;

export const config: Config = configSchema.parse(process.env);

export function getApiPort(): number {
  return parseInt(config.API_PORT, 10);
}

export function getAllowedOrigins(): string[] {
  // In container deployment, accept all origins and validate via reverse proxy
  if (config.ALLOWED_ORIGINS === '*') {
    return ['*'];
  }
  return config.ALLOWED_ORIGINS.split(',').map(o => o.trim());
}

export function isSchedulerEnabled(): boolean {
  return config.SCHEDULER_ENABLED.toLowerCase() === 'true';
}
