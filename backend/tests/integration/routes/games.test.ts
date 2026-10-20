import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import mongoose from 'mongoose';
import { createTestServer, teardownTestServer } from '../../helpers/server.js';
import { Game } from '../../../src/models/game.js';
import { Profile } from '../../../src/models/profile.js';
import { Achievement } from '../../../src/models/achievement.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await createTestServer();
});

afterAll(async () => {
  await teardownTestServer();
});

describe('GET /api/games', () => {
  it('returns 200 with empty array when no games exist', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/games' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data?: unknown[]; games?: unknown[] }>();
    // Route returns { data: [], pagination: { ... } }
    const games = Array.isArray(body) ? body : (body.data ?? body.games ?? body);
    expect(games).toEqual([]);
  });

  it('returns 400 for invalid platform query param', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/games?platform=invalid' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when profileId does not exist', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/games?profileId=000000000000000000000000',
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/games/:id', () => {
  it('returns 404 for non-existent game id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/games/000000000000000000000000',
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/games?search=...', () => {
  let profileId: mongoose.Types.ObjectId;

  beforeEach(async () => {
    const profile = await Profile.create({
      platform: 'steam',
      profileId: 'search-test-user',
      displayName: 'Search Test User',
      credentials: {},
    });
    profileId = profile._id as mongoose.Types.ObjectId;
    await Game.deleteMany({});
    await Game.create([
      {
        platform: 'steam',
        profileId,
        gameId: '1',
        title: 'Halo Infinite',
        achievementsTotal: 100,
        achievementsUnlocked: 50,
        completionPercent: 50,
        lastSyncedAt: new Date(),
      },
      {
        platform: 'steam',
        profileId,
        gameId: '2',
        title: 'Forza Horizon 5',
        customTitle: 'My Racing Game',
        achievementsTotal: 80,
        achievementsUnlocked: 40,
        completionPercent: 50,
        lastSyncedAt: new Date(),
      },
      {
        platform: 'steam',
        profileId,
        gameId: '3',
        title: 'The Elder Scrolls V: Skyrim',
        achievementsTotal: 75,
        achievementsUnlocked: 70,
        completionPercent: 93,
        lastSyncedAt: new Date(),
      },
    ]);
  });

  afterAll(async () => {
    await Game.deleteMany({});
  });

  it('filters games by title case-insensitively', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/games?search=halo&profileId=${profileId}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].title).toBe('Halo Infinite');
  });

  it('searches in customTitle as well', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/games?search=racing&profileId=${profileId}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].title).toBe('Forza Horizon 5');
  });

  it('escapes regex special characters', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/games?search=V:&profileId=${profileId}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // "V:" matches "The Elder Scrolls V: Skyrim"
    expect(body.data).toHaveLength(1);
    expect(body.data[0].title).toBe('The Elder Scrolls V: Skyrim');
  });

  it('returns empty array when no matches', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/games?search=nonexistent&profileId=${profileId}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(0);
  });

  it('combines search with other filters', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/games?search=forza&onlyCompleted=true&profileId=${profileId}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Forza is 50% complete, not 100%, so should be filtered out
    expect(body.data).toHaveLength(0);
  });

  it('combines search with excludeHidden filter', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/games?search=halo&excludeHidden=true&profileId=${profileId}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].title).toBe('Halo Infinite');
  });

  it('returns pagination metadata', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/games?limit=2&offset=0&profileId=${profileId}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pagination.limit).toBe(2);
    expect(body.pagination.offset).toBe(0);
    expect(body.pagination.total).toBe(3);
    expect(body.pagination.hasMore).toBe(true);
    expect(body.data).toHaveLength(2);
  });
});

