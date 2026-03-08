import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  profileFindMock, profileFindOneAndUpdateMock,
  gameFindMock, gameFindOneAndUpdateMock,
  achievementFindMock, achievementFindOneAndUpdateMock,
  settingFindMock, settingDeleteManyMock, settingInsertManyMock,
} = vi.hoisted(() => ({
  profileFindMock: vi.fn(),
  profileFindOneAndUpdateMock: vi.fn(),
  gameFindMock: vi.fn(),
  gameFindOneAndUpdateMock: vi.fn(),
  achievementFindMock: vi.fn(),
  achievementFindOneAndUpdateMock: vi.fn(),
  settingFindMock: vi.fn(),
  settingDeleteManyMock: vi.fn(),
  settingInsertManyMock: vi.fn(),
}));

vi.mock('../../../src/models/profile.js', () => ({
  Profile: { find: profileFindMock, findOneAndUpdate: profileFindOneAndUpdateMock },
}));
vi.mock('../../../src/models/game.js', () => ({
  Game: { find: gameFindMock, findOneAndUpdate: gameFindOneAndUpdateMock },
}));
vi.mock('../../../src/models/achievement.js', () => ({
  Achievement: { find: achievementFindMock, findOneAndUpdate: achievementFindOneAndUpdateMock },
}));
vi.mock('../../../src/models/setting.js', () => ({
  Setting: { find: settingFindMock, deleteMany: settingDeleteManyMock, insertMany: settingInsertManyMock },
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { exportData, importData } from '../../../src/api/routes/exportImport.js';

function createMockReply() {
  const reply: any = {
    statusCode: 200,
    body: undefined,
    headers: {} as Record<string, string>,
    status(code: number) { reply.statusCode = code; return reply; },
    send(data: any) { reply.body = data; return reply; },
    header(key: string, value: string) { reply.headers[key] = value; return reply; },
  };
  return reply;
}

describe('Export/Import Route Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('exportData', () => {
    it('exports all data as JSON', async () => {
      profileFindMock.mockReturnValue({ lean: vi.fn().mockResolvedValue([{ _id: 'p1' }]) });
      gameFindMock.mockReturnValue({ lean: vi.fn().mockResolvedValue([{ _id: 'g1' }]) });
      achievementFindMock.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
      settingFindMock.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });

      const reply = createMockReply();
      await exportData({} as any, reply);
      expect(reply.body.version).toBe('1.0.0');
      expect(reply.body.profiles).toHaveLength(1);
      expect(reply.body.games).toHaveLength(1);
      expect(reply.headers['Content-Type']).toBe('application/json');
    });

    it('returns 500 on error', async () => {
      profileFindMock.mockReturnValue({ lean: vi.fn().mockRejectedValue(new Error('db')) });
      const reply = createMockReply();
      await exportData({} as any, reply);
      expect(reply.statusCode).toBe(500);
    });
  });

  describe('importData', () => {
    it('imports profiles, games, achievements, and settings', async () => {
      profileFindOneAndUpdateMock.mockResolvedValue({});
      gameFindOneAndUpdateMock.mockResolvedValue({});
      achievementFindOneAndUpdateMock.mockResolvedValue({});
      settingDeleteManyMock.mockResolvedValue({});
      settingInsertManyMock.mockResolvedValue({});

      const reply = createMockReply();
      await importData({
        body: {
          version: '1.0.0',
          exportedAt: new Date().toISOString(),
          profiles: [{ platform: 'steam', profileId: '1' }],
          games: [{ platform: 'steam', profileId: 'p1', gameId: '440' }],
          achievements: [{ platform: 'steam', profileId: 'p1', gameId: '440', achievementId: 'ach1' }],
          settings: [{ key: 'test', value: 'v' }],
        },
      } as any, reply);
      expect(reply.body.success).toBe(true);
      expect(reply.body.imported.profiles).toBe(1);
      expect(reply.body.imported.games).toBe(1);
      expect(reply.body.imported.achievements).toBe(1);
      expect(reply.body.imported.settings).toBe(true);
    });

    it('returns 400 for invalid data format', async () => {
      const reply = createMockReply();
      await importData({ body: {} } as any, reply);
      expect(reply.statusCode).toBe(400);
    });

    it('returns 400 for null body', async () => {
      const reply = createMockReply();
      await importData({ body: null } as any, reply);
      expect(reply.statusCode).toBe(400);
    });

    it('handles empty arrays', async () => {
      const reply = createMockReply();
      await importData({
        body: {
          version: '1.0.0',
          exportedAt: new Date().toISOString(),
          profiles: [],
          games: [],
          achievements: [],
          settings: null,
        },
      } as any, reply);
      expect(reply.body.imported.profiles).toBe(0);
      expect(reply.body.imported.settings).toBe(false);
    });

    it('returns 500 on error', async () => {
      profileFindOneAndUpdateMock.mockRejectedValue(new Error('db'));
      const reply = createMockReply();
      await importData({
        body: {
          version: '1.0.0',
          exportedAt: new Date().toISOString(),
          profiles: [{ platform: 'steam', profileId: '1' }],
          games: [],
          achievements: [],
          settings: null,
        },
      } as any, reply);
      expect(reply.statusCode).toBe(500);
    });
  });
});
