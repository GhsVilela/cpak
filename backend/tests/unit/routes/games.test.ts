import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  gameFindMock, gameCountDocumentsMock, gameFindOneMock, gameFindByIdMock, gameAggregateMock,
  profileFindByIdMock, sharpMockFn, fsMkdirSyncMock, fsWriteFileSyncMock,
} = vi.hoisted(() => {
  const sharpChain: any = {};
  sharpChain.metadata = vi.fn().mockResolvedValue({ width: 100, height: 100 });
  sharpChain.resize = vi.fn().mockReturnValue(sharpChain);
  sharpChain.jpeg = vi.fn().mockReturnValue(sharpChain);
  sharpChain.toBuffer = vi.fn().mockResolvedValue(Buffer.from('resized-image'));
  return {
    gameFindMock: vi.fn(),
    gameCountDocumentsMock: vi.fn(),
    gameFindOneMock: vi.fn(),
    gameFindByIdMock: vi.fn(),
    gameAggregateMock: vi.fn(),
    profileFindByIdMock: vi.fn(),
    sharpMockFn: vi.fn(() => sharpChain),
    fsMkdirSyncMock: vi.fn(),
    fsWriteFileSyncMock: vi.fn(),
  };
});

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

vi.mock('sharp', () => ({ default: sharpMockFn }));

vi.mock('fs', () => ({
  mkdirSync: fsMkdirSyncMock,
  writeFileSync: fsWriteFileSyncMock,
  existsSync: vi.fn().mockReturnValue(true),
}));

