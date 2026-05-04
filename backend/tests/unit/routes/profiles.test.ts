import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  profileFindMock, profileFindByIdMock, profileFindOneMock, profileFindByIdAndDeleteMock,
  profileConstructor, profileSaveMock, profileUpdateManyMock,
  gameDeleteManyMock, achievementDeleteManyMock, syncRunDeleteManyMock,
} = vi.hoisted(() => ({
  profileFindMock: vi.fn(),
  profileFindByIdMock: vi.fn(),
  profileFindOneMock: vi.fn(),
  profileFindByIdAndDeleteMock: vi.fn(),
  profileConstructor: vi.fn(),
  profileSaveMock: vi.fn(),
  profileUpdateManyMock: vi.fn(),
  gameDeleteManyMock: vi.fn(),
  achievementDeleteManyMock: vi.fn(),
  syncRunDeleteManyMock: vi.fn(),
}));

vi.mock('../../../src/models/profile.js', () => {
  const ProfileClass = profileConstructor;
  ProfileClass.find = profileFindMock;
  ProfileClass.findById = profileFindByIdMock;
  ProfileClass.findOne = profileFindOneMock;
  ProfileClass.findByIdAndDelete = profileFindByIdAndDeleteMock;
  ProfileClass.updateMany = profileUpdateManyMock;
  return { Profile: ProfileClass };
});

vi.mock('../../../src/models/game.js', () => ({
  Game: { deleteMany: gameDeleteManyMock },
}));

vi.mock('../../../src/models/achievement.js', () => ({
  Achievement: { deleteMany: achievementDeleteManyMock },
}));

