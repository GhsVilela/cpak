import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  gameFindMock, gameCountDocumentsMock, gameFindOneMock, gameFindByIdMock, gameAggregateMock,
  profileFindByIdMock,
} = vi.hoisted(() => ({
  gameFindMock: vi.fn(),
  gameCountDocumentsMock: vi.fn(),
  gameFindOneMock: vi.fn(),
  gameFindByIdMock: vi.fn(),
  gameAggregateMock: vi.fn(),
  profileFindByIdMock: vi.fn(),
}));

vi.mock('../../../src/models/game.js', () => ({
  Game: {
    find: gameFindMock,
    countDocuments: gameCountDocumentsMock,
    findOne: gameFindOneMock,
    findById: gameFindByIdMock,
    aggregate: gameAggregateMock,
  },
}));

vi.mock('../../../src/models/profile.js', () => ({
  Profile: { findById: profileFindByIdMock },
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { getGames, getGameById } from '../../../src/api/routes/games.js';

function createMockReply() {
  const reply: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) { reply.statusCode = code; return reply; },
    send(data: any) { reply.body = data; return reply; },
  };
  return reply;
}

function chainedQuery(result: any[]) {
  return {
    collation: vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          skip: vi.fn().mockReturnValue({
            lean: vi.fn().mockResolvedValue(result),
          }),
        }),
      }),
    }),
  };
}

