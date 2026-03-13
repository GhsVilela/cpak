import { describe, it, expect, vi, beforeEach } from 'vitest';

const { profileFindByIdMock, profileFindMock, syncOpFindOneMock, syncOpFindMock, syncOpFindByIdMock, syncRunFindOneMock, syncProfileMock, markCancelledMock } = vi.hoisted(() => ({
  profileFindByIdMock: vi.fn(),
  profileFindMock: vi.fn(),
  syncOpFindOneMock: vi.fn(),
  syncOpFindMock: vi.fn(),
  syncOpFindByIdMock: vi.fn(),
  syncRunFindOneMock: vi.fn(),
  syncProfileMock: vi.fn(),
  markCancelledMock: vi.fn(),
}));

vi.mock('../../../src/models/profile.js', () => ({
  Profile: { findById: profileFindByIdMock, find: profileFindMock },
}));

vi.mock('../../../src/models/syncOperation.js', () => ({
  SyncOperation: {
    findOne: syncOpFindOneMock,
    find: syncOpFindMock,
    findById: syncOpFindByIdMock,
  },
}));

vi.mock('../../../src/models/syncRun.js', () => ({
  SyncRun: { findOne: syncRunFindOneMock, create: vi.fn().mockResolvedValue({}) },
}));

vi.mock('../../../src/services/syncService.js', () => ({
  syncService: { syncProfile: syncProfileMock },
}));

