import { FastifyRequest, FastifyReply } from 'fastify';
import { Profile } from '../../models/profile.js';
import { Game } from '../../models/game.js';
import { Achievement } from '../../models/achievement.js';
import { Setting } from '../../models/setting.js';
import { BackupMetadata } from '../../models/backupMetadata.js';
import { BackupJob } from '../../models/backupJob.js';
import { RestoreJob } from '../../models/restoreJob.js';
import { logger } from '../../utils/logger.js';
import archiver from 'archiver';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { createReadStream, createWriteStream } from 'fs';
import { Extract } from 'unzipper';
import { readdir } from 'fs/promises';

const IMAGES_DIR = process.env.IMAGES_DIR || '/app/data/images';
const BACKUP_TEMP_DIR = process.env.BACKUP_DIR || '/app/data/backups';

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
    // Get current jobs from MongoDB (source of truth)
    let currentBackup = null;
    let currentRestore = null;

    // Find active backup job from DB (exclude ready/completed/failed/expired)
    const activeBackupJob = await BackupJob.findOne({
      status: { $nin: ['ready', 'completed', 'failed', 'expired'] }
    }).sort({ createdAt: -1 });

    if (activeBackupJob) {
      // Calculate progress percentage
      let progress = 0;
      let message = '';
      
      if (activeBackupJob.status === 'preparing') {
        progress = activeBackupJob.totalRecords > 0 
          ? Math.floor((activeBackupJob.recordsProcessed / activeBackupJob.totalRecords) * 100)
          : 0;
        message = `Fetching data from database... (${activeBackupJob.recordsProcessed}/${activeBackupJob.totalRecords} records)`;
      } else if (activeBackupJob.status === 'compressing') {
        // During compression, show archive progress if available
        if (activeBackupJob.fileSize > 0 && activeBackupJob.metadata?.totalFiles) {
          const filesProcessed = activeBackupJob.fileSize; // Temporarily stores file count
          const totalFiles = activeBackupJob.metadata.totalFiles;
          progress = Math.min(Math.floor((filesProcessed / totalFiles) * 100), 99);
          message = `Creating backup archive... (${filesProcessed}/${totalFiles} files)`;
        } else {
          progress = 50;
          message = 'Creating backup archive (this may take a while for large image collections)...';
        }
      } else if (activeBackupJob.status === 'ready') {
        progress = 100;
        message = 'Backup ready for download';
      } else if (activeBackupJob.status === 'failed') {
        progress = 0;
        message = activeBackupJob.error || 'Backup failed';
      } else {
        progress = activeBackupJob.totalRecords > 0 
          ? Math.floor((activeBackupJob.recordsProcessed / activeBackupJob.totalRecords) * 100)
          : 0;
        message = `Processing... (${activeBackupJob.recordsProcessed}/${activeBackupJob.totalRecords} records)`;
      }

      currentBackup = {
        jobId: activeBackupJob._id.toString(),
        status: activeBackupJob.status,
        progress: progress,
        message: message
      };
    }

    // Find active restore job from DB
    const activeRestoreJob = await RestoreJob.findOne({
      status: { $nin: ['completed', 'failed'] }
    }).sort({ createdAt: -1 });

    if (activeRestoreJob) {
      // Calculate total work (records + images)
      const totalWork = activeRestoreJob.totalRecords + activeRestoreJob.totalImages;
      const currentWork = activeRestoreJob.recordsRestored + activeRestoreJob.imagesRestored;
      
      // Calculate progress percentage including images
      const progress = totalWork > 0 
        ? Math.floor((currentWork / totalWork) * 100)
        : 0;

      // Generate message based on current phase
      let message = '';
      if (activeRestoreJob.status === 'extracting') {
        message = 'Extracting backup archive...';
      } else if (activeRestoreJob.status === 'validating') {
        message = 'Validating backup data...';
      } else if (activeRestoreJob.status === 'restoring') {
        const collection = activeRestoreJob.currentCollection;
        if (collection === 'images') {
          message = `Restoring images... (${activeRestoreJob.imagesRestored}/${activeRestoreJob.totalImages} files)`;
        } else {
          message = `Restoring database records... (${activeRestoreJob.recordsRestored}/${activeRestoreJob.totalRecords} records)`;
        }
      } else {
        message = `Processing... (${currentWork}/${totalWork} items)`;
      }

      currentRestore = {
        jobId: activeRestoreJob._id.toString(),
        status: activeRestoreJob.status,
        progress: progress,
        message: message
      };
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

    // Get last failed restore from RestoreJob
    const lastFailedRestore = await RestoreJob.findOne({
      status: 'failed'
    }).sort({ createdAt: -1 });

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
        } : null,
        lastFailed: lastFailedRestore ? {
          createdAt: lastFailedRestore.createdAt,
          error: lastFailedRestore.error,
          jobId: lastFailedRestore._id.toString()
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
  try {
    // T038: Create BackupJob record at operation start
    const backupJob = await BackupJob.create({
      status: 'preparing',
      totalCollections: 4, // profiles, games, achievements, settings
      collectionsProcessed: 0,
      totalRecords: 0,
      recordsProcessed: 0,
      fileSize: 0,
      collections: ['profiles', 'games', 'achievements', 'settings']
    });

    const jobId = backupJob._id.toString();

    // Create metadata entry (legacy compatibility)
    await BackupMetadata.create({
      type: 'backup',
      status: 'in-progress',
      jobId
    });

    // Start background job
    createBackupInBackground(jobId).catch((error) => {
      logger.error({ error, jobId }, '[Backup] Background job failed');
    });

    reply.send({ jobId });
  } catch (error) {
    logger.error({ error }, '[Backup] Failed to start backup');
    reply.status(500).send({ error: 'Failed to start backup' });
  }
}

