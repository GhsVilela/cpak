import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { Game } from '../../../src/models/game.js';
import { backfillPlayStationGameImages } from '../../../src/services/playstationImageBackfill.js';

const { downloadGameImage } = vi.hoisted(() => ({
  downloadGameImage: vi.fn(),
}));

vi.mock('../../../src/services/adapters/playstation.js', () => ({
  createPlayStationAdapter: vi.fn(() => ({
    downloadGameImage: (...args: unknown[]) => downloadGameImage(...args),
  })),
}));

vi.mock('../../../src/services/adapters/steamgriddb.js', () => ({
  createSteamGridDBAdapter: vi.fn().mockResolvedValue({ id: 'sgdb-adapter' }),
}));

const createGame = async (profileId: Types.ObjectId, gameId: string, overrides: Record<string, unknown> = {}) =>
  Game.create({
    platform: 'playstation',
    profileId,
    gameId,
    title: `Game ${gameId}`,
    achievementsTotal: 10,
    achievementsUnlocked: 4,
    completionPercent: 40,
    ...overrides,
  });

describe('backfillPlayStationGameImages', () => {
  let profileId: Types.ObjectId;

  beforeEach(async () => {
    profileId = new Types.ObjectId();
    downloadGameImage.mockReset();
    downloadGameImage.mockResolvedValue({
      capsuleImagePath: 'playstation/grid.jpg',
      iconImagePath: 'playstation/icon.jpg',
      heroImagePath: 'playstation/hero.jpg',
    });
  });

  it('downloads cover art for games that have none', async () => {
    await createGame(profileId, 'NPWR00001_00');

    const updated = await backfillPlayStationGameImages(profileId);

    expect(updated).toBe(1);
    expect(downloadGameImage).toHaveBeenCalledTimes(1);
    expect(downloadGameImage).toHaveBeenCalledWith(
      'Game NPWR00001_00',
      'NPWR00001_00',
      undefined,
      expect.anything(),
    );

    const game = await Game.findOne({ gameId: 'NPWR00001_00' });
    expect(game?.capsuleImagePath).toBe('playstation/grid.jpg');
    expect(game?.iconImagePath).toBe('playstation/icon.jpg');
    expect(game?.heroImagePath).toBe('playstation/hero.jpg');
  });

  it('skips games that already have cover art', async () => {
    await createGame(profileId, 'NPWR00002_00', {
      capsuleImagePath: 'playstation/existing-grid.jpg',
      heroImagePath: 'playstation/existing-hero.jpg',
    });

    const updated = await backfillPlayStationGameImages(profileId);

    expect(updated).toBe(0);
    expect(downloadGameImage).not.toHaveBeenCalled();
  });

  it('excludes the games that were already handled by the sync loop', async () => {
    await createGame(profileId, 'NPWR00003_00');
    await createGame(profileId, 'NPWR00004_00');

    const updated = await backfillPlayStationGameImages(profileId, {
      excludeGameIds: ['NPWR00003_00'],
    });

    expect(updated).toBe(1);
    expect(downloadGameImage).toHaveBeenCalledTimes(1);
    expect(downloadGameImage).toHaveBeenCalledWith(
      'Game NPWR00004_00',
      'NPWR00004_00',
      undefined,
      expect.anything(),
    );
  });

  it('only backfills the requested game ids', async () => {
    await createGame(profileId, 'NPWR00005_00');
    await createGame(profileId, 'NPWR00006_00');

    const updated = await backfillPlayStationGameImages(profileId, {
      gameIds: ['NPWR00006_00'],
    });

    expect(updated).toBe(1);
    expect(downloadGameImage).toHaveBeenCalledWith(
      'Game NPWR00006_00',
      'NPWR00006_00',
      undefined,
      expect.anything(),
    );
  });

  it('does not touch games belonging to another profile', async () => {
    const otherProfileId = new Types.ObjectId();
    await createGame(otherProfileId, 'NPWR00007_00');

    const updated = await backfillPlayStationGameImages(profileId);

    expect(updated).toBe(0);
    expect(downloadGameImage).not.toHaveBeenCalled();
  });

  it('keeps the game record when the download fails', async () => {
    await createGame(profileId, 'NPWR00008_00');
    downloadGameImage.mockRejectedValue(new Error('network down'));

    const updated = await backfillPlayStationGameImages(profileId);

    expect(updated).toBe(0);
    const game = await Game.findOne({ gameId: 'NPWR00008_00' });
    expect(game?.capsuleImagePath).toBeUndefined();
    expect(game?.heroImagePath).toBeUndefined();
  });
});
