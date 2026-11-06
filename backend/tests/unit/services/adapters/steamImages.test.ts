import { describe, it, expect, vi, beforeEach } from 'vitest';

const { checkLocalFileMock, downloadAndStoreMock } = vi.hoisted(() => ({
  checkLocalFileMock: vi.fn(),
  downloadAndStoreMock: vi.fn(),
}));

vi.mock('../../../../src/utils/imageStorage.js', () => ({
  imageStorage: {
    checkLocalFile: checkLocalFileMock,
    downloadAndStore: downloadAndStoreMock,
    checkCachedGameImages: vi.fn().mockReturnValue({}),
  },
}));

vi.mock('../../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { SteamAdapter } from '../../../../src/services/adapters/steam.js';

function createProgress() {
  return {
    begin: vi.fn().mockResolvedValue(undefined),
    setTotal: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    complete: vi.fn().mockResolvedValue(undefined),
    finish: vi.fn().mockResolvedValue(undefined),
  } as any;
}

const syncOperation = {
  _id: 'op1',
  adaptiveParams: { concurrency: 2, batchSize: 10, delay: 0 },
  iconDownloadsCompleted: 0,
  iconDownloadsPending: 0,
};

const achievements = [{
  appId: 10,
  achievementId: 'ACH_1',
  icon: 'https://cdn.example/icon.jpg',
  iconGray: 'https://cdn.example/icon-gray.jpg',
}];

describe('SteamAdapter.downloadAchievementIcons planning', () => {
  const adapter = new SteamAdapter('fake-key');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips downloads and reports "already up to date" when both icons are cached', async () => {
    checkLocalFileMock.mockImplementation(
      (_platform: string, _gameId: string, _achievementId: string, type: string) =>
        type === 'icon' ? 'steam/10/ACH_1_icon.jpg' : 'steam/10/ACH_1_iconGray.jpg',
    );
    const progress = createProgress();

    const result = await adapter.downloadAchievementIcons(achievements, syncOperation, progress);

    expect(downloadAndStoreMock).not.toHaveBeenCalled();
    expect(result.iconMap.get('10:ACH_1')).toEqual({
      iconPath: 'steam/10/ACH_1_icon.jpg',
      iconGrayPath: 'steam/10/ACH_1_iconGray.jpg',
    });
    expect(progress.begin).toHaveBeenCalledWith(
      'icons',
      0,
      'Achievement icons already up to date',
      expect.objectContaining({ iconDownloadsPending: 1, iconDownloadsCompleted: 1 }),
    );
    expect(result.completed).toBe(1);
  });

  it('reports only the number of achievements with missing icons', async () => {
    checkLocalFileMock.mockReturnValue(undefined);
    downloadAndStoreMock
      .mockResolvedValueOnce('steam/10/ACH_1_icon.jpg')
      .mockResolvedValueOnce('steam/10/ACH_1_iconGray.jpg');
    const progress = createProgress();

    const result = await adapter.downloadAchievementIcons(achievements, syncOperation, progress);

    expect(downloadAndStoreMock).toHaveBeenCalledTimes(2);
    expect(progress.begin).toHaveBeenCalledWith(
      'icons',
      1,
      'Downloading achievement icons... (0/1)',
      expect.objectContaining({ iconDownloadsPending: 1 }),
    );
    expect(progress.update).toHaveBeenCalledWith(
      1,
      'Downloading achievement icons... (1/1)',
      expect.objectContaining({ iconDownloadsCompleted: 1 }),
    );
    expect(result.iconMap.get('10:ACH_1')).toEqual({
      iconPath: 'steam/10/ACH_1_icon.jpg',
      iconGrayPath: 'steam/10/ACH_1_iconGray.jpg',
    });
  });
});
