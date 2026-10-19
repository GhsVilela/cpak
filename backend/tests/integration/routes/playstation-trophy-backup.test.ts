/**
 * Integration tests for PS5 trophy backup import
 * POST /api/playstation/trophy-backup/import
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import mongoose from 'mongoose';
import { createTestServer, teardownTestServer } from '../../helpers/server.js';
import { Profile } from '../../../src/models/profile.js';
import { Game } from '../../../src/models/game.js';
import { Achievement } from '../../../src/models/achievement.js';
import {
  buildTrpTitleDat,
  buildTrophyUcp,
  buildZip,
  TINY_PNG,
} from '../../helpers/ps5TrophyFixtures.js';

vi.mock('../../../src/utils/imageStorage.js', () => ({
  imageStorage: {
    storeBuffer: vi.fn(async (_buf: Buffer, platform: string, gameId: string, achievementId: string, imageType: string) =>
      `${platform}/${gameId}/${achievementId}_${imageType}.png`,
    ),
    downloadAndStore: vi.fn(),
    downloadAndStoreViaWget: vi.fn(),
    checkLocalFile: vi.fn().mockReturnValue(undefined),
  },
}));

let app: FastifyInstance;

const NPWR = 'NPWR20842_00';
const UNLOCK_MS = Date.UTC(2023, 5, 15, 12, 30, 0);

async function createPlayStationProfile() {
  const profile = new Profile({
    platform: 'playstation',
    profileId: 'psn-account-123',
    displayName: 'TestPSNUser',
    credentials: {
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: new Date(Date.now() + 3_600_000),
      tokenType: 'bearer',
    },
  });
  await profile.save();
  return profile;
}

function makeDat(trophyCount = 3) {
  return buildTrpTitleDat({
    npwr: NPWR,
    uid: '1234abcd',
    accountHex: '0123456789abcdef',
    trophies: Array.from({ length: trophyCount }, (_, i) => ({
      earned: i < 2,
      unlockedAtMs: UNLOCK_MS,
    })),
  });
}

function makeUcp() {
  return buildTrophyUcp({
    npwr: NPWR,
    title: 'Ratchet & Clank: Rift Apart',
    trophies: [
      { id: 0, name: 'Platinum Trophy', detail: 'Earn all trophies', grade: 'platinum' },
      { id: 1, name: 'First Step', detail: 'Complete the first level', grade: 'bronze', iconPng: TINY_PNG },
      { id: 2, name: 'Hidden Helper', detail: '', grade: 'silver', hidden: true },
    ],
    gameIconPng: TINY_PNG,
  });
}

function multipartBody(filename: string, data: Buffer, contentType = 'application/zip') {
  const boundary = '----cpak-trophy-backup-test';
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
    ),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return {
    payload,
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

beforeAll(async () => {
  app = await createTestServer();
});

afterAll(async () => {
  await teardownTestServer();
});

beforeEach(async () => {
  await Profile.deleteMany({});
  await Game.deleteMany({});
  await Achievement.deleteMany({});
});

describe('POST /api/playstation/trophy-backup/import', () => {
  it('imports trophies for a game not already tracked', async () => {
    const profile = await createPlayStationProfile();
    const zip = buildZip([
      { name: 'user/home/1234abcd/trophy2/nobackup/data/NPWR20842_00/TRPTITLE.DAT', data: makeDat() },
      { name: 'user/trophy2/nobackup/conf/NPWR20842_00/TROPHY.UCP', data: makeUcp() },
    ]);
    const { payload, headers } = multipartBody('trophy-backup.zip', zip);

    const res = await app.inject({
      method: 'POST',
      url: `/api/playstation/trophy-backup/import?profileId=${profile._id}`,
      headers,
      payload,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.imported).toEqual([
      {
        gameId: NPWR,
        title: 'Ratchet & Clank: Rift Apart',
        trophiesTotal: 3,
        trophiesUnlocked: 2,
      },
    ]);
    expect(body.skipped).toEqual([]);

    const game = await Game.findOne({ platform: 'playstation', gameId: NPWR });
    expect(game).not.toBeNull();
    expect(game!.title).toBe('Ratchet & Clank: Rift Apart');
    expect(game!.achievementsTotal).toBe(3);
    expect(game!.achievementsUnlocked).toBe(2);
    expect(game!.completionPercent).toBe(67);
    expect(game!.trophyPlatinum).toBe(1);
    expect(game!.trophyBronze).toBe(1);
    expect(game!.iconImagePath).toContain('game_icon');

    const achievements = await Achievement.find({ gameId: game!._id }).sort({ achievementId: 1 });
    expect(achievements).toHaveLength(3);
    expect(achievements[0]).toMatchObject({
      achievementId: '0',
      name: 'Platinum Trophy',
      trophyGrade: 'platinum',
      isHidden: false,
    });
    expect(achievements[0].unlockedAt?.toISOString()).toBe(new Date(UNLOCK_MS).toISOString());
    expect(achievements[2]).toMatchObject({
      achievementId: '2',
      name: 'Hidden Helper',
      trophyGrade: 'silver',
      isHidden: true,
    });
    expect(achievements[2].unlockedAt).toBeUndefined();
  });

  it('skips games that already exist for the profile', async () => {
    const profile = await createPlayStationProfile();
    await Game.create({
      platform: 'playstation',
      profileId: profile._id,
      gameId: NPWR,
      title: 'Existing Title',
      achievementsTotal: 10,
      achievementsUnlocked: 5,
      completionPercent: 50,
    });

    const zip = buildZip([{ name: 'TRPTITLE.DAT', data: makeDat() }]);
    const { payload, headers } = multipartBody('trophy-backup.zip', zip);

    const res = await app.inject({
      method: 'POST',
      url: `/api/playstation/trophy-backup/import?profileId=${profile._id}`,
      headers,
      payload,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().imported).toEqual([]);
    expect(res.json().skipped).toEqual([{ gameId: NPWR, reason: 'already-exists' }]);

    const games = await Game.find({ platform: 'playstation', gameId: NPWR });
    expect(games).toHaveLength(1);
    expect(games[0].title).toBe('Existing Title');
    expect(await Achievement.countDocuments({})).toBe(0);
  });

  it('skips games with no unlocked trophies', async () => {
    const profile = await createPlayStationProfile();
    const emptyDat = buildTrpTitleDat({
      npwr: NPWR,
      uid: '1234abcd',
      accountHex: '0123456789abcdef',
      trophies: [{ earned: false }, { earned: false }, { earned: false }],
    });
    const zip = buildZip([{ name: 'TRPTITLE.DAT', data: emptyDat }]);
    const { payload, headers } = multipartBody('trophy-backup.zip', zip);

    const res = await app.inject({
      method: 'POST',
      url: `/api/playstation/trophy-backup/import?profileId=${profile._id}`,
      headers,
      payload,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().imported).toEqual([]);
    expect(res.json().skipped).toEqual([{ gameId: NPWR, reason: 'no-unlocked-trophies' }]);
    expect(await Game.countDocuments({ platform: 'playstation' })).toBe(0);
    expect(await Achievement.countDocuments({})).toBe(0);
  });

  it('imports a DAT-only upload using placeholder trophy names', async () => {
    const profile = await createPlayStationProfile();
    const { payload, headers } = multipartBody('TRPTITLE.DAT', makeDat(), 'application/octet-stream');

    const res = await app.inject({
      method: 'POST',
      url: `/api/playstation/trophy-backup/import?profileId=${profile._id}`,
      headers,
      payload,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().imported[0].title).toBe(NPWR);
    const achievement = await Achievement.findOne({ achievementId: '0' });
    expect(achievement?.name).toBe('Trophy #0');
  });

  it('rejects non-PlayStation profiles', async () => {
    const profile = new Profile({
      platform: 'steam',
      profileId: 'steam-1',
      displayName: 'Steam User',
      credentials: {},
    });
    await profile.save();
    const { payload, headers } = multipartBody('TRPTITLE.DAT', makeDat(), 'application/octet-stream');

    const res = await app.inject({
      method: 'POST',
      url: `/api/playstation/trophy-backup/import?profileId=${profile._id}`,
      headers,
      payload,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/PlayStation/);
  });

  it('returns 404 for an unknown profile, 400 without a profile id', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const { payload, headers } = multipartBody('TRPTITLE.DAT', makeDat(), 'application/octet-stream');

    const notFound = await app.inject({
      method: 'POST',
      url: `/api/playstation/trophy-backup/import?profileId=${fakeId}`,
      headers,
      payload,
    });
    expect(notFound.statusCode).toBe(404);

    const missing = await app.inject({
      method: 'POST',
      url: '/api/playstation/trophy-backup/import',
    });
    expect(missing.statusCode).toBe(400);
  });

  it('returns a helpful error when a ZIP contains no trophy files', async () => {
    const profile = await createPlayStationProfile();
    const zip = buildZip([{ name: 'readme.txt', data: Buffer.from('hello') }]);
    const { payload, headers } = multipartBody('trophy-backup.zip', zip);

    const res = await app.inject({
      method: 'POST',
      url: `/api/playstation/trophy-backup/import?profileId=${profile._id}`,
      headers,
      payload,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/No TRPTITLE\.DAT or TROPHY\.UCP/);
  });

  it('returns a helpful error for corrupt trophy files', async () => {
    const profile = await createPlayStationProfile();
    const { payload, headers } = multipartBody(
      'TRPTITLE.DAT',
      Buffer.alloc(2000),
      'application/octet-stream',
    );

    const res = await app.inject({
      method: 'POST',
      url: `/api/playstation/trophy-backup/import?profileId=${profile._id}`,
      headers,
      payload,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/No parsable trophy data/);
    expect(res.json().details.length).toBeGreaterThan(0);
  });
});
