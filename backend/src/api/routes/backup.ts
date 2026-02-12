import { FastifyRequest, FastifyReply } from 'fastify';
import { Profile } from '../../models/profile.js';
import { Game } from '../../models/game.js';
import { Achievement } from '../../models/achievement.js';
import { Settings } from '../../models/settings.js';
import { BackupMetadata } from '../../models/backupMetadata.js';
import { logger } from '../../utils/logger.js';
import archiver from 'archiver';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { createReadStream, createWriteStream } from 'fs';
import { Extract } from 'unzipper';
import { readdir } from 'fs/promises';

const IMAGES_DIR = process.env.IMAGES_DIR || '/app/data/images';
const BACKUP_TEMP_DIR = '/tmp/backups';

// In-memory progress tracking
interface BackupProgress {
  status: 'preparing' | 'archiving' | 'complete' | 'error';
  progress: number;
  message: string;
  filePath?: string;
  error?: string;
}

interface RestoreProgress {
  status: 'uploading' | 'extracting' | 'importing' | 'complete' | 'error';
  progress: number;
  message: string;
  imported?: {
    profiles: number;
    games: number;
    achievements: number;
    settings: boolean;
  };
  error?: string;
}

const backupJobs = new Map<string, BackupProgress>();
const restoreJobs = new Map<string, RestoreProgress>();
const cancelledJobs = new Set<string>(); // Track cancelled jobs

/**
 * Count total files in a directory recursively
 */
async function countFiles(dir: string): Promise<number> {
  let count = 0;
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        count += await countFiles(path.join(dir, entry.name));
      } else {
        count++;
      }
    }
  } catch (error) {
    // Ignore errors
  }
  return count;
}

/**
 * Get backup/restore status
 */
export async function getStatus(
  req: FastifyRequest,
  reply: FastifyReply
) {
  try {
    // Get current jobs from memory
    let currentBackup = null;
    let currentRestore = null;

    // Find active backup
    for (const [jobId, progress] of backupJobs.entries()) {
      if (progress.status !== 'complete' && progress.status !== 'error') {
        currentBackup = { jobId, ...progress };
        break;
      }
    }

    // Find active restore
    for (const [jobId, progress] of restoreJobs.entries()) {
      if (progress.status !== 'complete' && progress.status !== 'error') {
        currentRestore = { jobId, ...progress };
        break;
      }
    }

    // Get last completed or ready backup from DB
    const lastBackup = await BackupMetadata.findOne({
      type: 'backup',
      status: 'completed'
    }).sort({ completedAt: -1 });

    // Get last completed restore from DB
    const lastRestore = await BackupMetadata.findOne({
      type: 'restore',
      status: 'completed'
    }).sort({ completedAt: -1 });

    // Check if last backup file still exists
    let backupReady = false;
    if (lastBackup && lastBackup.filePath && fs.existsSync(lastBackup.filePath)) {
      backupReady = true;
    }

    reply.send({
      backup: {
        current: currentBackup,
        lastCompleted: lastBackup ? {
          completedAt: lastBackup.completedAt,
          downloadedAt: lastBackup.downloadedAt,
          jobId: lastBackup.jobId
        } : null,
        ready: backupReady
      },
      restore: {
        current: currentRestore,
        lastCompleted: lastRestore ? {
          completedAt: lastRestore.completedAt,
          metadata: lastRestore.metadata
        } : null
      }
    });
  } catch (error) {
    logger.error({ error }, '[Backup] Failed to get status');
    reply.status(500).send({ error: 'Failed to get status' });
  }
}

/**
 * Start backup creation in background and return job ID
 */
export async function startBackup(
  req: FastifyRequest,
  reply: FastifyReply
) {
  const jobId = `backup-${Date.now()}`;
  
  // Initialize progress
  backupJobs.set(jobId, {
    status: 'preparing',
    progress: 0,
    message: 'Preparing backup...'
  });

  // Create metadata entry
  await BackupMetadata.create({
    type: 'backup',
    status: 'in-progress',
    jobId
  });

  // Start background job
  createBackupInBackground(jobId).catch((error) => {
    logger.error({ error, jobId }, '[Backup] Background job failed');
    backupJobs.set(jobId, {
      status: 'error',
      progress: 0,
      message: 'Backup failed',
      error: error instanceof Error ? error.message : String(error)
    });
  });

  reply.send({ jobId });
}

