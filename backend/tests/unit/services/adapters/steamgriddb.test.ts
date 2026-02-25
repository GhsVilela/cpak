import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SteamGridDBAdapter, createSteamGridDBAdapter } from '../../../../src/services/adapters/steamgriddb.js';

vi.mock('../../../../src/services/configService.js', () => ({
  configService: {
    getSetting: vi.fn().mockResolvedValue('fake-sgdb-api-key'),
    getAllSettings: vi.fn().mockResolvedValue([]),
  },
}));

describe('SteamGridDBAdapter', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('getGridImages returns array of images on 200 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: [
          { id: 1, url: 'https://example.com/grid.png', thumb: 'https://example.com/thumb.png', tags: [], author: { name: 'Test', steam64: '123' }, width: 600, height: 900, score: 100, style: 'alternate', notes: null },
        ],
      }),
    }));

    const adapter = new SteamGridDBAdapter('fake-key');
    const images = await adapter.getGridImages(12345);
    expect(images).toHaveLength(1);
    expect(images[0].url).toBe('https://example.com/grid.png');
  });

  it('getGridImages returns empty array on 404 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    }));

    const adapter = new SteamGridDBAdapter('fake-key');
    const images = await adapter.getGridImages(99999);
    expect(images).toEqual([]);
  });

  it('createSteamGridDBAdapter returns null when API key is not configured', async () => {
    // Override the configService mock for this test
    const { configService } = await import('../../../../src/services/configService.js');
    vi.mocked(configService.getSetting).mockResolvedValueOnce(undefined);

    const adapter = await createSteamGridDBAdapter();
    expect(adapter).toBeNull();
  });

  it('createSteamGridDBAdapter returns adapter instance when API key is configured', async () => {
    const { configService } = await import('../../../../src/services/configService.js');
    vi.mocked(configService.getSetting).mockResolvedValueOnce('valid-key');

    const adapter = await createSteamGridDBAdapter();
    expect(adapter).toBeInstanceOf(SteamGridDBAdapter);
  });
});