/**
 * Get backup job progress
 */
export async function getBackupProgress(
  req: FastifyRequest<{ Params: { jobId: string } }>,
  reply: FastifyReply
) {
  try {
    const { jobId } = req.params;
    const backupJob = await BackupJob.findById(jobId);
    
    if (!backupJob) {
      return reply.status(404).send({ error: 'Job not found' });
    }
    
    reply.send({
      status: backupJob.status,
      totalCollections: backupJob.totalCollections,
      collectionsProcessed: backupJob.collectionsProcessed,
      totalRecords: backupJob.totalRecords,
      recordsProcessed: backupJob.recordsProcessed,
      fileSize: backupJob.fileSize,
      filePath: backupJob.filePath,
      error: backupJob.error,
      createdAt: backupJob.createdAt,
      completedAt: backupJob.completedAt
    });
  } catch (error) {
    logger.error({ error }, '[Backup] Failed to get progress');
    reply.status(500).send({ error: 'Failed to get progress' });
  }
}

/**
 * Download completed backup
 */
export async function downloadBackup(
  req: FastifyRequest<{ Params: { jobId: string } }>,
  reply: FastifyReply
) {
  try {
    const { jobId } = req.params;
    const backupJob = await BackupJob.findById(jobId);
    
    if (!backupJob) {
      return reply.status(404).send({ error: 'Job not found' });
    }
    
    if (backupJob.status !== 'ready' || !backupJob.filePath) {
      return reply.status(400).send({ error: 'Backup not ready' });
    }
    
    if (!fs.existsSync(backupJob.filePath)) {
      return reply.status(404).send({ error: 'Backup file not found' });
    }

    // Record download timestamp
    await BackupMetadata.findOneAndUpdate(
      { jobId },
      { downloadedAt: new Date() }
    );
    
    // Get file size for Content-Length header (required for progress tracking)
    const stats = fs.statSync(backupJob.filePath);
    
    // Stream the file
    const stream = createReadStream(backupJob.filePath);
    reply.raw.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="cpak-backup-${Date.now()}.zip"`,
      'Content-Length': stats.size.toString()
    });
    
    stream.pipe(reply.raw);
    
    // Cleanup after sending
    stream.on('end', () => {
      if (backupJob.filePath && fs.existsSync(backupJob.filePath)) {
        fs.unlinkSync(backupJob.filePath);
      }
    });
  } catch (error) {
    logger.error({ error }, '[Backup] Failed to download backup');
    reply.status(500).send({ error: 'Failed to download backup' });
  }
}

/**
 * Create backup in background with progress tracking
 */
async function createBackupInBackground(jobId: string) {
  try {
    // Load BackupJob record
    const backupJob = await BackupJob.findById(jobId);
    if (!backupJob) {
      logger.error({ jobId }, '[Backup] BackupJob not found');
      return;
    }

    // Check for cancellation
    if (cancelledJobs.has(jobId)) {
      logger.info({ jobId }, '[Backup] Job was cancelled before starting');
      cancelledJobs.delete(jobId);
      backupJob.status = 'failed';
      backupJob.error = 'Cancelled by user';
      await backupJob.save();
      return;
    }

    // T039: Step 1: Fetch data from database (preparing phase)
    backupJob.status = 'preparing';
    await backupJob.save();

    const [profiles, games, achievements, settings] = await Promise.all([
      Profile.find().lean(),
      Game.find().lean(),
      Achievement.find().lean(),
      Setting.find().lean()
    ]);

    // T040: Update BackupJob with total records count
    const totalRecords = profiles.length + games.length + achievements.length + settings.length;
    backupJob.totalRecords = totalRecords;
    backupJob.recordsProcessed = totalRecords; // All data fetched
    backupJob.collectionsProcessed = 4;
    await backupJob.save();

    const exportData = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      profiles,
      games,
      achievements,
      settings
    };

    // Check for cancellation
    if (cancelledJobs.has(jobId)) {
      logger.info({ jobId }, '[Backup] Job cancelled before archiving');
      cancelledJobs.delete(jobId);
      backupJob.status = 'failed';
      backupJob.error = 'Cancelled by user';
      await backupJob.save();
      return;
    }

    // T040: Step 2: Create archive (compressing phase)
    backupJob.status = 'compressing';
    await backupJob.save();

    // Count total images for progress tracking
    const totalImages = fs.existsSync(IMAGES_DIR) ? await countFiles(IMAGES_DIR) : 0;
    const totalFiles = totalImages + 1; // +1 for data.json
    logger.info({ jobId, totalImages, totalFiles }, '[Backup] Counted images for archive');

    // Store total files in metadata for progress tracking
    backupJob.metadata = { totalFiles };
    backupJob.fileSize = 0; // Will be used to track processed files
    await backupJob.save();

    // Create backup directory if needed
    if (!fs.existsSync(BACKUP_TEMP_DIR)) {
      logger.info({ dir: BACKUP_TEMP_DIR }, 'Creating backup directory');
      fs.mkdirSync(BACKUP_TEMP_DIR, { recursive: true, mode: 0o755 });
    }

    const backupFilePath = path.join(BACKUP_TEMP_DIR, `${jobId}.zip`);
    const output = createWriteStream(backupFilePath);
    const archive = archiver('zip', { 
      zlib: { level: 5 } // Slightly faster compression
    });

    // Track archiver progress and cancellation
    let processedFiles = 0;
    let lastProgressUpdate = 0;
    let archiveCancelled = false;
    
    // Set up error handlers immediately to prevent unhandled errors
    output.on('error', (err) => {
      // Ignore errors after cancellation (stream destroyed errors are expected)
      if (!archiveCancelled) {
        logger.error({ error: err, jobId }, '[Backup] Output stream error');
      }
    });
    
    archive.on('error', (err) => {
      // Ignore errors after cancellation
      if (!archiveCancelled) {
        logger.error({ error: err, jobId }, '[Backup] Archiver error');
      }
    });
    
    archive.on('entry', async (entry) => {
      processedFiles++;
      
      // Update progress every 500 files or every 2 seconds
      const now = Date.now();
      if (processedFiles % 500 === 0 || now - lastProgressUpdate > 2000) {
        lastProgressUpdate = now;
        
        // Update BackupJob in MongoDB for polling frontend
        const percentage = totalImages > 0 ? Math.floor((processedFiles / (totalImages + 1)) * 100) : 50;
        backupJob.recordsProcessed = totalRecords; // Keep at max
        backupJob.fileSize = processedFiles; // Use fileSize field temporarily to track archive progress
        await backupJob.save();
        
        logger.info({ jobId, processedFiles, totalImages }, '[Backup] Archive progress');
      }
      
      // Check for cancellation every 100 files
      if (processedFiles % 100 === 0) {
        const job = await BackupJob.findById(jobId);
        if (job && job.status === 'failed') {
          logger.info({ jobId }, '[Backup] Job cancelled during archiving, aborting');
          archiveCancelled = true;
          archive.abort();
        }
      }
    });

    archive.pipe(output);

    // Add data.json
    archive.append(JSON.stringify(exportData, null, 2), { name: 'data.json' });

    // Add images directory if exists
    if (fs.existsSync(IMAGES_DIR)) {
      archive.directory(IMAGES_DIR, 'images');
    }

    // Finalize archive
    try {
      await archive.finalize();
    } catch (error) {
      if (archiveCancelled) {
        logger.info({ jobId }, '[Backup] Archive finalize cancelled');
        throw new Error('Backup cancelled by user');
      }
      throw error;
    }

    // Wait for output stream to finish (unless cancelled)
    if (!archiveCancelled) {
      await new Promise<void>((resolve, reject) => {
        output.on('close', () => resolve());
        output.on('error', (err) => {
          logger.error({ error: err, jobId }, '[Backup] Output stream error during finalization');
          reject(err);
        });
      });
    } else {
      // If cancelled, throw error to trigger cleanup
      throw new Error('Backup cancelled by user');
    }

    // Get file size
    const stats = fs.statSync(backupFilePath);
    backupJob.fileSize = stats.size;
    backupJob.filePath = backupFilePath;

    // T041: Mark as ready and broadcast complete event
    backupJob.status = 'ready';
    backupJob.completedAt = new Date();
    await backupJob.save();

    // Update metadata (legacy compatibility)
    await BackupMetadata.findOneAndUpdate(
      { jobId },
      {
        status: 'completed',
        completedAt: new Date(),
        filePath: backupFilePath,
        metadata: {
          profiles: profiles.length,
          games: games.length,
          achievements: achievements.length
        }
      }
    );

    logger.info({ 
      jobId, 
      profiles: profiles.length, 
      games: games.length, 
      achievements: achievements.length,
      fileSize: backupJob.fileSize
    }, '[Backup] Backup created successfully');

  } catch (error) {
    // T042: Broadcast error event on failure
    logger.error({ error, jobId }, '[Backup] Failed to create backup');
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    try {
      // Clean up partial backup file if it exists
      const backupJob = await BackupJob.findById(jobId);
      if (backupJob && backupJob.filePath && fs.existsSync(backupJob.filePath)) {
        logger.info({ jobId, filePath: backupJob.filePath }, '[Backup] Cleaning up partial backup file');
        fs.unlinkSync(backupJob.filePath);
      }
      
      if (backupJob) {
        backupJob.status = 'failed';
        backupJob.error = errorMessage;
        await backupJob.save();
      }

      // Clear cancelled flag
      if (cancelledJobs.has(jobId)) {
        cancelledJobs.delete(jobId);
      }

      // Update metadata with error
      await BackupMetadata.findOneAndUpdate(
        { jobId },
        {
          status: 'failed',
          error: errorMessage
        }
      );
    } catch (saveError) {
      logger.error({ saveError, jobId }, '[Backup] Failed to save error state');
    }
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
      Setting.find().lean()
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
    
    // T043: Create RestoreJob record at operation start
    const restoreJob = await RestoreJob.create({
      status: 'uploading',
      uploadedFileSize: 0,
      totalCollections: 0,
      collectionsRestored: 0,
      totalRecords: 0,
      recordsRestored: 0,
      imagesRestored: 0,
      mode: 'merge', // Default mode
      warnings: []
    });

    const jobId = restoreJob._id.toString();
    logger.info({ jobId }, '[Restore] Created RestoreJob');

    // Create metadata entry (legacy compatibility)
    await BackupMetadata.create({
      type: 'restore',
      status: 'in-progress',
      jobId
    });

    // T044: Broadcast initial progress (uploading phase)
    // (Previously used SSE, now polling-based)

    // Get the uploaded file
    // @ts-ignore - multipart plugin adds file method to request
    const data = await req.file();
    logger.info({ jobId, hasFile: !!data }, '[Restore] File upload attempt');
    
    if (!data) {
      logger.error({ jobId }, '[Restore] No file uploaded');
      restoreJob.status = 'failed';
      restoreJob.error = 'No file uploaded';
      await restoreJob.save();
      
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    logger.info({ jobId, filename: data.filename, mimetype: data.mimetype }, '[Restore] File received, validating');
    
    // Validate file is a zip file
    const validMimeTypes = [
      'application/zip',
      'application/x-zip',
      'application/x-zip-compressed',
      'application/octet-stream' // Sometimes browsers send this for .zip files
    ];
    
    const isValidMimeType = data.mimetype && validMimeTypes.includes(data.mimetype.toLowerCase());
    const isValidExtension = data.filename && data.filename.toLowerCase().endsWith('.zip');
    
    if (!isValidMimeType && !isValidExtension) {
      logger.error({ jobId, mimetype: data.mimetype, filename: data.filename }, '[Restore] Invalid file type');
      restoreJob.status = 'failed';
      restoreJob.error = 'Invalid file type. Only .zip files are supported.';
      await restoreJob.save();
      
      await BackupMetadata.findOneAndUpdate(
        { jobId },
        {
          status: 'failed',
          error: 'Invalid file type. Only .zip files are supported.'
        }
      );
      
      return reply.status(400).send({ error: 'Invalid file type. Only .zip files are supported.' });
    }
    
    logger.info({ jobId }, '[Restore] File validated, saving to disk');
    
    // Ensure backup directory exists
    if (!fs.existsSync(BACKUP_TEMP_DIR)) {
      fs.mkdirSync(BACKUP_TEMP_DIR, { recursive: true, mode: 0o755 });
    }
    
    // Save file to disk (stream must be consumed while request is active)
    const tempZipPath = path.join(BACKUP_TEMP_DIR, `${jobId}.zip`);
    const writeStream = createWriteStream(tempZipPath);
    
    await pipeline(data.file, writeStream);
    
    // Get uploaded file size
    const stats = fs.statSync(tempZipPath);
    restoreJob.uploadedFileSize = stats.size;
    await restoreJob.save();
    
    logger.info({ jobId, tempZipPath, fileSize: stats.size }, '[Restore] File saved to disk');
    
    // Start background job with file path
    restoreBackupInBackground(jobId, tempZipPath).catch((error) => {
      logger.error({ error, jobId }, '[Restore] Background job failed');
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
  try {
    const { jobId } = req.params;
    const restoreJob = await RestoreJob.findById(jobId);
    
    if (!restoreJob) {
      return reply.status(404).send({ error: 'Job not found' });
    }
    
    reply.send({
      status: restoreJob.status,
      uploadedFileSize: restoreJob.uploadedFileSize,
      totalCollections: restoreJob.totalCollections,
      collectionsRestored: restoreJob.collectionsRestored,
      totalRecords: restoreJob.totalRecords,
      recordsRestored: restoreJob.recordsRestored,
      imagesRestored: restoreJob.imagesRestored,
      mode: restoreJob.mode,
      warnings: restoreJob.warnings,
      error: restoreJob.error,
      createdAt: restoreJob.createdAt,
      completedAt: restoreJob.completedAt
    });
  } catch (error) {
    logger.error({ error }, '[Restore] Failed to get progress');
    reply.status(500).send({ error: 'Failed to get progress' });
  }
}

/**
 * Get recent restore jobs (for checking failures)
 */
export async function getRestoreJobs(
  req: FastifyRequest,
  reply: FastifyReply
) {
  try {
    // Get the 5 most recent restore jobs
    const jobs = await RestoreJob.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('_id status error createdAt completedAt');
    
    reply.send(jobs);
  } catch (error) {
    logger.error({ error }, '[Restore] Failed to get restore jobs');
    reply.status(500).send({ error: 'Failed to get restore jobs' });
  }
}

/**
 * Cancel backup job
 */
export async function cancelBackup(
  req: FastifyRequest<{ Params: { jobId: string } }>,
  reply: FastifyReply
) {
  try {
    const { jobId } = req.params;
    
    // Find the BackupJob in MongoDB
    const backupJob = await BackupJob.findById(jobId);
    
    if (!backupJob) {
      return reply.status(404).send({ error: 'Job not found' });
    }

    if (backupJob.status === 'ready' || backupJob.status === 'failed') {
      return reply.status(400).send({ error: 'Job already finished' });
    }

    // Mark job as cancelled
    cancelledJobs.add(jobId);
    
    // Update BackupJob status
    backupJob.status = 'failed';
    backupJob.error = 'Cancelled by user';
    await backupJob.save();

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
  } catch (error) {
    logger.error({ error }, '[Backup] Failed to cancel job');
    reply.status(500).send({ error: 'Failed to cancel backup job' });
  }
}

/**
 * Cancel restore job
 */
export async function cancelRestore(
  req: FastifyRequest<{ Params: { jobId: string } }>,
  reply: FastifyReply
) {
  try {
    const { jobId } = req.params;
    
    // Find the RestoreJob in MongoDB
    const restoreJob = await RestoreJob.findById(jobId);
    
    if (!restoreJob) {
      return reply.status(404).send({ error: 'Job not found' });
    }

    if (restoreJob.status === 'completed' || restoreJob.status === 'failed') {
      return reply.status(400).send({ error: 'Job already finished' });
    }

    // Mark job as cancelled
    cancelledJobs.add(jobId);
    
    // Update RestoreJob status
    restoreJob.status = 'failed';
    restoreJob.error = 'Cancelled by user';
    await restoreJob.save();

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
  } catch (error) {
    logger.error({ error }, '[Restore] Failed to cancel job');
    reply.status(500).send({ error: 'Failed to cancel restore job' });
  }
}

/**
 * Restore backup in background with progress tracking
 * T043-T049: RestoreJob integration with SSE progress broadcasting
 */
async function restoreBackupInBackground(jobId: string, tempZipPath: string) {
  logger.info({ jobId, tempZipPath }, '[Restore] Background function called');
  
  try {
    // Load RestoreJob record
    const restoreJob = await RestoreJob.findById(jobId);
    if (!restoreJob) {
      logger.error({ jobId }, '[Restore] RestoreJob not found');
      return;
    }

    // Check for cancellation
    if (cancelledJobs.has(jobId)) {
      logger.info({ jobId }, '[Restore] Job was cancelled before starting');
      cancelledJobs.delete(jobId);
      restoreJob.status = 'failed';
      restoreJob.error = 'Cancelled by user';
      await restoreJob.save();
      return;
    }

    logger.info({ jobId }, '[Restore] Step 1: File already saved, proceeding to extract');
    
    const tempExtractPath = path.join(BACKUP_TEMP_DIR, `${jobId}-extract`);
    
    // T045: Step 2: Extract zip file (extracting phase)
    restoreJob.status = 'extracting';
    await restoreJob.save();

    fs.mkdirSync(tempExtractPath, { recursive: true });
    
    await new Promise<void>((resolve, reject) => {
      const readStream = createReadStream(tempZipPath);
      const extractStream = Extract({ path: tempExtractPath });
      
      readStream.pipe(extractStream);
      
      extractStream.on('close', () => resolve());
      extractStream.on('error', (err) => {
        logger.error({ error: err, jobId }, '[Restore] Failed to extract zip file');
        reject(new Error('Invalid or corrupted zip file'));
      });
      readStream.on('error', (err) => {
        logger.error({ error: err, jobId }, '[Restore] Failed to read zip file');
        reject(new Error('Failed to read zip file'));
      });
    });

    logger.info('[Restore] Backup extracted');

    // Step 3: Validate and read backup data
    restoreJob.status = 'validating';
    await restoreJob.save();

    const dataJsonPath = path.join(tempExtractPath, 'data.json');
    if (!fs.existsSync(dataJsonPath)) {
      throw new Error('Invalid backup file: data.json not found. Please upload a valid backup file.');
    }

    let backupData;
    try {
      backupData = JSON.parse(fs.readFileSync(dataJsonPath, 'utf-8'));
    } catch (parseError) {
      logger.error({ parseError, jobId }, '[Restore] Failed to parse data.json');
      throw new Error('Invalid backup file: data.json is corrupted or not valid JSON.');
    }
    
    logger.info(`[Restore] Loaded backup data: version ${backupData.version}`);

    // Calculate totals
    const totalCollections = 4; // profiles, games, achievements, settings
    const totalRecords = 
      (backupData.profiles?.length || 0) +
      (backupData.games?.length || 0) +
      (backupData.achievements?.length || 0) +
      (backupData.settings?.length || 0);

    restoreJob.totalCollections = totalCollections;
    restoreJob.totalRecords = totalRecords;
    await restoreJob.save();

    // Count image files
    const imagesBackupPath = path.join(tempExtractPath, 'images');
    let totalImageFiles = 0;
    if (fs.existsSync(imagesBackupPath)) {
      totalImageFiles = await countFiles(imagesBackupPath);
      logger.info({ jobId, totalImageFiles }, '[Restore] Counted image files');
    }

    // Set total images for progress calculation
    restoreJob.totalImages = totalImageFiles;
    await restoreJob.save();

    // Calculate total work items for consistent progress calculation
    const totalWorkItems = totalRecords + totalImageFiles;

    // T046: Step 4: Restore database (restoring phase)
    restoreJob.status = 'restoring';
    await restoreJob.save();

    // T047: Track progress for each collection
    let collectionsRestored = 0;
    let recordsRestored = 0;

    // Check for cancellation
    if (cancelledJobs.has(jobId)) {
      logger.info({ jobId }, '[Restore] Job cancelled before profile import');
      cancelledJobs.delete(jobId);
      restoreJob.status = 'failed';
      restoreJob.error = 'Cancelled by user';
      await restoreJob.save();
      return;
    }

    // Import profiles
    if (backupData.profiles && Array.isArray(backupData.profiles)) {
      restoreJob.currentCollection = 'profiles';
      await restoreJob.save();

      const bulkOps = backupData.profiles.map((profile: any) => ({
        updateOne: {
          filter: { platform: profile.platform, profileId: profile.profileId },
          update: { $set: profile },
          upsert: true
        }
      }));
      
      const result = await Profile.bulkWrite(bulkOps, { ordered: false });
      recordsRestored += backupData.profiles.length;
      collectionsRestored++;

      // T049: Track warnings for duplicates
      if (result.modifiedCount < backupData.profiles.length) {
        const skipped = backupData.profiles.length - result.upsertedCount - result.modifiedCount;
        if (skipped > 0) {
          restoreJob.warnings.push({
            message: `${skipped} duplicate profiles skipped`,
            timestamp: new Date()
          });
        }
      }

      restoreJob.collectionsRestored = collectionsRestored;
      restoreJob.recordsRestored = recordsRestored;
      await restoreJob.save();

      logger.info({ jobId, imported: backupData.profiles.length }, '[Restore] Profiles imported');
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Check for cancellation
    if (cancelledJobs.has(jobId)) {
      logger.info({ jobId }, '[Restore] Job cancelled during restore');
      cancelledJobs.delete(jobId);
      restoreJob.status = 'failed';
      restoreJob.error = 'Cancelled by user';
      await restoreJob.save();
      return;
    }

    // Import games in batches
    if (backupData.games && Array.isArray(backupData.games)) {
      restoreJob.currentCollection = 'games';
      await restoreJob.save();

      const BATCH_SIZE = 100;
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
        recordsRestored += batch.length;

        // Update every 10 batches to reduce I/O
        if (i % (BATCH_SIZE * 10) === 0 || i + BATCH_SIZE >= totalGames) {
          restoreJob.recordsRestored = recordsRestored;
          await restoreJob.save();
        }

        await new Promise(resolve => setTimeout(resolve, 75));

        if (cancelledJobs.has(jobId)) {
          logger.info({ jobId }, '[Restore] Job cancelled during game import');
          cancelledJobs.delete(jobId);
          restoreJob.status = 'failed';
          restoreJob.error = 'Cancelled by user';
          await restoreJob.save();
          return;
        }
      }

      collectionsRestored++;
      logger.info({ jobId, imported: totalGames }, '[Restore] Games imported');
    }

    // Import achievements in batches
    if (backupData.achievements && Array.isArray(backupData.achievements)) {
      restoreJob.currentCollection = 'achievements';
      await restoreJob.save();

      const BATCH_SIZE = 100;
      const totalAchievements = backupData.achievements.length;
      
      for (let i = 0; i < totalAchievements; i += BATCH_SIZE) {
        const batch = backupData.achievements.slice(i, i + BATCH_SIZE);
        
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
        recordsRestored += batch.length;

        // Update every 10 batches to reduce I/O
        if (i % (BATCH_SIZE * 10) === 0 || i + BATCH_SIZE >= totalAchievements) {
          restoreJob.recordsRestored = recordsRestored;
          await restoreJob.save();
        }

        await new Promise(resolve => setTimeout(resolve, 100));

        if (cancelledJobs.has(jobId)) {
          logger.info({ jobId }, '[Restore] Job cancelled during achievement import');
          cancelledJobs.delete(jobId);
          restoreJob.status = 'failed';
          restoreJob.error = 'Cancelled by user';
          await restoreJob.save();
          return;
        }
      }

      collectionsRestored++;
      logger.info({ jobId, imported: totalAchievements }, '[Restore] Achievements imported');
    }

    // Import settings
    if (backupData.settings && Array.isArray(backupData.settings)) {
      restoreJob.currentCollection = 'settings';
      await restoreJob.save();

      await Setting.deleteMany({});
      await Setting.insertMany(backupData.settings);
      recordsRestored += backupData.settings.length;
      collectionsRestored++;

      restoreJob.collectionsRestored = collectionsRestored;
      restoreJob.recordsRestored = recordsRestored;
      await restoreJob.save();

      logger.info({ jobId, imported: backupData.settings.length }, '[Restore] Settings imported');
    }

    // Restore images directory
    if (fs.existsSync(imagesBackupPath) && totalImageFiles > 0) {
      restoreJob.currentCollection = 'images';
      await restoreJob.save();

      fs.mkdirSync(IMAGES_DIR, { recursive: true });
      
      let copiedFiles = 0;
      await copyDirectory(imagesBackupPath, IMAGES_DIR, (count) => {
        copiedFiles = count;
      });

      // Update progress after all images are copied
      restoreJob.imagesRestored = copiedFiles;
      await restoreJob.save();
      logger.info({ jobId, copiedFiles }, '[Restore] Images directory restored');
    }

    // Cleanup temp files
    fs.rmSync(tempZipPath, { force: true });
    fs.rmSync(tempExtractPath, { recursive: true, force: true });

    // T048: Complete and broadcast summary
    restoreJob.status = 'completed';
    restoreJob.completedAt = new Date();
    await restoreJob.save();

    // Update metadata (legacy compatibility)
    await BackupMetadata.findOneAndUpdate(
      { jobId },
      {
        status: 'completed',
        completedAt: new Date(),
        metadata: {
          profiles: backupData.profiles?.length || 0,
          games: backupData.games?.length || 0,
          achievements: backupData.achievements?.length || 0,
          settings: backupData.settings?.length || 0,
          images: restoreJob.imagesRestored
        }
      }
    );

    logger.info({ 
      jobId, 
      collections: restoreJob.collectionsRestored,
      records: restoreJob.recordsRestored,
      images: restoreJob.imagesRestored,
      warnings: restoreJob.warnings.length,
      metadata: {
        profiles: backupData.profiles?.length || 0,
        games: backupData.games?.length || 0,
        achievements: backupData.achievements?.length || 0,
        settings: backupData.settings?.length || 0,
        images: restoreJob.imagesRestored
      }
    }, '[Restore] Full backup restored successfully');

  } catch (error) {
    logger.error({ error, jobId }, '[Restore] Failed to restore backup');
    
    const errorMessage = error instanceof Error ? error.message : String(error);

    try {
      const restoreJob = await RestoreJob.findById(jobId);
      if (restoreJob) {
        restoreJob.status = 'failed';
        restoreJob.error = errorMessage;
        await restoreJob.save();
      }

      // Update metadata with error
      await BackupMetadata.findOneAndUpdate(
        { jobId },
        {
          status: 'failed',
          error: errorMessage
        }
      );
      
      // Cleanup temp files on failure
      const tempExtractPath = path.join(BACKUP_TEMP_DIR, `${jobId}-extract`);
      if (fs.existsSync(tempZipPath)) {
        fs.rmSync(tempZipPath, { force: true });
      }
      if (fs.existsSync(tempExtractPath)) {
        fs.rmSync(tempExtractPath, { recursive: true, force: true });
      }
    } catch (saveError) {
      logger.error({ saveError, jobId }, '[Restore] Failed to save error state');
    }
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

    // Ensure backup directory exists
    if (!fs.existsSync(BACKUP_TEMP_DIR)) {
      fs.mkdirSync(BACKUP_TEMP_DIR, { recursive: true, mode: 0o755 });
    }

    // Save uploaded file temporarily
    const tempZipPath = path.join(BACKUP_TEMP_DIR, `restore-${Date.now()}.zip`);
    const tempExtractPath = path.join(BACKUP_TEMP_DIR, `restore-extract-${Date.now()}`);
    
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
    if (backupData.settings && Array.isArray(backupData.settings)) {
      await Setting.deleteMany({});
      await Setting.insertMany(backupData.settings);
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