vi.mock('../../../src/services/syncCancellation.js', () => ({
  markSyncAsCancelled: markCancelledMock,
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { triggerSync, getSyncStatus, cancelSync } from '../../../src/api/routes/sync.js';

function createMockReply() {
  const reply: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) { reply.statusCode = code; return reply; },
    send(data: any) { reply.body = data; return reply; },
  };
  return reply;
}

describe('Sync Route Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    syncProfileMock.mockResolvedValue(undefined);
  });

  // --- triggerSync ---

  describe('triggerSync', () => {
    it('returns 400 for invalid platform', async () => {
      const reply = createMockReply();
      await triggerSync({ params: { platform: 'nintendo' as any }, query: {} } as any, reply);
      expect(reply.statusCode).toBe(400);
    });

    it('syncs specific profile when profileId provided', async () => {
      profileFindByIdMock.mockResolvedValue({ _id: 'id1', platform: 'steam', profileId: 'steam123' });
      const reply = createMockReply();
      await triggerSync({
        params: { platform: 'steam' },
        query: { profileId: 'id1' },
      } as any, reply);
      expect(reply.body.message).toBe('Sync started');
      expect(reply.body.profileId).toBe('steam123');
    });

    it('returns 404 when profile not found', async () => {
      profileFindByIdMock.mockResolvedValue(null);
      const reply = createMockReply();
      await triggerSync({
        params: { platform: 'steam' },
        query: { profileId: 'nonexist' },
      } as any, reply);
      expect(reply.statusCode).toBe(404);
    });

    it('returns 400 on platform mismatch', async () => {
      profileFindByIdMock.mockResolvedValue({ _id: 'id1', platform: 'xbox', profileId: 'xbox123' });
      const reply = createMockReply();
      await triggerSync({
        params: { platform: 'steam' },
        query: { profileId: 'id1' },
      } as any, reply);
      expect(reply.statusCode).toBe(400);
    });

    it('syncs all profiles when no profileId provided', async () => {
      profileFindMock.mockResolvedValue([
        { _id: 'id1', platform: 'steam', profileId: 's1' },
        { _id: 'id2', platform: 'steam', profileId: 's2' },
      ]);
      const reply = createMockReply();
      await triggerSync({
        params: { platform: 'steam' },
        query: {},
      } as any, reply);
      expect(reply.body.count).toBe(2);
    });

    it('returns 404 when no profiles found for platform', async () => {
      profileFindMock.mockResolvedValue([]);
      const reply = createMockReply();
      await triggerSync({
        params: { platform: 'playstation' },
        query: {},
      } as any, reply);
      expect(reply.statusCode).toBe(404);
    });

    it('returns 500 on error', async () => {
      profileFindByIdMock.mockRejectedValue(new Error('DB'));
      const reply = createMockReply();
      await triggerSync({
        params: { platform: 'steam' },
        query: { profileId: 'id1' },
      } as any, reply);
      expect(reply.statusCode).toBe(500);
    });
  });

  // --- getSyncStatus ---

  describe('getSyncStatus', () => {
    it('returns current sync progress for profile with active operation', async () => {
      syncOpFindOneMock.mockReturnValue({
        sort: vi.fn().mockResolvedValue({
          _id: { toString: () => 'op1' },
          status: 'running',
          totalGames: 10,
          gamesCompleted: 5,
          imagesCompleted: 5,
          iconDownloadsPending: 0,
          iconDownloadsCompleted: 0,
        }),
      });
      syncRunFindOneMock.mockReturnValue({
        sort: vi.fn().mockResolvedValue(null),
      });

      const reply = createMockReply();
      await getSyncStatus({ query: { profileId: 'p1' } } as any, reply);
      expect(reply.body.current).toBeDefined();
      expect(reply.body.current.status).toBe('running');
      expect(reply.body.current.progress).toBeGreaterThan(0);
    });

    it('returns empty object when no active sync and no history', async () => {
      syncOpFindOneMock.mockReturnValue({ sort: vi.fn().mockResolvedValue(null) });
      syncRunFindOneMock.mockReturnValue({ sort: vi.fn().mockResolvedValue(null) });

      const reply = createMockReply();
      await getSyncStatus({ query: { profileId: 'p1' } } as any, reply);
      expect(reply.body.current).toBeUndefined();
      expect(reply.body.lastCompleted).toBeUndefined();
    });

    it('returns last completed sync info', async () => {
      syncOpFindOneMock.mockReturnValue({ sort: vi.fn().mockResolvedValue(null) });
      syncRunFindOneMock.mockReturnValue({
        sort: vi.fn().mockResolvedValue({
          completedAt: new Date('2025-01-01'),
          status: 'success',
          error: null,
        }),
      });

      const reply = createMockReply();
      await getSyncStatus({ query: { profileId: 'p1' } } as any, reply);
      expect(reply.body.lastCompleted).toBeDefined();
      expect(reply.body.lastCompleted.status).toBe('success');
    });

    it('returns all active syncs when no profileId', async () => {
      syncOpFindMock.mockReturnValue({
        populate: vi.fn().mockResolvedValue([
          { _id: { toString: () => 'op1' }, profileId: 'p1', platform: 'steam', status: 'running', startedAt: new Date() },
        ]),
      });

      const reply = createMockReply();
      await getSyncStatus({ query: {} } as any, reply);
      expect(reply.body.activeSyncs).toHaveLength(1);
    });

    it('shows progress phases correctly', async () => {
      // Phase 1: Downloading images (gamesProcessed === 0)
      syncOpFindOneMock.mockReturnValue({
        sort: vi.fn().mockResolvedValue({
          _id: { toString: () => 'op1' },
          status: 'running',
          totalGames: 10,
          gamesProcessed: 0,
          imagesCompleted: 3,
          iconDownloadsPending: 0,
          iconDownloadsCompleted: 0,
        }),
      });
      syncRunFindOneMock.mockReturnValue({ sort: vi.fn().mockResolvedValue(null) });

      const reply = createMockReply();
      await getSyncStatus({ query: { profileId: 'p1' } } as any, reply);
      expect(reply.body.current.message).toContain('Downloading game images');
    });

    it('shows icon download progress phase', async () => {
      syncOpFindOneMock.mockReturnValue({
        sort: vi.fn().mockResolvedValue({
          _id: { toString: () => 'op1' },
          status: 'running',
          totalGames: 10,
          gamesProcessed: 10,
          imagesCompleted: 10,
          iconDownloadsPending: 20,
          iconDownloadsCompleted: 10,
        }),
      });
      syncRunFindOneMock.mockReturnValue({ sort: vi.fn().mockResolvedValue(null) });

      const reply = createMockReply();
      await getSyncStatus({ query: { profileId: 'p1' } } as any, reply);
      expect(reply.body.current.message).toContain('achievement icons');
      expect(reply.body.current.progress).toBeGreaterThanOrEqual(66);
    });

    it('shows icon download starting phase (pending > 0, completed === 0)', async () => {
      syncOpFindOneMock.mockReturnValue({
        sort: vi.fn().mockResolvedValue({
          _id: { toString: () => 'op1' },
          status: 'running',
          totalGames: 10,
          gamesProcessed: 10,
          imagesCompleted: 10,
          iconDownloadsPending: 20,
          iconDownloadsCompleted: 0,
        }),
      });
      syncRunFindOneMock.mockReturnValue({ sort: vi.fn().mockResolvedValue(null) });

      const reply = createMockReply();
      await getSyncStatus({ query: { profileId: 'p1' } } as any, reply);
      expect(reply.body.current.progress).toBe(66);
      expect(reply.body.current.message).toContain('achievement icons');
    });

    it('returns 500 on error', async () => {
      syncOpFindOneMock.mockImplementation(() => { throw new Error('DB'); });
      const reply = createMockReply();
      await getSyncStatus({ query: { profileId: 'p1' } } as any, reply);
      expect(reply.statusCode).toBe(500);
    });
  });

  // --- cancelSync ---

  describe('cancelSync', () => {
    it('cancels an active sync operation', async () => {
      const saveMock = vi.fn().mockResolvedValue(undefined);
      syncOpFindByIdMock.mockResolvedValue({
        _id: 'op1',
        status: 'running',
        profileId: 'p1',
        platform: 'steam',
        startedAt: new Date(),
        completedAt: null,
        syncErrors: [],
        save: saveMock,
      });

      const reply = createMockReply();
      await cancelSync({ params: { operationId: 'op1' } } as any, reply);
      expect(reply.body.message).toBe('Sync cancelled');
      expect(markCancelledMock).toHaveBeenCalledWith('op1');
    });

    it('returns 404 when operation not found', async () => {
      syncOpFindByIdMock.mockResolvedValue(null);
      const reply = createMockReply();
      await cancelSync({ params: { operationId: 'none' } } as any, reply);
      expect(reply.statusCode).toBe(404);
    });

    it('returns 400 when operation already finished', async () => {
      syncOpFindByIdMock.mockResolvedValue({ status: 'completed' });
      const reply = createMockReply();
      await cancelSync({ params: { operationId: 'op1' } } as any, reply);
      expect(reply.statusCode).toBe(400);
    });

    it('returns 500 on error', async () => {
      syncOpFindByIdMock.mockRejectedValue(new Error('DB'));
      const reply = createMockReply();
      await cancelSync({ params: { operationId: 'op1' } } as any, reply);
      expect(reply.statusCode).toBe(500);
    });
  });
});