/**
 * Get backup job progress
 */
export async function getBackupProgress(
  req: FastifyRequest<{ Params: { jobId: string } }>,
  reply: FastifyReply
) {
  const { jobId } = req.params;
  const progress = backupJobs.get(jobId);
  
  if (!progress) {
    return reply.status(404).send({ error: 'Job not found' });
  }
  
  reply.send(progress);
}

/**
 * Download completed backup
 */
export async function downloadBackup(
  req: FastifyRequest<{ Params: { jobId: string } }>,
  reply: FastifyReply
) {
  const { jobId } = req.params;
  const progress = backupJobs.get(jobId);
  
  if (!progress) {
    return reply.status(404).send({ error: 'Job not found' });
  }
  
  if (progress.status !== 'complete' || !progress.filePath) {
    return reply.status(400).send({ error: 'Backup not ready' });
  }
  
  if (!fs.existsSync(progress.filePath)) {
    return reply.status(404).send({ error: 'Backup file not found' });
  }

  // Record download timestamp
  await BackupMetadata.findOneAndUpdate(
    { jobId },
    { downloadedAt: new Date() }
  );
  
  // Stream the file
  const stream = createReadStream(progress.filePath);
  reply.raw.writeHead(200, {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="cpak-backup-${Date.now()}.zip"`
  });
  
  stream.pipe(reply.raw);
  
  // Cleanup after sending
  stream.on('end', () => {
    fs.unlinkSync(progress.filePath!);
    backupJobs.delete(jobId);
  });
}

/**
 * Create backup in background with progress tracking
 */
async function createBackupInBackground(jobId: string) {
  const progress = backupJobs.get(jobId)!;
  
  try {
    // Check for cancellation
    if (cancelledJobs.has(jobId)) {
      logger.info({ jobId }, '[Backup] Job was cancelled before starting');
      cancelledJobs.delete(jobId);
      return;
    }

    // Step 1: Fetch data (10% progress)
    progress.message = 'Fetching data from database...';
    progress.progress = 5;
    backupJobs.set(jobId, progress);

    const [profiles, games, achievements, settings] = await Promise.all([
      Profile.find().lean(),
      Game.find().lean(),
      Achievement.find().lean(),
      Settings.findOne().lean()
    ]);

    const exportData = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      profiles,
      games,
      achievements,
      settings
    };

    progress.progress = 10;
    progress.message = 'Data fetched, preparing archive...';
    backupJobs.set(jobId, progress);

    // Step 2: Count files for progress tracking (15% progress)
    let totalFiles = 0;
    if (fs.existsSync(IMAGES_DIR)) {
      progress.message = 'Counting image files...';
      backupJobs.set(jobId, progress);
      totalFiles = await countFiles(IMAGES_DIR);
      logger.info({ totalFiles }, '[Backup] Total files to archive');
    }

    progress.progress = 15;
    progress.message = `Creating archive (${totalFiles} files)...`;
    backupJobs.set(jobId, progress);

    // Check for cancellation
    if (cancelledJobs.has(jobId)) {
      logger.info({ jobId }, '[Backup] Job cancelled before archiving');
      cancelledJobs.delete(jobId);
      return;
    }

    // Step 3: Create archive
    if (!fs.existsSync(BACKUP_TEMP_DIR)) {
      fs.mkdirSync(BACKUP_TEMP_DIR, { recursive: true });
    }

    const backupFilePath = path.join(BACKUP_TEMP_DIR, `${jobId}.zip`);
    const output = createWriteStream(backupFilePath);
    const archive = archiver('zip', { 
      zlib: { level: 6 } // Balanced compression (was 9, now 6 for speed)
    });

    // Track archive progress
    let processedFiles = 0;
    archive.on('entry', (entry) => {
      // Check for cancellation
      if (cancelledJobs.has(jobId)) {
        logger.info({ jobId }, '[Backup] Job cancelled during archiving');
        archive.abort();
        return;
      }
      
      if (totalFiles > 0) {
        processedFiles++;
        const fileProgress = Math.floor((processedFiles / totalFiles) * 70); // 15-85% range
        progress.progress = 15 + fileProgress;
        progress.message = `Archiving files... (${processedFiles}/${totalFiles})`;
        backupJobs.set(jobId, progress);
      }
    });

    archive.pipe(output);

    // Add data.json
    archive.append(JSON.stringify(exportData, null, 2), { name: 'data.json' });

    // Add images directory
    if (fs.existsSync(IMAGES_DIR)) {
      archive.directory(IMAGES_DIR, 'images');
    }

    // Finalize
    progress.progress = 85;
    progress.message = 'Finalizing archive...';
    backupJobs.set(jobId, progress);

    await archive.finalize();

    // Wait for output stream to finish
    await new Promise<void>((resolve, reject) => {
      output.on('close', () => resolve());
      output.on('error', reject);
    });

    // Complete
    progress.status = 'complete';
    progress.progress = 100;
    progress.message = 'Backup ready for download';
    progress.filePath = backupFilePath;
    backupJobs.set(jobId, progress);

    // Update metadata
    await BackupMetadata.findOneAndUpdate(
      { jobId },
      {
        status: 'completed',
        completedAt: new Date(),
        filePath: backupFilePath,
        metadata: {
          profiles: profiles.length,
          games: games.length,
          achievements: achievements.length,
          images: totalFiles
        }
      }
    );

    logger.info({ 
      jobId, 
      profiles: profiles.length, 
      games: games.length, 
      achievements: achievements.length,
      totalFiles 
    }, '[Backup] Backup created successfully');

  } catch (error) {
    logger.error({ error, jobId }, '[Backup] Failed to create backup');
    progress.status = 'error';
    progress.message = 'Backup failed';
    progress.error = error instanceof Error ? error.message : String(error);
    backupJobs.set(jobId, progress);

    // Update metadata with error
    await BackupMetadata.findOneAndUpdate(
      { jobId },
      {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error)
      }
    );

    throw error;
  }
}

/**
 * Create and download full backup (legacy - deprecated)
 */
export async function downloadFullBackup(
  req: FastifyRequest,
  reply: FastifyReply
) {
  try {
    logger.info('[Backup] Starting full backup creation');

    // Fetch all data
    const [profiles, games, achievements, settings] = await Promise.all([
      Profile.find().lean(),
      Game.find().lean(),
      Achievement.find().lean(),
      Settings.findOne().lean()
    ]);

    const exportData = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      profiles,
      games,
      achievements,
      settings
    };

    // Create zip archive
    const archive = archiver('zip', { zlib: { level: 9 } });

    // Set response headers
    reply.raw.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="cpak-full-backup-${Date.now()}.zip"`
    });

    // Pipe archive to response
    archive.pipe(reply.raw);

    // Add data.json to archive
    archive.append(JSON.stringify(exportData, null, 2), { name: 'data.json' });

    // Add images directory to archive if it exists
    if (fs.existsSync(IMAGES_DIR)) {
      archive.directory(IMAGES_DIR, 'images');
      logger.info('[Backup] Adding images directory to backup');
    }

    // Finalize the archive
    await archive.finalize();

    logger.info(`[Backup] Full backup created with ${profiles.length} profiles, ${games.length} games, ${achievements.length} achievements`);
  } catch (error) {
    logger.error({ error }, '[Backup] Failed to create full backup');
    if (!reply.sent) {
      reply.status(500).send({ error: 'Failed to create backup' });
    }
  }
}

