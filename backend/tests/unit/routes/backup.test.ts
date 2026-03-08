import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  backupJobFindByIdMock, backupJobCreateMock, backupJobFindOneMock,
  restoreJobFindByIdMock, restoreJobFindOneMock, restoreJobFindMock,
  backupMetadataFindOneMock, backupMetadataFindOneAndUpdateMock, backupMetadataCreateMock,
  existsSyncMock, statSyncMock,
} = vi.hoisted(() => ({
  backupJobFindByIdMock: vi.fn(),
  backupJobCreateMock: vi.fn(),
  backupJobFindOneMock: vi.fn(),
  restoreJobFindByIdMock: vi.fn(),
  restoreJobFindOneMock: vi.fn(),
  restoreJobFindMock: vi.fn(),
  backupMetadataFindOneMock: vi.fn(),
  backupMetadataFindOneAndUpdateMock: vi.fn(),
  backupMetadataCreateMock: vi.fn(),
  existsSyncMock: vi.fn(),
  statSyncMock: vi.fn(),
}));

vi.mock('../../../src/models/backupJob.js', () => ({
  BackupJob: {
    findById: backupJobFindByIdMock,
    create: backupJobCreateMock,
    findOne: backupJobFindOneMock,
  },
}));

vi.mock('../../../src/models/restoreJob.js', () => ({
  RestoreJob: {
    findById: restoreJobFindByIdMock,
    findOne: restoreJobFindOneMock,
    find: restoreJobFindMock,
  },
}));

vi.mock('../../../src/models/backupMetadata.js', () => ({
  BackupMetadata: {
    findOne: backupMetadataFindOneMock,
    findOneAndUpdate: backupMetadataFindOneAndUpdateMock,
    create: backupMetadataCreateMock,
  },
}));

vi.mock('../../../src/models/profile.js', () => ({
  Profile: { find: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) },
}));
vi.mock('../../../src/models/game.js', () => ({
  Game: { find: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) },
}));
vi.mock('../../../src/models/achievement.js', () => ({
  Achievement: { find: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) },
}));
vi.mock('../../../src/models/setting.js', () => ({
  Setting: { find: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) },
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    default: { ...actual, existsSync: existsSyncMock, statSync: statSyncMock },
    existsSync: existsSyncMock,
    statSync: statSyncMock,
  };
});

vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  getStatus, startBackup, getBackupProgress, downloadBackup,
  cancelBackup, cancelRestore, getRestoreProgress, getRestoreJobs,
} from '../../../src/api/routes/backup.js';

function createMockReply() {
  const reply: any = {
    statusCode: 200,
    body: undefined,
    raw: { writeHead: vi.fn() },
    status(code: number) { reply.statusCode = code; return reply; },
    send(data: any) { reply.body = data; return reply; },
  };
  return reply;
}

