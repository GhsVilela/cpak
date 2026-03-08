import { describe, it, expect, vi, beforeEach } from 'vitest';

const { gameFindByIdMock, achievementFindMock } = vi.hoisted(() => ({
  gameFindByIdMock: vi.fn(),
  achievementFindMock: vi.fn(),
}));

vi.mock('../../../src/models/achievement.js', () => ({
  Achievement: { find: achievementFindMock },
}));

vi.mock('../../../src/models/game.js', () => ({
  Game: { findById: gameFindByIdMock },
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { getAchievements } from '../../../src/api/routes/achievements.js';

function createMockReply() {
  const reply: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) { reply.statusCode = code; return reply; },
    send(data: any) { reply.body = data; return reply; },
  };
  return reply;
}

describe('Achievements Route', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns achievements without filters', async () => {
    achievementFindMock.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([{ _id: 'a1', name: 'First Blood' }]),
      }),
    });

    const reply = createMockReply();
    await getAchievements({ query: {} } as any, reply);
    expect(reply.body).toHaveLength(1);
  });

  it('filters by gameId', async () => {
    gameFindByIdMock.mockResolvedValue({ _id: 'g1' });
    achievementFindMock.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      }),
    });

    const reply = createMockReply();
    await getAchievements({ query: { gameId: 'g1' } } as any, reply);
    expect(gameFindByIdMock).toHaveBeenCalledWith('g1');
    expect(reply.body).toEqual([]);
  });

  it('returns 404 when game not found', async () => {
    gameFindByIdMock.mockResolvedValue(null);
    const reply = createMockReply();
    await getAchievements({ query: { gameId: 'bad' } } as any, reply);
    expect(reply.statusCode).toBe(404);
  });

  it('filters by profileId', async () => {
    achievementFindMock.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
      }),
    });

    const reply = createMockReply();
    await getAchievements({ query: { profileId: 'p1' } } as any, reply);
    expect(reply.body).toEqual([]);
  });

  it('returns 500 on error', async () => {
    achievementFindMock.mockImplementation(() => { throw new Error('db'); });
    const reply = createMockReply();
    await getAchievements({ query: {} } as any, reply);
    expect(reply.statusCode).toBe(500);
  });
});
