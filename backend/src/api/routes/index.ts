import { FastifyInstance } from 'fastify';
import { systemRoutes } from './system.js';
import { getProfiles, getProfileById, createProfile, updateProfile, deleteProfile } from './profiles.js';
import { triggerSync } from './sync.js';
import { getGames, getGameById } from './games.js';
import { getAchievements } from './achievements.js';
import { registerIconRoutes } from './icons.js';
import { syncRunsRoutes } from './syncRuns.js';
import { getSettings, updateSettings } from './settings.js';
import { exportData, importData } from './exportImport.js';

export async function registerRoutes(fastify: FastifyInstance) {
  // Register system routes at root
  await fastify.register(systemRoutes);

  // Profiles API
  fastify.get('/profiles', getProfiles);
  fastify.get('/profiles/:id', getProfileById);
  fastify.post('/profiles', createProfile);
  fastify.patch('/profiles/:id', updateProfile);
  fastify.delete('/profiles/:id', deleteProfile);

  // Sync API
  fastify.post('/sync/:platform', triggerSync);
  
  // Sync Runs API
  await fastify.register(syncRunsRoutes, { prefix: '/sync' });

  // Games API
  fastify.get('/games', getGames);
  fastify.get('/games/:id', getGameById);

  // Achievements API
  fastify.get('/achievements', getAchievements);

  // Settings API
  fastify.get('/settings', getSettings);
  fastify.put('/settings', updateSettings);

  // Export/Import API
  fastify.get('/export', exportData);
  fastify.post('/import', importData);

  // Icons API
  await registerIconRoutes(fastify);
}