/**
 * Start restore in background and return job ID
 */
export async function startRestore(
  req: FastifyRequest,
  reply: FastifyReply
) {
  try {
    logger.info('[Restore] Starting restore request');
    
    const jobId = `restore-${Date.now()}`;
    logger.info({ jobId }, '[Restore] Created jobId');
    
    // Initialize progress
    restoreJobs.set(jobId, {
      status: 'uploading',
      progress: 0,
      message: 'Uploading backup file...'
    });
    logger.info({ jobId }, '[Restore] Initialized progress job');

    // Create metadata entry
    await BackupMetadata.create({
      type: 'restore',
      status: 'in-progress',
      jobId
    });

    // Get the uploaded file
    // @ts-ignore - multipart plugin adds file method to request
    const data = await req.file();
    logger.info({ jobId, hasFile: !!data }, '[Restore] File upload attempt');
    
    if (!data) {
      logger.error({ jobId }, '[Restore] No file uploaded');
      restoreJobs.delete(jobId);
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    logger.info({ jobId, filename: data.filename }, '[Restore] File received, saving to disk');
    
    // Save file to disk BEFORE responding (stream must be consumed while request is active)
    const tempZipPath = path.join('/tmp', `${jobId}.zip`);
    const writeStream = createWriteStream(tempZipPath);
    
    await pipeline(data.file, writeStream);
    logger.info({ jobId, tempZipPath }, '[Restore] File saved to disk');
    
    // Update progress
    restoreJobs.set(jobId, {
      status: 'extracting',
      progress: 5,
      message: 'File uploaded, starting restore...'
    });
    
    // Start background job with file path instead of stream
    restoreBackupInBackground(jobId, tempZipPath).catch((error) => {
      logger.error({ error, jobId }, '[Restore] Background job failed');
      restoreJobs.set(jobId, {
        status: 'error',
        progress: 0,
        message: 'Restore failed',
        error: error instanceof Error ? error.message : String(error)
      });
    });

    logger.info({ jobId }, '[Restore] Sending jobId response');
    reply.send({ jobId });
  } catch (error) {
    logger.error({ error }, '[Restore] Unexpected error in startRestore');
    reply.status(500).send({ error: 'Failed to start restore' });
  }
}

/**
 * Get restore job progress
 */
export async function getRestoreProgress(
  req: FastifyRequest<{ Params: { jobId: string } }>,
  reply: FastifyReply
) {
  const { jobId } = req.params;
  const progress = restoreJobs.get(jobId);
  
  if (!progress) {
    return reply.status(404).send({ error: 'Job not found' });
  }
  
  reply.send(progress);
}

/**
 * Cancel backup job
 */
export async function cancelBackup(
  req: FastifyRequest<{ Params: { jobId: string } }>,
  reply: FastifyReply
) {
  const { jobId } = req.params;
  const progress = backupJobs.get(jobId);
  
  if (!progress) {
    return reply.status(404).send({ error: 'Job not found' });
  }

  if (progress.status === 'complete' || progress.status === 'error') {
    return reply.status(400).send({ error: 'Job already finished' });
  }

  // Mark job as cancelled
  cancelledJobs.add(jobId);
  
  // Update job status
  progress.status = 'error';
  progress.message = 'Cancelled by user';
  progress.error = 'Cancelled';
  backupJobs.set(jobId, progress);

  // Update metadata
  await BackupMetadata.findOneAndUpdate(
    { jobId },
    {
      status: 'failed',
      error: 'Cancelled by user'
    }
  );

  logger.info({ jobId }, '[Backup] Job cancelled by user');
  reply.send({ message: 'Backup cancelled' });
}

/**
 * Cancel restore job
 */
export async function cancelRestore(
  req: FastifyRequest<{ Params: { jobId: string } }>,
  reply: FastifyReply
) {
  const { jobId } = req.params;
  const progress = restoreJobs.get(jobId);
  
  if (!progress) {
    return reply.status(404).send({ error: 'Job not found' });
  }

  if (progress.status === 'complete' || progress.status === 'error') {
    return reply.status(400).send({ error: 'Job already finished' });
  }

  // Mark job as cancelled
  cancelledJobs.add(jobId);
  
  // Update job status
  progress.status = 'error';
  progress.message = 'Cancelled by user';
  progress.error = 'Cancelled';
  restoreJobs.set(jobId, progress);

  // Update metadata
  await BackupMetadata.findOneAndUpdate(
    { jobId },
    {
      status: 'failed',
      error: 'Cancelled by user'
    }
  );

  logger.info({ jobId }, '[Restore] Job cancelled by user');
  reply.send({ message: 'Restore cancelled' });
}

/**
 * Restore backup in background with progress tracking
 */
async function restoreBackupInBackground(jobId: string, tempZipPath: string) {
  logger.info({ jobId, tempZipPath }, '[Restore] Background function called');
  
  const progress = restoreJobs.get(jobId);
  if (!progress) {
    logger.error({ jobId }, '[Restore] Progress job not found in Map');
    throw new Error('Progress job not found');
  }
  
  logger.info({ jobId }, '[Restore] Got progress from Map');
  
  try {
    // Check for cancellation
    if (cancelledJobs.has(jobId)) {
      logger.info({ jobId }, '[Restore] Job was cancelled before starting');
      cancelledJobs.delete(jobId);
      return;
    }

    logger.info({ jobId }, '[Restore] Step 1: File already saved, proceeding to extract');
    
    // File is already saved by startRestore, proceed to extraction
    const tempExtractPath = path.join('/tmp', `${jobId}-extract`);
    
    logger.info({ jobId, tempExtractPath }, '[Restore] Temp extract path created');
    
    // Step 2: Extract zip file (10% progress)
    progress.status = 'extracting';
    progress.progress = 10;
    progress.message = 'Extracting backup...';
    restoreJobs.set(jobId, progress);

    fs.mkdirSync(tempExtractPath, { recursive: true });
    
    await new Promise<void>((resolve, reject) => {
      const readStream = createReadStream(tempZipPath);
      const extractStream = Extract({ path: tempExtractPath });
      
      readStream.pipe(extractStream);
      
      extractStream.on('close', () => resolve());
      extractStream.on('error', reject);
      readStream.on('error', reject);
    });

    logger.info('[Restore] Backup extracted');

    // Step 3: Read data.json (20% progress)
    progress.progress = 20;
    progress.message = 'Loading backup data...';
    restoreJobs.set(jobId, progress);

    const dataJsonPath = path.join(tempExtractPath, 'data.json');
    if (!fs.existsSync(dataJsonPath)) {
      throw new Error('data.json not found in backup');
    }

    const backupData = JSON.parse(fs.readFileSync(dataJsonPath, 'utf-8'));
    logger.info(`[Restore] Loaded backup data: version ${backupData.version}`);

    // Count total work units (db items + image files) for accurate progress
    const imagesBackupPath = path.join(tempExtractPath, 'images');
    let totalImageFiles = 0;
    if (fs.existsSync(imagesBackupPath)) {
      progress.message = 'Counting image files...';
      restoreJobs.set(jobId, progress);
      totalImageFiles = await countFiles(imagesBackupPath);
      logger.info({ jobId, totalImageFiles }, '[Restore] Counted image files');
    }

    // Step 4: Restore database (20-80% progress weighted by work)
    progress.status = 'importing';
    progress.message = 'Importing data to database...';
    restoreJobs.set(jobId, progress);

    const imported = {
      profiles: 0,
      games: 0,
      achievements: 0,
      settings: false,
      images: 0
    };

    // Calculate total work units for progress tracking
    const totalDbItems = 
      (backupData.profiles?.length || 0) +
      (backupData.games?.length || 0) +
      (backupData.achievements?.length || 0) +
      (backupData.settings ? 1 : 0);
    
    const totalWorkUnits = totalDbItems + totalImageFiles;
    let processedWorkUnits = 0;
    
    logger.info({ 
      jobId, 
      totalDbItems, 
      totalImageFiles, 
      totalWorkUnits 
    }, '[Restore] Total work calculated');

    // Check for cancellation
    if (cancelledJobs.has(jobId)) {
      logger.info({ jobId }, '[Restore] Job cancelled before profile import');
      cancelledJobs.delete(jobId);
      return;
    }

    // Import profiles (using bulk operations for performance)
    if (backupData.profiles && Array.isArray(backupData.profiles)) {
      const bulkOps = backupData.profiles.map((profile: any) => ({
        updateOne: {
          filter: { platform: profile.platform, profileId: profile.profileId },
          update: { $set: profile },
          upsert: true
        }
      }));
      
      await Profile.bulkWrite(bulkOps, { ordered: false });
      imported.profiles = backupData.profiles.length;
      processedWorkUnits += backupData.profiles.length;
      
      const itemProgress = Math.floor((processedWorkUnits / totalWorkUnits) * 70);
      progress.progress = 20 + itemProgress;
      progress.message = `Importing profiles... (${imported.profiles}/${backupData.profiles.length})`;
      restoreJobs.set(jobId, progress);
      
      logger.info({ jobId, imported: imported.profiles }, '[Restore] Profiles imported');
      
      // Add delay to yield to event loop
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Check for cancellation
    if (cancelledJobs.has(jobId)) {
      logger.info({ jobId }, '[Restore] Job cancelled before game import');
      cancelledJobs.delete(jobId);
      return;
    }

    // Import games (using bulk operations for performance)
    if (backupData.games && Array.isArray(backupData.games)) {
      progress.message = 'Importing games...';
      restoreJobs.set(jobId, progress);
      
      const BATCH_SIZE = 100; // Very small batches to keep API responsive
      const totalGames = backupData.games.length;
      
      for (let i = 0; i < totalGames; i += BATCH_SIZE) {
        const batch = backupData.games.slice(i, i + BATCH_SIZE);
        
        const bulkOps = batch.map((game: any) => ({
          updateOne: {
            filter: { platform: game.platform, profileId: game.profileId, gameId: game.gameId },
            update: { $set: game },
            upsert: true
          }
        }));
        
        await Game.bulkWrite(bulkOps, { ordered: false });
        
        imported.games += batch.length;
        processedWorkUnits += batch.length;
        
        const itemProgress = Math.floor((processedWorkUnits / totalWorkUnits) * 70);
        progress.progress = 20 + itemProgress;
        progress.message = `Importing games... (${imported.games}/${totalGames})`;
        restoreJobs.set(jobId, progress);
        
        logger.info({ jobId, imported: imported.games, total: totalGames }, '[Restore] Game batch imported');
        
        // Longer delay to keep API responsive
        await new Promise(resolve => setTimeout(resolve, 75));

        // Check for cancellation in batch loop
        if (cancelledJobs.has(jobId)) {
          logger.info({ jobId }, '[Restore] Job cancelled during game import');
          cancelledJobs.delete(jobId);
          return;
        }
      }
    }

    // Check for cancellation
    if (cancelledJobs.has(jobId)) {
      logger.info({ jobId }, '[Restore] Job cancelled before achievement import');
      cancelledJobs.delete(jobId);
      return;
    }

    // Import achievements (using bulk operations for performance)
    if (backupData.achievements && Array.isArray(backupData.achievements)) {
      progress.message = 'Importing achievements...';
      restoreJobs.set(jobId, progress);
      
      const BATCH_SIZE = 100; // Very small batches to keep API responsive
      const totalAchievements = backupData.achievements.length;
      
      for (let i = 0; i < totalAchievements; i += BATCH_SIZE) {
        const batch = backupData.achievements.slice(i, i + BATCH_SIZE);
        
        // Use bulkWrite for much better performance
        const bulkOps = batch.map((achievement: any) => ({
          updateOne: {
            filter: { 
              platform: achievement.platform, 
              profileId: achievement.profileId, 
              gameId: achievement.gameId,
              achievementId: achievement.achievementId
            },
            update: { $set: achievement },
            upsert: true
          }
        }));
        
        await Achievement.bulkWrite(bulkOps, { ordered: false });
        
        imported.achievements += batch.length;
        processedWorkUnits += batch.length;
        
        const itemProgress = Math.floor((processedWorkUnits / totalWorkUnits) * 70);
        progress.progress = 20 + itemProgress;
        progress.message = `Importing achievements... (${imported.achievements}/${totalAchievements})`;
        restoreJobs.set(jobId, progress);
        
        logger.info({ jobId, imported: imported.achievements, total: totalAchievements }, '[Restore] Achievement batch imported');
        
        // Longer delay to keep API responsive
        await new Promise(resolve => setTimeout(resolve, 100));

        // Check for cancellation in batch loop
        if (cancelledJobs.has(jobId)) {
          logger.info({ jobId }, '[Restore] Job cancelled during achievement import');
          cancelledJobs.delete(jobId);
          return;
        }
      }
    }

    // Import settings
    if (backupData.settings) {
      await Settings.findByIdAndUpdate(
        'global',
        backupData.settings,
        { upsert: true, new: true }
      );
      imported.settings = true;
      processedWorkUnits++;
      
      const itemProgress = Math.floor((processedWorkUnits / totalWorkUnits) * 70);
      progress.progress = 20 + itemProgress;
      restoreJobs.set(jobId, progress);
    }

    // Check for cancellation
    if (cancelledJobs.has(jobId)) {
      logger.info({ jobId }, '[Restore] Job cancelled before image restore');
      cancelledJobs.delete(jobId);
      return;
    }

    // Step 5: Restore images directory (continues from current progress to 95%)
    const imagesStartProgress = progress.progress;
    progress.message = 'Restoring images...';
    restoreJobs.set(jobId, progress);

    if (fs.existsSync(imagesBackupPath)) {
      fs.mkdirSync(IMAGES_DIR, { recursive: true });
      
      let copiedFiles = 0;
      await copyDirectory(imagesBackupPath, IMAGES_DIR, (count) => {
        copiedFiles = count;
        processedWorkUnits = totalDbItems + count;
        
        const itemProgress = Math.floor((processedWorkUnits / totalWorkUnits) * 70);
        progress.progress = Math.min(90, 20 + itemProgress);
        progress.message = `Restoring images... (${count}/${totalImageFiles})`;
        restoreJobs.set(jobId, progress);
      });
      
      imported.images = copiedFiles;
      logger.info({ jobId, copiedFiles }, '[Restore] Images directory restored');
    }

    // Cleanup temp files
    progress.progress = 95;
    progress.message = 'Cleaning up...';
    restoreJobs.set(jobId, progress);

    fs.rmSync(tempZipPath, { force: true });
    fs.rmSync(tempExtractPath, { recursive: true, force: true });

    // Complete
    progress.status = 'complete';
    progress.progress = 100;
    progress.message = 'Restore completed successfully';
    progress.imported = imported;
    restoreJobs.set(jobId, progress);

    // Update metadata
    await BackupMetadata.findOneAndUpdate(
      { jobId },
      {
        status: 'completed',
        completedAt: new Date(),
        metadata: {
          profiles: imported.profiles,
          games: imported.games,
          achievements: imported.achievements,
          images: imported.images
        }
      }
    );

    logger.info({ jobId, imported }, '[Restore] Full backup restored successfully');
    
    // Clean up job after 5 minutes
    setTimeout(() => {
      restoreJobs.delete(jobId);
      logger.info({ jobId }, '[Restore] Cleaned up completed job');
    }, 5 * 60 * 1000);

  } catch (error) {
    logger.error({ error, jobId }, '[Restore] Failed to restore backup');
    progress.status = 'error';
    progress.message = 'Restore failed';
    progress.error = error instanceof Error ? error.message : String(error);
    restoreJobs.set(jobId, progress);

    // Update metadata with error
    await BackupMetadata.findOneAndUpdate(
      { jobId },
      {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error)
      }
    );

    throw error;
  }
}

/**
 * Upload and restore full backup (legacy - deprecated)
 */
export async function uploadFullBackup(
  req: FastifyRequest,
  reply: FastifyReply
) {
  try {
    logger.info('[Restore] Starting full backup restore');

    // Get the uploaded file
    // @ts-ignore - multipart plugin adds file method to request
    const data = await req.file();
    
    if (!data) {
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    // Save uploaded file temporarily
    const tempZipPath = path.join('/tmp', `restore-${Date.now()}.zip`);
    const tempExtractPath = path.join('/tmp', `restore-extract-${Date.now()}`);
    
    await pipeline(data.file, createWriteStream(tempZipPath));
    logger.info('[Restore] Backup file uploaded');

    // Extract zip file
    fs.mkdirSync(tempExtractPath, { recursive: true });
    await pipeline(
      createReadStream(tempZipPath),
      Extract({ path: tempExtractPath })
    );
    logger.info('[Restore] Backup extracted');

    // Read and parse data.json
    const dataJsonPath = path.join(tempExtractPath, 'data.json');
    if (!fs.existsSync(dataJsonPath)) {
      throw new Error('data.json not found in backup');
    }

    const backupData = JSON.parse(fs.readFileSync(dataJsonPath, 'utf-8'));
    logger.info(`[Restore] Loaded backup data: version ${backupData.version}`);

    // Restore database
    let imported = {
      profiles: 0,
      games: 0,
      achievements: 0,
      settings: false
    };

    // Import profiles
    if (backupData.profiles && Array.isArray(backupData.profiles)) {
      for (const profile of backupData.profiles) {
        await Profile.findOneAndUpdate(
          { platform: profile.platform, profileId: profile.profileId },
          profile,
          { upsert: true, new: true }
        );
        imported.profiles++;
      }
    }

    // Import games
    if (backupData.games && Array.isArray(backupData.games)) {
      for (const game of backupData.games) {
        await Game.findOneAndUpdate(
          { platform: game.platform, profileId: game.profileId, gameId: game.gameId },
          game,
          { upsert: true, new: true }
        );
        imported.games++;
      }
    }

    // Import achievements
    if (backupData.achievements && Array.isArray(backupData.achievements)) {
      for (const achievement of backupData.achievements) {
        await Achievement.findOneAndUpdate(
          { 
            platform: achievement.platform, 
            profileId: achievement.profileId, 
            gameId: achievement.gameId,
            achievementId: achievement.achievementId
          },
          achievement,
          { upsert: true, new: true }
        );
        imported.achievements++;
      }
    }

    // Import settings
    if (backupData.settings) {
      await Settings.findByIdAndUpdate(
        'global',
        backupData.settings,
        { upsert: true, new: true }
      );
      imported.settings = true;
    }

    // Restore images directory
    const imagesBackupPath = path.join(tempExtractPath, 'images');
    if (fs.existsSync(imagesBackupPath)) {
      // Create images directory if it doesn't exist
      fs.mkdirSync(IMAGES_DIR, { recursive: true });

      // Copy all files from backup to images
      await copyDirectory(imagesBackupPath, IMAGES_DIR);
      logger.info('[Restore] Images directory restored');
    }

    // Cleanup temp files
    fs.rmSync(tempZipPath, { force: true });
    fs.rmSync(tempExtractPath, { recursive: true, force: true });

    logger.info({ imported }, '[Restore] Full backup restored successfully');

    reply.send({
      message: 'Backup restored successfully',
      imported
    });
  } catch (error) {
    logger.error({ error }, '[Restore] Failed to restore backup');
    reply.status(500).send({ error: 'Failed to restore backup' });
  }
}

/**
 * Recursively copy directory with progress tracking
 */
async function copyDirectory(src: string, dest: string, progressCallback?: (copiedFiles: number) => void, copiedFiles = { count: 0 }) {
  const { readdir, copyFile, mkdir } = await import('fs/promises');
  
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath, progressCallback, copiedFiles);
    } else {
      await copyFile(srcPath, destPath);
      copiedFiles.count++;
      
      // Report progress and yield every 10 files
      if (copiedFiles.count % 10 === 0) {
        if (progressCallback) {
          progressCallback(copiedFiles.count);
        }
        // Yield to event loop
        await new Promise(resolve => setImmediate(resolve));
      }
    }
  }
}