vi.mock('../../../src/models/syncRun.js', () => ({
  SyncRun: { deleteMany: syncRunDeleteManyMock },
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { getProfiles, getProfileById, createProfile, updateProfile, deleteProfile, setDefaultProfile } from '../../../src/api/routes/profiles.js';

function createMockReply() {
  const reply: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) { reply.statusCode = code; return reply; },
    send(data: any) { reply.body = data; return reply; },
  };
  return reply;
}

describe('Profiles Route Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- getProfiles ---
  describe('getProfiles', () => {
    it('returns all profiles without credentials', async () => {
      const selectMock = vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          { _id: '1', platform: 'steam', profileId: '123', displayName: 'User1' },
        ]),
      });
      profileFindMock.mockReturnValue({ select: selectMock });

      const reply = createMockReply();
      await getProfiles({} as any, reply);

      expect(selectMock).toHaveBeenCalledWith('-credentials');
      expect(reply.body).toHaveLength(1);
      expect(reply.body[0].displayName).toBe('User1');
    });

    it('returns 500 on database error', async () => {
      profileFindMock.mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockRejectedValue(new Error('db error')),
        }),
      });

      const reply = createMockReply();
      await getProfiles({} as any, reply);
      expect(reply.statusCode).toBe(500);
      expect(reply.body.error).toBe('Internal server error');
    });
  });

  // --- getProfileById ---
  describe('getProfileById', () => {
    it('returns profile by id', async () => {
      profileFindByIdMock.mockResolvedValue({ _id: '1', platform: 'steam' });
      const reply = createMockReply();
      await getProfileById({ params: { id: '1' } } as any, reply);
      expect(reply.body.platform).toBe('steam');
    });

    it('returns 404 when profile not found', async () => {
      profileFindByIdMock.mockResolvedValue(null);
      const reply = createMockReply();
      await getProfileById({ params: { id: '999' } } as any, reply);
      expect(reply.statusCode).toBe(404);
    });

    it('returns 500 on error', async () => {
      profileFindByIdMock.mockRejectedValue(new Error('db'));
      const reply = createMockReply();
      await getProfileById({ params: { id: '1' } } as any, reply);
      expect(reply.statusCode).toBe(500);
    });
  });

  // --- createProfile ---
  describe('createProfile', () => {
    it('creates a new profile when none exists', async () => {
      profileFindOneMock.mockResolvedValue(null);
      const savedProfile = { _id: 'new', platform: 'steam', profileId: '123', displayName: 'steam User 123' };
      profileSaveMock.mockResolvedValue(savedProfile);
      profileConstructor.mockImplementation(function(this: any, data: any) {
        Object.assign(this, data);
        this.save = profileSaveMock;
        return this;
      });

      const reply = createMockReply();
      await createProfile({ body: { platform: 'steam', profileId: '123' } } as any, reply);
      expect(reply.statusCode).toBe(201);
    });

    it('updates existing profile if found', async () => {
      const existing = {
        platform: 'steam',
        profileId: '123',
        displayName: 'OldName',
        credentials: {},
        save: profileSaveMock.mockResolvedValue(undefined),
      };
      profileFindOneMock.mockResolvedValue(existing);

      const reply = createMockReply();
      await createProfile({ body: { platform: 'steam', profileId: '123', displayName: 'NewName' } } as any, reply);
      expect(reply.statusCode).toBe(201);
      expect(existing.displayName).toBe('NewName');
    });

    it('returns 400 for invalid body', async () => {
      const reply = createMockReply();
      await createProfile({ body: { platform: 'invalid' } } as any, reply);
      expect(reply.statusCode).toBe(400);
    });

    it('returns 500 on database error', async () => {
      profileFindOneMock.mockRejectedValue(new Error('db'));
      const reply = createMockReply();
      await createProfile({ body: { platform: 'steam', profileId: '1' } } as any, reply);
      expect(reply.statusCode).toBe(500);
    });
  });

  // --- updateProfile ---
  describe('updateProfile', () => {
    it('updates profile fields', async () => {
      const profile = {
        displayName: 'Old',
        credentials: { steamApiKey: 'key' },
        save: profileSaveMock.mockResolvedValue(undefined),
        toJSON: vi.fn().mockReturnValue({ displayName: 'New' }),
        markModified: vi.fn(),
      };
      profileFindByIdMock.mockResolvedValue(profile);

      const reply = createMockReply();
      await updateProfile({ params: { id: '1' }, body: { displayName: 'New' } } as any, reply);
      expect(profile.displayName).toBe('New');
      expect(reply.body.displayName).toBe('New');
    });

    it('returns 404 if profile not found', async () => {
      profileFindByIdMock.mockResolvedValue(null);
      const reply = createMockReply();
      await updateProfile({ params: { id: '999' }, body: {} } as any, reply);
      expect(reply.statusCode).toBe(404);
    });

    it('returns 400 for invalid body', async () => {
      const reply = createMockReply();
      await updateProfile({ params: { id: '1' }, body: { credentials: { steamApiKey: 123 } } } as any, reply);
      expect(reply.statusCode).toBe(400);
    });

    it('merges credentials with existing', async () => {
      const profile = {
        displayName: 'User',
        credentials: { steamApiKey: 'oldkey' },
        save: profileSaveMock.mockResolvedValue(undefined),
        toJSON: vi.fn().mockReturnValue({ credentials: {} }),
        markModified: vi.fn(),
      };
      profileFindByIdMock.mockResolvedValue(profile);

      const reply = createMockReply();
      await updateProfile({ params: { id: '1' }, body: { credentials: { xboxRefreshToken: 'new' } } } as any, reply);
      expect(profile.credentials).toEqual({ steamApiKey: 'oldkey', xboxRefreshToken: 'new' });
    });

    it('sets displayNameEdited flag when displayName is updated', async () => {
      const profile: any = {
        displayName: 'Old',
        credentials: {},
        save: profileSaveMock.mockResolvedValue(undefined),
        toJSON: vi.fn().mockReturnValue({ displayName: 'New', displayNameEdited: true }),
        markModified: vi.fn(),
      };
      profileFindByIdMock.mockResolvedValue(profile);

      const reply = createMockReply();
      await updateProfile({ params: { id: '1' }, body: { displayName: 'New' } } as any, reply);
      expect(profile.displayNameEdited).toBe(true);
    });

    it('returns 500 on database error', async () => {
      profileFindByIdMock.mockRejectedValue(new Error('db'));
      const reply = createMockReply();
      await updateProfile({ params: { id: '1' }, body: {} } as any, reply);
      expect(reply.statusCode).toBe(500);
    });
  });

  // --- deleteProfile ---
  describe('deleteProfile', () => {
    it('deletes profile and cascades related data', async () => {
      profileFindByIdMock.mockResolvedValue({ _id: '1', platform: 'steam' });
      gameDeleteManyMock.mockResolvedValue({ deletedCount: 5 });
      achievementDeleteManyMock.mockResolvedValue({ deletedCount: 20 });
      syncRunDeleteManyMock.mockResolvedValue({ deletedCount: 3 });
      profileFindByIdAndDeleteMock.mockResolvedValue(true);

      const reply = createMockReply();
      await deleteProfile({ params: { id: '1' } } as any, reply);
      expect(reply.statusCode).toBe(204);
      expect(gameDeleteManyMock).toHaveBeenCalledWith({ profileId: '1' });
      expect(achievementDeleteManyMock).toHaveBeenCalledWith({ profileId: '1' });
      expect(syncRunDeleteManyMock).toHaveBeenCalledWith({ profileId: '1' });
    });

    it('returns 404 if profile not found', async () => {
      profileFindByIdMock.mockResolvedValue(null);
      const reply = createMockReply();
      await deleteProfile({ params: { id: '999' } } as any, reply);
      expect(reply.statusCode).toBe(404);
    });

    it('returns 500 on error', async () => {
      profileFindByIdMock.mockRejectedValue(new Error('db'));
      const reply = createMockReply();
      await deleteProfile({ params: { id: '1' } } as any, reply);
      expect(reply.statusCode).toBe(500);
    });
  });

  // --- setDefaultProfile ---
  describe('setDefaultProfile', () => {
    it('sets profile as default and unsets others', async () => {
      const profile: any = {
        _id: 'p1',
        platform: 'steam',
        isDefault: false,
        save: profileSaveMock.mockResolvedValue(undefined),
      };
      profileFindByIdMock.mockResolvedValue(profile);
      profileUpdateManyMock.mockResolvedValue({ modifiedCount: 1 });

      const reply = createMockReply();
      await setDefaultProfile({ params: { id: 'p1' } } as any, reply);

      expect(profileUpdateManyMock).toHaveBeenCalledWith(
        { platform: 'steam', _id: { $ne: 'p1' } },
        { $set: { isDefault: false } },
      );
      expect(profile.isDefault).toBe(true);
      expect(profileSaveMock).toHaveBeenCalled();
    });

    it('returns 404 when profile not found', async () => {
      profileFindByIdMock.mockResolvedValue(null);
      const reply = createMockReply();
      await setDefaultProfile({ params: { id: 'missing' } } as any, reply);
      expect(reply.statusCode).toBe(404);
    });

    it('returns 500 on error', async () => {
      profileFindByIdMock.mockRejectedValue(new Error('db'));
      const reply = createMockReply();
      await setDefaultProfile({ params: { id: 'p1' } } as any, reply);
      expect(reply.statusCode).toBe(500);
    });
  });
});
