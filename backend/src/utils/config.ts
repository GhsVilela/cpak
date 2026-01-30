import { z } from 'zod';

const configSchema = z.object({
  API_PORT: z.string().default('8080'),
  API_BASE_PATH: z.string().default('/api'),
  MONGO_URI: z.string().default('mongodb://localhost:27017'),
  MONGO_DB: z.string().default('cpak'),
  MONGO_USERNAME: z.string().optional(),
  MONGO_PASSWORD: z.string().optional(),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  SCHEDULER_ENABLED: z.string().default('false'),
  SCHEDULER_CRON: z.string().default('0 3 * * *'),
  SYNC_RATE_LIMIT_PER_MIN: z.string().default('60'),
  STEAM_API_KEY: z.string().optional(),
  XBOX_CLIENT_ID: z.string().optional(),
  XBOX_CLIENT_SECRET: z.string().optional(),
  XBOX_REDIRECT_URI: z.string().optional(),
  PLAYSTATION_CLIENT_ID: z.string().optional(),
  PLAYSTATION_CLIENT_SECRET: z.string().optional(),
  PLAYSTATION_REDIRECT_URI: z.string().optional(),
  STEAMGRID_API_KEY: z.string().optional(),
});

export type Config = z.infer<typeof configSchema>;

export const config: Config = configSchema.parse(process.env);

export function getApiPort(): number {
  return parseInt(config.API_PORT, 10);
}

export function getAllowedOrigins(): string[] {
  return config.ALLOWED_ORIGINS.split(',').map(o => o.trim());
}

export function isSchedulerEnabled(): boolean {
  return config.SCHEDULER_ENABLED.toLowerCase() === 'true';
}