describe('Games Route Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- getGames ---
  describe('getGames', () => {
    it('returns paginated games with defaults', async () => {
      const games = [{ _id: '1', title: 'Game1' }];
      gameCountDocumentsMock.mockResolvedValue(1);
      gameFindMock.mockReturnValue(chainedQuery(games));

      const reply = createMockReply();
      await getGames({ query: {} } as any, reply);
      expect(reply.body.data).toHaveLength(1);
      expect(reply.body.pagination.total).toBe(1);
      expect(reply.body.pagination.limit).toBe(50);
      expect(reply.body.pagination.offset).toBe(0);
    });

    it('filters by platform', async () => {
      gameCountDocumentsMock.mockResolvedValue(0);
      gameFindMock.mockReturnValue(chainedQuery([]));

      const reply = createMockReply();
      await getGames({ query: { platform: 'steam' } } as any, reply);
      expect(reply.body.data).toEqual([]);
    });

    it('returns 400 for invalid platform', async () => {
      const reply = createMockReply();
      await getGames({ query: { platform: 'invalid' } } as any, reply);
      expect(reply.statusCode).toBe(400);
    });

    it('filters by profileId', async () => {
      profileFindByIdMock.mockResolvedValue({ _id: 'p1' });
      gameCountDocumentsMock.mockResolvedValue(0);
      gameFindMock.mockReturnValue(chainedQuery([]));

      const reply = createMockReply();
      await getGames({ query: { profileId: 'p1' } } as any, reply);
      expect(reply.body.data).toEqual([]);
    });

    it('returns 404 when profileId not found', async () => {
      profileFindByIdMock.mockResolvedValue(null);
      const reply = createMockReply();
      await getGames({ query: { profileId: 'bad' } } as any, reply);
      expect(reply.statusCode).toBe(404);
    });

    it('filters by onlyCompleted', async () => {
      gameCountDocumentsMock.mockResolvedValue(0);
      gameFindMock.mockReturnValue(chainedQuery([]));

      const reply = createMockReply();
      await getGames({ query: { onlyCompleted: 'true' } } as any, reply);
      expect(reply.body.pagination.total).toBe(0);
    });

    it('excludes hidden games when excludeHidden is true', async () => {
      gameCountDocumentsMock.mockResolvedValue(1);
      gameFindMock.mockReturnValue(chainedQuery([{ _id: '1', title: 'Visible Game' }]));

      const reply = createMockReply();
      await getGames({ query: { excludeHidden: 'true' } } as any, reply);
      expect(reply.body.data).toHaveLength(1);
      // Verify $or filter was applied to the countDocuments call
      const filterArg = gameCountDocumentsMock.mock.calls[0][0];
      expect(filterArg.$or).toEqual([
        { ownershipSource: { $ne: 'played_history' } },
        { achievementsFetchFailed: { $ne: true } },
      ]);
    });

    it('filters by device PlayAnywhere', async () => {
      gameCountDocumentsMock.mockResolvedValue(0);
      gameFindMock.mockReturnValue(chainedQuery([]));

      const reply = createMockReply();
      await getGames({ query: { device: 'PlayAnywhere' } } as any, reply);
      expect(reply.body.data).toEqual([]);
    });

    it('filters by device ConsoleOnly', async () => {
      gameCountDocumentsMock.mockResolvedValue(0);
      gameFindMock.mockReturnValue(chainedQuery([]));

      const reply = createMockReply();
      await getGames({ query: { device: 'ConsoleOnly' } } as any, reply);
      expect(reply.body.data).toEqual([]);
    });

    it('filters by specific device', async () => {
      gameCountDocumentsMock.mockResolvedValue(0);
      gameFindMock.mockReturnValue(chainedQuery([]));

      const reply = createMockReply();
      await getGames({ query: { device: 'XboxSeries' } } as any, reply);
      expect(reply.body.data).toEqual([]);
    });

    it('includes gamerscore aggregation for xbox platform with profileId', async () => {
      profileFindByIdMock.mockResolvedValue({ _id: 'p1' });
      gameCountDocumentsMock.mockResolvedValue(2);
      gameAggregateMock.mockResolvedValue([{ totalCurrentGamerscore: 1500, totalMaxGamerscore: 3000 }]);
      gameFindMock.mockReturnValue(chainedQuery([{ _id: '1', title: 'Halo' }]));

      const reply = createMockReply();
      await getGames({ query: { platform: 'xbox', profileId: 'p1' } } as any, reply);
      expect(reply.body.pagination.totalCurrentGamerscore).toBe(1500);
      expect(reply.body.pagination.totalMaxGamerscore).toBe(3000);
    });

    it('clamps pagination params', async () => {
      gameCountDocumentsMock.mockResolvedValue(0);
      gameFindMock.mockReturnValue(chainedQuery([]));

      const reply = createMockReply();
      await getGames({ query: { limit: '9999', offset: '-5' } } as any, reply);
      expect(reply.body.pagination.limit).toBe(500);
      expect(reply.body.pagination.offset).toBe(0);
    });

    it('returns 500 on database error', async () => {
      gameCountDocumentsMock.mockRejectedValue(new Error('db'));
      const reply = createMockReply();
      await getGames({ query: {} } as any, reply);
      expect(reply.statusCode).toBe(500);
    });

    it('includes achievements aggregation for steam platform with profileId', async () => {
      profileFindByIdMock.mockResolvedValue({ _id: 'p1' });
      gameCountDocumentsMock.mockResolvedValue(3);
      gameAggregateMock.mockResolvedValue([{ total: 42 }]);
      gameFindMock.mockReturnValue(chainedQuery([{ _id: '1', title: 'TF2' }]));

      const reply = createMockReply();
      await getGames({ query: { platform: 'steam', profileId: 'p1' } } as any, reply);
      expect(reply.body.pagination.totalAchievementsUnlocked).toBe(42);
    });

    it('sorts by completionPercent with achievementsUnlocked as tiebreaker', async () => {
      gameCountDocumentsMock.mockResolvedValue(2);
      gameFindMock.mockReturnValue(chainedQuery([{ _id: '1', title: 'Game' }]));

      const reply = createMockReply();
      await getGames({ query: { sortBy: 'completionPercent' } } as any, reply);
      expect(reply.statusCode).toBe(200);
    });
  });

  // --- getGameById ---
  describe('getGameById', () => {
    it('returns game by MongoDB _id when no platform specified', async () => {
      gameFindByIdMock.mockReturnValue({
        lean: vi.fn().mockResolvedValue({ _id: 'g1', title: 'Halo' }),
      });

      const reply = createMockReply();
      await getGameById({ params: { id: 'g1' }, query: {} } as any, reply);
      expect(reply.body.title).toBe('Halo');
    });

    it('returns game by gameId and platform when platform specified', async () => {
      gameFindOneMock.mockReturnValue({
        lean: vi.fn().mockResolvedValue({ gameId: '440', platform: 'steam', title: 'TF2' }),
      });

      const reply = createMockReply();
      await getGameById({ params: { id: '440' }, query: { platform: 'steam' } } as any, reply);
      expect(reply.body.title).toBe('TF2');
    });

    it('uses profileId filter when provided with platform', async () => {
      profileFindByIdMock.mockResolvedValue({ _id: 'p1' });
      gameFindOneMock.mockReturnValue({
        lean: vi.fn().mockResolvedValue({ gameId: '440', platform: 'steam' }),
      });

      const reply = createMockReply();
      await getGameById({ params: { id: '440' }, query: { platform: 'steam', profileId: 'p1' } } as any, reply);
      expect(profileFindByIdMock).toHaveBeenCalledWith('p1');
    });

    it('returns 404 when profile not found for profileId filter', async () => {
      profileFindByIdMock.mockResolvedValue(null);
      const reply = createMockReply();
      await getGameById({ params: { id: '440' }, query: { platform: 'steam', profileId: 'bad' } } as any, reply);
      expect(reply.statusCode).toBe(404);
    });

    it('returns 404 when game not found', async () => {
      gameFindByIdMock.mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      });

      const reply = createMockReply();
      await getGameById({ params: { id: '999' }, query: {} } as any, reply);
      expect(reply.statusCode).toBe(404);
    });

    it('returns 500 on error', async () => {
      gameFindByIdMock.mockReturnValue({
        lean: vi.fn().mockRejectedValue(new Error('db')),
      });

      const reply = createMockReply();
      await getGameById({ params: { id: 'g1' }, query: {} } as any, reply);
      expect(reply.statusCode).toBe(500);
    });
  });
});