describe('PATCH /api/games/:id', () => {
  let gameId: string;

  beforeEach(async () => {
    await Game.deleteMany({});
    const game = await Game.create({
      platform: 'steam',
      profileId: new mongoose.Types.ObjectId(),
      gameId: '100',
      title: 'Test Game',
      achievementsTotal: 10,
      achievementsUnlocked: 5,
      completionPercent: 50,
      lastSyncedAt: new Date(),
    });
    gameId = game._id.toString();
  });

  afterAll(async () => {
    await Game.deleteMany({});
  });

  it('updates customTitle', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/games/${gameId}`,
      payload: { customTitle: 'My Custom Title' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.customTitle).toBe('My Custom Title');
    expect(body.title).toBe('Test Game');
  });

  it('resets customTitle to null', async () => {
    await Game.findByIdAndUpdate(gameId, { customTitle: 'Custom' });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/games/${gameId}`,
      payload: { customTitle: null },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.customTitle).toBeNull();
  });

  it('returns 404 for non-existent game', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/games/000000000000000000000000',
      payload: { customTitle: 'Nope' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 for empty customTitle', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/games/${gameId}`,
      payload: { customTitle: '   ' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('PATCH /api/games/:id/images/:imageType', () => {
  it('returns 400 for invalid imageType', async () => {
    const game = await Game.create({
      platform: 'steam',
      profileId: new mongoose.Types.ObjectId(),
      gameId: '200',
      title: 'Image Test',
      achievementsTotal: 1,
      achievementsUnlocked: 0,
      completionPercent: 0,
      lastSyncedAt: new Date(),
    });
    // No body — avoids Fastify's 415 for unregistered content-type.
    // imageType validation runs before req.file(), so 400 fires regardless.
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/games/${game._id}/images/invalid`,
    });
    expect(res.statusCode).toBe(400);
    await Game.deleteMany({});
  });

  it('returns 404 for non-existent game', async () => {
    // No body sent — avoids Fastify's 415 for unknown content-type.
    // The handler checks game existence before accessing req.file(), so 404 fires first.
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/games/000000000000000000000000/images/icon',
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/games/:id with platform filter', () => {
  it('returns game by gameId and platform', async () => {
    await Game.create({
      platform: 'steam',
      profileId: new mongoose.Types.ObjectId(),
      gameId: 'steam-platform-test',
      title: 'Platform Filter Game',
      achievementsTotal: 10,
      achievementsUnlocked: 5,
      completionPercent: 50,
      lastSyncedAt: new Date(),
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/games/steam-platform-test?platform=steam',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.title).toBe('Platform Filter Game');
    expect(body.gameId).toBe('steam-platform-test');
  });

  it('returns 404 when game not found by gameId+platform', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/games/nonexistent-game-id?platform=steam',
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 when profileId does not exist for game lookup', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/games/any-id?platform=steam&profileId=000000000000000000000000',
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns game by gameId when platform and profileId both provided', async () => {
    const profile = await Profile.create({
      platform: 'steam',
      profileId: 'platform-profile-test',
      displayName: 'Platform Profile Test',
      credentials: {},
    });
    await Game.create({
      platform: 'steam',
      profileId: profile._id,
      gameId: 'steam-with-profile',
      title: 'Profile + Platform Game',
      achievementsTotal: 5,
      achievementsUnlocked: 5,
      completionPercent: 100,
      lastSyncedAt: new Date(),
    });
    const res = await app.inject({
      method: 'GET',
      url: `/api/games/steam-with-profile?platform=steam&profileId=${profile._id}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.title).toBe('Profile + Platform Game');
  });
});

describe('GET /api/games platform aggregations', () => {
  it('includes totalAchievementsUnlocked for steam + profileId', async () => {
    const profile = await Profile.create({
      platform: 'steam',
      profileId: 'steam-agg-test',
      displayName: 'Steam Agg Test',
      credentials: {},
    });
    await Game.create([
      {
        platform: 'steam',
        profileId: profile._id,
        gameId: 'sagg1',
        title: 'Steam Agg A',
        achievementsTotal: 20,
        achievementsUnlocked: 15,
        completionPercent: 75,
        lastSyncedAt: new Date(),
      },
      {
        platform: 'steam',
        profileId: profile._id,
        gameId: 'sagg2',
        title: 'Steam Agg B',
        achievementsTotal: 10,
        achievementsUnlocked: 5,
        completionPercent: 50,
        lastSyncedAt: new Date(),
      },
    ]);
    const res = await app.inject({
      method: 'GET',
      url: `/api/games?platform=steam&profileId=${profile._id}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pagination.totalAchievementsUnlocked).toBe(20);
    expect(body.data).toHaveLength(2);
  });

  it('includes completedTotal for steam + profileId', async () => {
    const profile = await Profile.create({
      platform: 'steam',
      profileId: 'steam-completion-test',
      displayName: 'Steam Completion Test',
      credentials: {},
    });
    const games = await Game.create([
      {
        platform: 'steam',
        profileId: profile._id,
        gameId: 'sc1',
        title: 'Complete Grouped',
        achievementsTotal: 3,
        achievementsUnlocked: 3,
        completionPercent: 100,
        hasAchievementGroups: true,
        lastSyncedAt: new Date(),
      },
      {
        platform: 'steam',
        profileId: profile._id,
        gameId: 'sc2',
        title: 'Incomplete With Completed Group',
        achievementsTotal: 3,
        achievementsUnlocked: 1,
        completionPercent: 33,
        lastSyncedAt: new Date(),
      },
      {
        platform: 'steam',
        profileId: profile._id,
        gameId: 'sc3',
        title: 'Complete Legacy',
        achievementsTotal: 2,
        achievementsUnlocked: 2,
        completionPercent: 100,
        lastSyncedAt: new Date(),
      },
      {
        platform: 'steam',
        profileId: profile._id,
        gameId: 'sc4',
        title: 'Complete Two Groups',
        achievementsTotal: 3,
        achievementsUnlocked: 3,
        completionPercent: 100,
        hasAchievementGroups: true,
        lastSyncedAt: new Date(),
      },
    ]);
    await Achievement.create([
      // sc1 base group: fully unlocked → 1
      { platform: 'steam', profileId: profile._id, gameId: games[0]._id, achievementId: 'a1', name: 'A1', groupId: '0', groupName: 'Base Game', groupOrder: 0, unlockedAt: new Date() },
      { platform: 'steam', profileId: profile._id, gameId: games[0]._id, achievementId: 'a2', name: 'A2', groupId: '0', groupName: 'Base Game', groupOrder: 0, unlockedAt: new Date() },
      // sc1 DLC group: partially unlocked → does not count
      { platform: 'steam', profileId: profile._id, gameId: games[0]._id, achievementId: 'a3', name: 'A3', groupId: '5', groupName: 'DLC', groupOrder: 1 },
      // sc2 legacy achievements (no groupId) → do not count
      { platform: 'steam', profileId: profile._id, gameId: games[1]._id, achievementId: 'b1', name: 'B1', unlockedAt: new Date() },
      { platform: 'steam', profileId: profile._id, gameId: games[1]._id, achievementId: 'b2', name: 'B2' },
      // sc2 update group: fully unlocked → counts even though game itself is not 100%
      { platform: 'steam', profileId: profile._id, gameId: games[1]._id, achievementId: 'b3', name: 'B3', groupId: '9', groupName: 'Update', groupOrder: 1, unlockedAt: new Date() },
      // sc3 completed but no group data → contributes nothing
      { platform: 'steam', profileId: profile._id, gameId: games[2]._id, achievementId: 'c1', name: 'C1', unlockedAt: new Date() },
      { platform: 'steam', profileId: profile._id, gameId: games[2]._id, achievementId: 'c2', name: 'C2', unlockedAt: new Date() },
      // sc4 two fully unlocked groups → 2
      { platform: 'steam', profileId: profile._id, gameId: games[3]._id, achievementId: 'd1', name: 'D1', groupId: '0', groupName: 'Base Game', groupOrder: 0, unlockedAt: new Date() },
      { platform: 'steam', profileId: profile._id, gameId: games[3]._id, achievementId: 'd2', name: 'D2', groupId: '0', groupName: 'Base Game', groupOrder: 0, unlockedAt: new Date() },
      { platform: 'steam', profileId: profile._id, gameId: games[3]._id, achievementId: 'd3', name: 'D3', groupId: '7', groupName: 'Update', groupOrder: 1, unlockedAt: new Date() },
    ]);

    const res = await app.inject({
      method: 'GET',
      url: `/api/games?platform=steam&profileId=${profile._id}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // groups are the unit of completion: sc1 (1) + sc2 update group (1) + sc4 (2)
    expect(body.pagination.completedTotal).toBe(4);
    expect(body.pagination).not.toHaveProperty('completedGames');
    expect(body.pagination).not.toHaveProperty('completedGroups');
  });

  it('includes gamerscore totals for xbox + profileId', async () => {
    const profile = await Profile.create({
      platform: 'xbox',
      profileId: 'xbox-agg-test',
      displayName: 'Xbox Agg Test',
      credentials: {},
    });
    await Game.create([
      {
        platform: 'xbox',
        profileId: profile._id,
        gameId: 'xagg1',
        title: 'Xbox Agg A',
        achievementsTotal: 30,
        achievementsUnlocked: 20,
        completionPercent: 66,
        currentGamerscore: 500,
        maxGamerscore: 1000,
        lastSyncedAt: new Date(),
      },
      {
        platform: 'xbox',
        profileId: profile._id,
        gameId: 'xagg2',
        title: 'Xbox Agg B',
        achievementsTotal: 20,
        achievementsUnlocked: 10,
        completionPercent: 50,
        currentGamerscore: 300,
        maxGamerscore: 500,
        lastSyncedAt: new Date(),
      },
    ]);
    const res = await app.inject({
      method: 'GET',
      url: `/api/games?platform=xbox&profileId=${profile._id}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pagination.totalCurrentGamerscore).toBe(800);
    expect(body.pagination.totalMaxGamerscore).toBe(1500);
  });

  it('includes trophy summary for playstation + profileId', async () => {
    const profile = await Profile.create({
      platform: 'playstation',
      profileId: 'ps-agg-test',
      displayName: 'PS Agg Test',
      credentials: {},
    });
    await Game.create({
      platform: 'playstation',
      profileId: profile._id,
      gameId: 'psagg1',
      title: 'PS Agg Game',
      achievementsTotal: 20,
      achievementsUnlocked: 10,
      completionPercent: 50,
      trophyBronze: 5,
      trophySilver: 3,
      trophyGold: 1,
      trophyPlatinum: 0,
      lastSyncedAt: new Date(),
    });
    const res = await app.inject({
      method: 'GET',
      url: `/api/games?platform=playstation&profileId=${profile._id}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pagination.trophySummary).toBeDefined();
    expect(body.pagination.trophySummary.totalBronze).toBe(5);
    expect(body.pagination.trophySummary.totalSilver).toBe(3);
    expect(body.pagination.trophySummary.totalGold).toBe(1);
    expect(body.pagination.trophySummary.totalPlatinum).toBe(0);
  });

  it('filters by specific Xbox device', async () => {
    const profile = await Profile.create({
      platform: 'xbox',
      profileId: 'xbox-device-test',
      displayName: 'Xbox Device Test',
      credentials: {},
    });
    await Game.create([
      {
        platform: 'xbox',
        profileId: profile._id,
        gameId: 'dev1',
        title: 'Xbox Series Game',
        achievementsTotal: 10,
        achievementsUnlocked: 5,
        completionPercent: 50,
        devices: ['XboxSeries'],
        lastSyncedAt: new Date(),
      },
      {
        platform: 'xbox',
        profileId: profile._id,
        gameId: 'dev2',
        title: 'Xbox 360 Game',
        achievementsTotal: 20,
        achievementsUnlocked: 10,
        completionPercent: 50,
        devices: ['Xbox360'],
        lastSyncedAt: new Date(),
      },
    ]);
    const res = await app.inject({
      method: 'GET',
      url: `/api/games?platform=xbox&device=XboxSeries&profileId=${profile._id}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].title).toBe('Xbox Series Game');
  });
});