import { getGames, getGameById, updateGameTitle, uploadGameImage } from '../../../src/api/routes/games.js';

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
      // Verify $and filter was applied to the countDocuments call
      const filterArg = gameCountDocumentsMock.mock.calls[0][0];
      expect(filterArg.$and).toEqual([
        {
          $or: [
            { ownershipSource: { $ne: 'played_history' } },
            { achievementsFetchFailed: { $ne: true } },
          ],
        },
        { isHidden: { $ne: true } },
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

// ---------------------------------------------------------------------------
// updateGameTitle
// ---------------------------------------------------------------------------
describe('updateGameTitle', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 400 when customTitle is not a string and not null', async () => {
    const reply = createMockReply();
    await updateGameTitle({ params: { id: 'g1' }, body: { customTitle: 123 } } as any, reply);
    expect(reply.statusCode).toBe(400);
  });

  it('returns 500 on database error', async () => {
    gameFindByIdMock.mockRejectedValue(new Error('db error'));
    const reply = createMockReply();
    await updateGameTitle({ params: { id: 'g1' }, body: { customTitle: 'New Title' } } as any, reply);
    expect(reply.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// uploadGameImage
// ---------------------------------------------------------------------------
describe('uploadGameImage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 400 for invalid imageType', async () => {
    const reply = createMockReply();
    await uploadGameImage({ params: { id: 'g1', imageType: 'badtype' }, file: vi.fn() } as any, reply);
    expect(reply.statusCode).toBe(400);
  });

  it('returns 404 for non-existent game', async () => {
    gameFindByIdMock.mockResolvedValue(null);
    const reply = createMockReply();
    await uploadGameImage({ params: { id: 'g1', imageType: 'icon' }, file: vi.fn() } as any, reply);
    expect(reply.statusCode).toBe(404);
  });

  it('returns 400 when no file provided', async () => {
    const game = { _id: 'g1', platform: 'steam', gameId: '440', save: vi.fn() };
    gameFindByIdMock.mockResolvedValue(game);
    const reply = createMockReply();
    await uploadGameImage(
      { params: { id: 'g1', imageType: 'icon' }, file: vi.fn().mockResolvedValue(undefined) } as any,
      reply,
    );
    expect(reply.statusCode).toBe(400);
    expect(reply.body.error).toMatch(/No file/i);
  });

  it('returns 400 when file exceeds 10MB limit', async () => {
    const game = { _id: 'g1', platform: 'steam', gameId: '440', save: vi.fn() };
    gameFindByIdMock.mockResolvedValue(game);
    const bigBuffer = Buffer.alloc(11 * 1024 * 1024);
    const reply = createMockReply();
    await uploadGameImage(
      { params: { id: 'g1', imageType: 'icon' }, file: vi.fn().mockResolvedValue({ toBuffer: vi.fn().mockResolvedValue(bigBuffer) }) } as any,
      reply,
    );
    expect(reply.statusCode).toBe(400);
    expect(reply.body.error).toMatch(/10MB/);
  });

  it('returns 400 when sharp cannot read image metadata', async () => {
    const game = { _id: 'g1', platform: 'steam', gameId: '440', save: vi.fn() };
    gameFindByIdMock.mockResolvedValue(game);
    sharpMockFn.mockReturnValueOnce({
      metadata: vi.fn().mockRejectedValue(new Error('unsupported image format')),
    } as any);
    const fakeBuffer = Buffer.from('not-an-image');
    const reply = createMockReply();
    await uploadGameImage(
      { params: { id: 'g1', imageType: 'icon' }, file: vi.fn().mockResolvedValue({ toBuffer: vi.fn().mockResolvedValue(fakeBuffer) }) } as any,
      reply,
    );
    expect(reply.statusCode).toBe(400);
    expect(reply.body.error).toMatch(/not a valid image/i);
  });

  it('returns 400 when image has no width or height', async () => {
    const game = { _id: 'g1', platform: 'steam', gameId: '440', save: vi.fn() };
    gameFindByIdMock.mockResolvedValue(game);
    sharpMockFn.mockReturnValueOnce({
      metadata: vi.fn().mockResolvedValue({ width: undefined, height: undefined }),
    } as any);
    const fakeBuffer = Buffer.from('bad-image');
    const reply = createMockReply();
    await uploadGameImage(
      { params: { id: 'g1', imageType: 'icon' }, file: vi.fn().mockResolvedValue({ toBuffer: vi.fn().mockResolvedValue(fakeBuffer) }) } as any,
      reply,
    );
    expect(reply.statusCode).toBe(400);
    expect(reply.body.error).toMatch(/not a valid image/i);
  });

  it('successfully resizes and stores image', async () => {
    const game: any = {
      _id: 'g1', platform: 'steam', gameId: '440',
      iconImagePath: null, heroImagePath: null, capsuleImagePath: null,
      save: vi.fn().mockResolvedValue(undefined),
    };
    gameFindByIdMock.mockResolvedValue(game);
    const validBuffer = Buffer.from('valid-image-bytes');
    const reply = createMockReply();
    await uploadGameImage(
      { params: { id: 'g1', imageType: 'icon' }, file: vi.fn().mockResolvedValue({ toBuffer: vi.fn().mockResolvedValue(validBuffer) }) } as any,
      reply,
    );
    expect(reply.statusCode).toBe(200);
    expect(fsMkdirSyncMock).toHaveBeenCalled();
    expect(fsWriteFileSyncMock).toHaveBeenCalled();
    expect(game.save).toHaveBeenCalled();
  });

  it('returns 500 on unexpected error', async () => {
    gameFindByIdMock.mockRejectedValue(new Error('db crash'));
    const reply = createMockReply();
    await uploadGameImage({ params: { id: 'g1', imageType: 'icon' }, file: vi.fn() } as any, reply);
    expect(reply.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// updateGameTitle
// ---------------------------------------------------------------------------
describe('updateGameTitle', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 400 when customTitle is not a string and not null', async () => {
    const reply = createMockReply();
    await updateGameTitle({ params: { id: 'g1' }, body: { customTitle: 123 } } as any, reply);
    expect(reply.statusCode).toBe(400);
  });

  it('returns 500 on database error', async () => {
    gameFindByIdMock.mockRejectedValue(new Error('db error'));
    const reply = createMockReply();
    await updateGameTitle({ params: { id: 'g1' }, body: { customTitle: 'New Title' } } as any, reply);
    expect(reply.statusCode).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// uploadGameImage
// ---------------------------------------------------------------------------
describe('uploadGameImage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 400 for invalid imageType', async () => {
    const reply = createMockReply();
    await uploadGameImage({ params: { id: 'g1', imageType: 'badtype' }, file: vi.fn() } as any, reply);
    expect(reply.statusCode).toBe(400);
  });

  it('returns 404 for non-existent game', async () => {
    gameFindByIdMock.mockResolvedValue(null);
    const reply = createMockReply();
    await uploadGameImage({ params: { id: 'g1', imageType: 'icon' }, file: vi.fn() } as any, reply);
    expect(reply.statusCode).toBe(404);
  });

  it('returns 400 when no file provided', async () => {
    const game = { _id: 'g1', platform: 'steam', gameId: '440', save: vi.fn() };
    gameFindByIdMock.mockResolvedValue(game);
    const reply = createMockReply();
    await uploadGameImage(
      { params: { id: 'g1', imageType: 'icon' }, file: vi.fn().mockResolvedValue(undefined) } as any,
      reply,
    );
    expect(reply.statusCode).toBe(400);
    expect(reply.body.error).toMatch(/No file/i);
  });

  it('returns 400 when file exceeds 10MB limit', async () => {
    const game = { _id: 'g1', platform: 'steam', gameId: '440', save: vi.fn() };
    gameFindByIdMock.mockResolvedValue(game);
    const bigBuffer = Buffer.alloc(11 * 1024 * 1024);
    const reply = createMockReply();
    await uploadGameImage(
      { params: { id: 'g1', imageType: 'icon' }, file: vi.fn().mockResolvedValue({ toBuffer: vi.fn().mockResolvedValue(bigBuffer) }) } as any,
      reply,
    );
    expect(reply.statusCode).toBe(400);
    expect(reply.body.error).toMatch(/10MB/);
  });

  it('returns 400 when sharp cannot read image metadata', async () => {
    const game = { _id: 'g1', platform: 'steam', gameId: '440', save: vi.fn() };
    gameFindByIdMock.mockResolvedValue(game);
    sharpMockFn.mockReturnValueOnce({
      metadata: vi.fn().mockRejectedValue(new Error('unsupported image format')),
    } as any);
    const fakeBuffer = Buffer.from('not-an-image');
    const reply = createMockReply();
    await uploadGameImage(
      { params: { id: 'g1', imageType: 'icon' }, file: vi.fn().mockResolvedValue({ toBuffer: vi.fn().mockResolvedValue(fakeBuffer) }) } as any,
      reply,
    );
    expect(reply.statusCode).toBe(400);
    expect(reply.body.error).toMatch(/not a valid image/i);
  });

  it('returns 400 when image has no width or height', async () => {
    const game = { _id: 'g1', platform: 'steam', gameId: '440', save: vi.fn() };
    gameFindByIdMock.mockResolvedValue(game);
    sharpMockFn.mockReturnValueOnce({
      metadata: vi.fn().mockResolvedValue({ width: undefined, height: undefined }),
    } as any);
    const fakeBuffer = Buffer.from('bad-image');
    const reply = createMockReply();
    await uploadGameImage(
      { params: { id: 'g1', imageType: 'icon' }, file: vi.fn().mockResolvedValue({ toBuffer: vi.fn().mockResolvedValue(fakeBuffer) }) } as any,
      reply,
    );
    expect(reply.statusCode).toBe(400);
    expect(reply.body.error).toMatch(/not a valid image/i);
  });

  it('successfully resizes and stores image', async () => {
    const game: any = {
      _id: 'g1', platform: 'steam', gameId: '440',
      iconImagePath: null, heroImagePath: null, capsuleImagePath: null,
      save: vi.fn().mockResolvedValue(undefined),
    };
    gameFindByIdMock.mockResolvedValue(game);
    const validBuffer = Buffer.from('valid-image-bytes');
    const reply = createMockReply();
    await uploadGameImage(
      { params: { id: 'g1', imageType: 'icon' }, file: vi.fn().mockResolvedValue({ toBuffer: vi.fn().mockResolvedValue(validBuffer) }) } as any,
      reply,
    );
    expect(reply.statusCode).toBe(200);
    expect(fsMkdirSyncMock).toHaveBeenCalled();
    expect(fsWriteFileSyncMock).toHaveBeenCalled();
    expect(game.save).toHaveBeenCalled();
  });

  it('returns 500 on unexpected error', async () => {
    gameFindByIdMock.mockRejectedValue(new Error('db crash'));
    const reply = createMockReply();
    await uploadGameImage({ params: { id: 'g1', imageType: 'icon' }, file: vi.fn() } as any, reply);
    expect(reply.statusCode).toBe(500);
  });
});
