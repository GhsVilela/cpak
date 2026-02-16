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
  
  // Fixed internal path for containerized deployment
  IMAGES_DIR: z.string().default('/app/data/images'),
  BACKUP_DIR: z.string().default('/app/data/backups')
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
