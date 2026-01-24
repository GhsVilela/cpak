import { FastifyInstance } from 'fastify';
import { systemRoutes } from './system.js';
import { getProfiles, createProfile, updateProfile, deleteProfile } from './profiles.js';
import { triggerSync } from './sync.js';
import { getGames, getGameById } from './games.js';
import { getAchievements } from './achievements.js';
import { registerIconRoutes } from './icons.js';

export async function registerRoutes(fastify: FastifyInstance) {
  // Register system routes at root
  await fastify.register(systemRoutes);

  // Profiles API
  fastify.get('/profiles', getProfiles);
  fastify.post('/profiles', createProfile);
  fastify.patch('/profiles/:id', updateProfile);
  fastify.delete('/profiles/:id', deleteProfile);

  // Sync API
  fastify.post('/sync/:platform', triggerSync);

  // Games API
  fastify.get('/games', getGames);
  fastify.get('/games/:id', getGameById);

  // Achievements API
  fastify.get('/achievements', getAchievements);

  // Icons API
  await registerIconRoutes(fastify);
}