describe('Backup Route Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- getStatus ---
  describe('getStatus', () => {
    it('returns empty status when no active jobs or history', async () => {
      backupJobFindOneMock.mockReturnValue({ sort: vi.fn().mockResolvedValue(null) });
      restoreJobFindOneMock.mockReturnValue({ sort: vi.fn().mockResolvedValue(null) });
      backupMetadataFindOneMock.mockReturnValue({ sort: vi.fn().mockResolvedValue(null) });
      existsSyncMock.mockReturnValue(false);

      const reply = createMockReply();
      await getStatus({} as any, reply);
      expect(reply.body.backup.current).toBeNull();
      expect(reply.body.restore.current).toBeNull();
    });

    it('returns active backup job with preparing status', async () => {
      const activeJob = {
        _id: { toString: () => 'job1' },
        status: 'preparing',
        totalRecords: 100,
        recordsProcessed: 50,
      };
      backupJobFindOneMock.mockReturnValue({ sort: vi.fn().mockResolvedValue(activeJob) });
      restoreJobFindOneMock.mockReturnValue({ sort: vi.fn().mockResolvedValue(null) });
      backupMetadataFindOneMock.mockReturnValue({ sort: vi.fn().mockResolvedValue(null) });
      existsSyncMock.mockReturnValue(false);

      const reply = createMockReply();
      await getStatus({} as any, reply);
      expect(reply.body.backup.current.jobId).toBe('job1');
      expect(reply.body.backup.current.status).toBe('preparing');
      expect(reply.body.backup.current.progress).toBe(50);
    });

    it('returns active backup job with compressing status', async () => {
      const activeJob = {
        _id: { toString: () => 'job1' },
        status: 'compressing',
        fileSize: 0,
        metadata: null,
      };
      backupJobFindOneMock.mockReturnValue({ sort: vi.fn().mockResolvedValue(activeJob) });
      restoreJobFindOneMock.mockReturnValue({ sort: vi.fn().mockResolvedValue(null) });
      backupMetadataFindOneMock.mockReturnValue({ sort: vi.fn().mockResolvedValue(null) });
      existsSyncMock.mockReturnValue(false);

      const reply = createMockReply();
      await getStatus({} as any, reply);
      expect(reply.body.backup.current.progress).toBe(50);
    });

    it('returns active restore job with restoring status', async () => {
      const activeRestore = {
        _id: { toString: () => 'rjob1' },
        status: 'restoring',
        totalRecords: 200,
        recordsRestored: 100,
        totalImages: 50,
        imagesRestored: 25,
        currentCollection: 'games',
      };
      backupJobFindOneMock.mockReturnValue({ sort: vi.fn().mockResolvedValue(null) });
      restoreJobFindOneMock.mockReturnValue({ sort: vi.fn().mockResolvedValue(activeRestore) });
      backupMetadataFindOneMock.mockReturnValue({ sort: vi.fn().mockResolvedValue(null) });
      existsSyncMock.mockReturnValue(false);

      const reply = createMockReply();
      await getStatus({} as any, reply);
      expect(reply.body.restore.current.jobId).toBe('rjob1');
      expect(reply.body.restore.current.status).toBe('restoring');
      expect(reply.body.restore.current.progress).toBe(50);
    });

    it('returns active restore job with images collection', async () => {
      const activeRestore = {
        _id: { toString: () => 'rjob1' },
        status: 'restoring',
        totalRecords: 0,
        recordsRestored: 0,
        totalImages: 100,
        imagesRestored: 50,
        currentCollection: 'images',
      };
      backupJobFindOneMock.mockReturnValue({ sort: vi.fn().mockResolvedValue(null) });
      restoreJobFindOneMock.mockReturnValue({ sort: vi.fn().mockResolvedValue(activeRestore) });
      backupMetadataFindOneMock.mockReturnValue({ sort: vi.fn().mockResolvedValue(null) });
      existsSyncMock.mockReturnValue(false);

      const reply = createMockReply();
      await getStatus({} as any, reply);
      expect(reply.body.restore.current.message).toContain('images');
    });

    it('returns active restore job with extracting status', async () => {
      const activeRestore = {
        _id: { toString: () => 'rjob1' },
        status: 'extracting',
        totalRecords: 0,
        recordsRestored: 0,
        totalImages: 0,
        imagesRestored: 0,
        currentCollection: '',
      };
      backupJobFindOneMock.mockReturnValue({ sort: vi.fn().mockResolvedValue(null) });
      restoreJobFindOneMock.mockReturnValue({ sort: vi.fn().mockResolvedValue(activeRestore) });
      backupMetadataFindOneMock.mockReturnValue({ sort: vi.fn().mockResolvedValue(null) });
      existsSyncMock.mockReturnValue(false);

      const reply = createMockReply();
      await getStatus({} as any, reply);
      expect(reply.body.restore.current.message).toContain('Extracting');
    });

    it('returns active restore job with validating status', async () => {
      const activeRestore = {
        _id: { toString: () => 'rjob1' },
        status: 'validating',
        totalRecords: 0,
        recordsRestored: 0,
        totalImages: 0,
        imagesRestored: 0,
        currentCollection: '',
      };
      backupJobFindOneMock.mockReturnValue({ sort: vi.fn().mockResolvedValue(null) });
      restoreJobFindOneMock.mockReturnValue({ sort: vi.fn().mockResolvedValue(activeRestore) });
      backupMetadataFindOneMock.mockReturnValue({ sort: vi.fn().mockResolvedValue(null) });
      existsSyncMock.mockReturnValue(false);

      const reply = createMockReply();
      await getStatus({} as any, reply);
      expect(reply.body.restore.current.message).toContain('Validating');
    });

    it('shows backup ready when file exists', async () => {
      backupJobFindOneMock.mockReturnValue({ sort: vi.fn().mockResolvedValue(null) });
      restoreJobFindOneMock.mockReturnValue({ sort: vi.fn().mockResolvedValue(null) });
      const lastBackup = { completedAt: new Date(), downloadedAt: null, jobId: 'j1', filePath: '/tmp/backup.zip' };
      const lastRestore = null;
      const lastFailedRestore = null;
      // First call returns lastBackup, second returns lastRestore, third returns lastFailedRestore
      let metaCallIndex = 0;
      backupMetadataFindOneMock.mockImplementation(() => ({
        sort: vi.fn().mockImplementation(() => {
          metaCallIndex++;
          if (metaCallIndex === 1) return Promise.resolve(lastBackup);
          return Promise.resolve(null);
        }),
      }));
      restoreJobFindOneMock.mockReturnValue({ sort: vi.fn().mockResolvedValue(null) });
      existsSyncMock.mockReturnValue(true);

      const reply = createMockReply();
      await getStatus({} as any, reply);
      expect(reply.body.backup.ready).toBe(true);
    });

    it('returns 500 on error', async () => {
      backupJobFindOneMock.mockImplementation(() => { throw new Error('db'); });
      const reply = createMockReply();
      await getStatus({} as any, reply);
      expect(reply.statusCode).toBe(500);
    });
  });

  // --- startBackup ---
  describe('startBackup', () => {
    it('creates backup job and returns jobId', async () => {
      backupJobCreateMock.mockResolvedValue({ _id: { toString: () => 'newjob' } });
      backupMetadataCreateMock.mockResolvedValue({});

      const reply = createMockReply();
      await startBackup({} as any, reply);
      expect(reply.body.jobId).toBe('newjob');
    });

    it('returns 500 on database error', async () => {
      backupJobCreateMock.mockRejectedValue(new Error('db'));
      const reply = createMockReply();
      await startBackup({} as any, reply);
      expect(reply.statusCode).toBe(500);
    });
  });

  // --- getBackupProgress ---
  describe('getBackupProgress', () => {
    it('returns backup job progress', async () => {
      backupJobFindByIdMock.mockResolvedValue({
        status: 'preparing',
        totalCollections: 4,
        collectionsProcessed: 2,
        totalRecords: 100,
        recordsProcessed: 50,
        fileSize: 0,
        filePath: null,
        error: null,
        createdAt: new Date(),
        completedAt: null,
      });

      const reply = createMockReply();
      await getBackupProgress({ params: { jobId: 'j1' } } as any, reply);
      expect(reply.body.status).toBe('preparing');
      expect(reply.body.totalRecords).toBe(100);
      expect(reply.body.recordsProcessed).toBe(50);
    });

    it('returns 404 when job not found', async () => {
      backupJobFindByIdMock.mockResolvedValue(null);
      const reply = createMockReply();
      await getBackupProgress({ params: { jobId: 'bad' } } as any, reply);
      expect(reply.statusCode).toBe(404);
    });

    it('returns 500 on error', async () => {
      backupJobFindByIdMock.mockRejectedValue(new Error('db'));
      const reply = createMockReply();
      await getBackupProgress({ params: { jobId: 'j1' } } as any, reply);
      expect(reply.statusCode).toBe(500);
    });
  });

  // --- downloadBackup ---
  describe('downloadBackup', () => {
    it('returns 404 when job not found', async () => {
      backupJobFindByIdMock.mockResolvedValue(null);
      const reply = createMockReply();
      await downloadBackup({ params: { jobId: 'bad' } } as any, reply);
      expect(reply.statusCode).toBe(404);
    });

    it('returns 400 when backup not ready', async () => {
      backupJobFindByIdMock.mockResolvedValue({ status: 'preparing', filePath: null });
      const reply = createMockReply();
      await downloadBackup({ params: { jobId: 'j1' } } as any, reply);
      expect(reply.statusCode).toBe(400);
    });

    it('returns 404 when file not found on disk', async () => {
      backupJobFindByIdMock.mockResolvedValue({ status: 'ready', filePath: '/tmp/backup.zip' });
      existsSyncMock.mockReturnValue(false);
      const reply = createMockReply();
      await downloadBackup({ params: { jobId: 'j1' } } as any, reply);
      expect(reply.statusCode).toBe(404);
    });

    it('returns 500 on error', async () => {
      backupJobFindByIdMock.mockRejectedValue(new Error('db'));
      const reply = createMockReply();
      await downloadBackup({ params: { jobId: 'j1' } } as any, reply);
      expect(reply.statusCode).toBe(500);
    });
  });

  // --- getRestoreProgress ---
  describe('getRestoreProgress', () => {
    it('returns restore job progress', async () => {
      restoreJobFindByIdMock.mockResolvedValue({
        status: 'restoring',
        uploadedFileSize: 1024,
        totalCollections: 4,
        collectionsRestored: 2,
        totalRecords: 50,
        recordsRestored: 25,
        imagesRestored: 10,
        mode: 'full',
        warnings: [],
        error: null,
        createdAt: new Date(),
        completedAt: null,
      });

      const reply = createMockReply();
      await getRestoreProgress({ params: { jobId: 'rj1' } } as any, reply);
      expect(reply.body.status).toBe('restoring');
      expect(reply.body.recordsRestored).toBe(25);
    });

    it('returns 404 when job not found', async () => {
      restoreJobFindByIdMock.mockResolvedValue(null);
      const reply = createMockReply();
      await getRestoreProgress({ params: { jobId: 'bad' } } as any, reply);
      expect(reply.statusCode).toBe(404);
    });

    it('returns 500 on error', async () => {
      restoreJobFindByIdMock.mockRejectedValue(new Error('db'));
      const reply = createMockReply();
      await getRestoreProgress({ params: { jobId: 'rj1' } } as any, reply);
      expect(reply.statusCode).toBe(500);
    });
  });

  // --- getRestoreJobs ---
  describe('getRestoreJobs', () => {
    it('returns recent restore jobs', async () => {
      const sortMock = vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue([
            { _id: 'rj1', status: 'completed' },
            { _id: 'rj2', status: 'failed' },
          ]),
        }),
      });
      restoreJobFindMock.mockReturnValue({ sort: sortMock });

      const reply = createMockReply();
      await getRestoreJobs({} as any, reply);
      expect(reply.body).toHaveLength(2);
    });

    it('returns 500 on error', async () => {
      restoreJobFindMock.mockImplementation(() => { throw new Error('db'); });
      const reply = createMockReply();
      await getRestoreJobs({} as any, reply);
      expect(reply.statusCode).toBe(500);
    });
  });

  // --- cancelBackup ---
  describe('cancelBackup', () => {
    it('cancels an active backup job', async () => {
      const saveMock = vi.fn().mockResolvedValue(undefined);
      backupJobFindByIdMock.mockResolvedValue({ status: 'preparing', save: saveMock });
      backupMetadataFindOneAndUpdateMock.mockResolvedValue({});

      const reply = createMockReply();
      await cancelBackup({ params: { jobId: 'j1' } } as any, reply);
      expect(reply.body.message).toBe('Backup cancelled');
      expect(saveMock).toHaveBeenCalled();
    });

    it('returns 404 when job not found', async () => {
      backupJobFindByIdMock.mockResolvedValue(null);
      const reply = createMockReply();
      await cancelBackup({ params: { jobId: 'bad' } } as any, reply);
      expect(reply.statusCode).toBe(404);
    });

    it('returns 400 when job already finished (ready)', async () => {
      backupJobFindByIdMock.mockResolvedValue({ status: 'ready' });
      const reply = createMockReply();
      await cancelBackup({ params: { jobId: 'j1' } } as any, reply);
      expect(reply.statusCode).toBe(400);
    });

    it('returns 400 when job already failed', async () => {
      backupJobFindByIdMock.mockResolvedValue({ status: 'failed' });
      const reply = createMockReply();
      await cancelBackup({ params: { jobId: 'j1' } } as any, reply);
      expect(reply.statusCode).toBe(400);
    });

    it('returns 500 on error', async () => {
      backupJobFindByIdMock.mockRejectedValue(new Error('db'));
      const reply = createMockReply();
      await cancelBackup({ params: { jobId: 'j1' } } as any, reply);
      expect(reply.statusCode).toBe(500);
    });
  });

  // --- cancelRestore ---
  describe('cancelRestore', () => {
    it('cancels an active restore job', async () => {
      const saveMock = vi.fn().mockResolvedValue(undefined);
      restoreJobFindByIdMock.mockResolvedValue({ status: 'restoring', save: saveMock });
      backupMetadataFindOneAndUpdateMock.mockResolvedValue({});

      const reply = createMockReply();
      await cancelRestore({ params: { jobId: 'rj1' } } as any, reply);
      expect(reply.body.message).toBe('Restore cancelled');
      expect(saveMock).toHaveBeenCalled();
    });

    it('returns 404 when job not found', async () => {
      restoreJobFindByIdMock.mockResolvedValue(null);
      const reply = createMockReply();
      await cancelRestore({ params: { jobId: 'bad' } } as any, reply);
      expect(reply.statusCode).toBe(404);
    });

    it('returns 400 when job already completed', async () => {
      restoreJobFindByIdMock.mockResolvedValue({ status: 'completed' });
      const reply = createMockReply();
      await cancelRestore({ params: { jobId: 'rj1' } } as any, reply);
      expect(reply.statusCode).toBe(400);
    });

    it('returns 400 when job already failed', async () => {
      restoreJobFindByIdMock.mockResolvedValue({ status: 'failed' });
      const reply = createMockReply();
      await cancelRestore({ params: { jobId: 'rj1' } } as any, reply);
      expect(reply.statusCode).toBe(400);
    });

    it('returns 500 on error', async () => {
      restoreJobFindByIdMock.mockRejectedValue(new Error('db'));
      const reply = createMockReply();
      await cancelRestore({ params: { jobId: 'rj1' } } as any, reply);
      expect(reply.statusCode).toBe(500);
    });
  });
});
