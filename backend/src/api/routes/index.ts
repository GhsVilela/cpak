import { FastifyInstance } from 'fastify';
import { systemRoutes } from './system.js';
import { getProfiles, getProfileById, createProfile, updateProfile, deleteProfile } from './profiles.js';
import { triggerSync, getSyncStatus, cancelSync } from './sync.js';
import { getGames, getGameById, updateGameTitle, uploadGameImage } from './games.js';
import { getAchievements } from './achievements.js';
import { registerIconRoutes } from './icons.js';
import { syncRunsRoutes } from './syncRuns.js';
import { getAllSettings, getSetting, updateSetting, deleteSetting } from './settings.js';
import { exportData, importData } from './exportImport.js';
import { startBackup, getBackupProgress, downloadBackup, startRestore, getRestoreProgress, getRestoreJobs, getStatus, cancelBackup, cancelRestore } from './backup.js';
import { xboxAuthRoutes, playstationAuthRoutes } from './auth.js';

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
  fastify.get('/sync/status', getSyncStatus);
  fastify.post('/sync/:platform', triggerSync);
  fastify.delete('/sync/cancel/:operationId', cancelSync);
  
  // Sync Runs API
  await fastify.register(syncRunsRoutes, { prefix: '/sync' });

  // Games API
  fastify.get('/games', getGames);
  fastify.get('/games/:id', getGameById);
  fastify.patch('/games/:id', updateGameTitle);
  fastify.patch('/games/:id/images/:imageType', uploadGameImage);

  // Achievements API
  fastify.get('/achievements', getAchievements);

  // Settings API (key-value configuration)
  fastify.get('/settings', getAllSettings);
  fastify.get('/settings/:key', getSetting);
  fastify.put('/settings/:key', updateSetting);
  fastify.delete('/settings/:key', deleteSetting);

  // Export/Import API
  fastify.get('/export', exportData);
  fastify.post('/import', importData);
  
  // Full Backup/Restore API with progress tracking
  fastify.get('/backup/status', getStatus);
  fastify.post('/backup/start', startBackup);
  fastify.get('/backup/progress/:jobId', getBackupProgress);
  fastify.get('/backup/download/:jobId', downloadBackup);
  fastify.delete('/backup/cancel/:jobId', cancelBackup);
  fastify.post('/backup/restore/start', startRestore);
  fastify.get('/backup/restore/progress/:jobId', getRestoreProgress);
  fastify.get('/backup/restore/status', getRestoreJobs);
  fastify.delete('/backup/restore/cancel/:jobId', cancelRestore);

  // Icons API
  await registerIconRoutes(fastify);

  // Xbox Auth API (OAuth flow)
  await fastify.register(xboxAuthRoutes, { prefix: '/auth/xbox' });

  // PlayStation Auth API
  await fastify.register(playstationAuthRoutes, { prefix: '/auth/playstation' });
}
