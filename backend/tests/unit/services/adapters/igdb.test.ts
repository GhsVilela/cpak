import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IGDBAdapter, createIGDBAdapter } from '../../../../src/services/adapters/igdb.js';

const { checkLocalFileMock, downloadAndStoreMock } = vi.hoisted(() => ({
  checkLocalFileMock: vi.fn().mockReturnValue(null),
  downloadAndStoreMock: vi.fn().mockResolvedValue('path.jpg'),
}));

vi.mock('../../../../src/services/configService.js', () => ({
  configService: {
    getSetting: vi.fn(),
  },
}));

vi.mock('../../../../src/utils/imageStorage.js', () => ({
  imageStorage: {
    checkLocalFile: checkLocalFileMock,
    downloadAndStore: downloadAndStoreMock,
  },
}));

vi.mock('../../../../src/utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { configService } from '../../../../src/services/configService.js';

describe('IGDBAdapter', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    checkLocalFileMock.mockReturnValue(null);
    downloadAndStoreMock.mockResolvedValue('path.jpg');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // --- Authentication ---

  it('authenticates and caches token', async () => {
    let fetchCallCount = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('id.twitch.tv')) {
        fetchCallCount++;
        return {
          ok: true,
          json: async () => ({ access_token: 'test-token', expires_in: 3600 }),
        };
      }
      // IGDB API call
      return {
        ok: true,
        json: async () => ([{ id: 1, name: 'Test Game', cover: { id: 10, image_id: 'abc123' } }]),
      };
    }));

    const adapter = new IGDBAdapter('client-id', 'client-secret');
    await adapter.searchGame('Test Game');
    await adapter.searchGame('Test Game 2');

    // Should only authenticate once (token cached)
    expect(fetchCallCount).toBe(1);
  });

  it('re-authenticates on 401', async () => {
    let authCount = 0;
    let apiCallCount = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('id.twitch.tv')) {
        authCount++;
        return {
          ok: true,
          json: async () => ({ access_token: `token-${authCount}`, expires_in: 3600 }),
        };
      }
      apiCallCount++;
      if (apiCallCount === 1) {
        return { ok: false, status: 401, statusText: 'Unauthorized' };
      }
      return {
        ok: true,
        json: async () => ([{ id: 1, name: 'Test' }]),
      };
    }));

    const adapter = new IGDBAdapter('client-id', 'client-secret');
    const result = await adapter.searchGame('Test');

    expect(authCount).toBe(2); // Initial + retry
    expect(result).not.toBeNull();
  });

  it('throws on auth failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    }));

    const adapter = new IGDBAdapter('bad-id', 'bad-secret');
    const result = await adapter.searchGame('Test');
    expect(result).toBeNull();
  });

  // --- searchGame ---

  it('searchGame returns exact match when available', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('id.twitch.tv')) {
        return { ok: true, json: async () => ({ access_token: 'tok', expires_in: 3600 }) };
      }
      return {
        ok: true,
        json: async () => ([
          { id: 1, name: 'God of War (2018)', cover: { id: 10, image_id: 'gow18' } },
          { id: 2, name: 'God of War', cover: { id: 11, image_id: 'gow' } },
        ]),
      };
    }));

    const adapter = new IGDBAdapter('cid', 'cs');
    const result = await adapter.searchGame('God of War');
    expect(result!.name).toBe('God of War');
    expect(result!.id).toBe(2);
  });

  it('searchGame returns first result when no exact match', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('id.twitch.tv')) {
        return { ok: true, json: async () => ({ access_token: 'tok', expires_in: 3600 }) };
      }
      return {
        ok: true,
        json: async () => ([
          { id: 1, name: 'God of War Ragnarok', cover: { id: 10, image_id: 'gowr' } },
        ]),
      };
    }));

    const adapter = new IGDBAdapter('cid', 'cs');
    const result = await adapter.searchGame('God of War');
    expect(result!.id).toBe(1);
  });

  it('searchGame returns null when no results', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('id.twitch.tv')) {
        return { ok: true, json: async () => ({ access_token: 'tok', expires_in: 3600 }) };
      }
      return { ok: true, json: async () => ([]) };
    }));

    const adapter = new IGDBAdapter('cid', 'cs');
    const result = await adapter.searchGame('NonexistentGame12345');
    expect(result).toBeNull();
  });

  // --- getCoverUrl ---

  it('getCoverUrl returns URL for game with cover', () => {
    const adapter = new IGDBAdapter('cid', 'cs');
    const url = adapter.getCoverUrl({
      id: 1, name: 'Test', cover: { id: 10, image_id: 'abc123' },
    });
    expect(url).toBe('https://images.igdb.com/igdb/image/upload/t_cover_big_2x/abc123.jpg');
  });

  it('getCoverUrl returns null for game without cover', () => {
    const adapter = new IGDBAdapter('cid', 'cs');
    const url = adapter.getCoverUrl({ id: 1, name: 'Test' });
    expect(url).toBeNull();
  });

  // --- getArtworkUrl ---

  it('getArtworkUrl returns URL for game with artworks', () => {
    const adapter = new IGDBAdapter('cid', 'cs');
    const url = adapter.getArtworkUrl({
      id: 1, name: 'Test', artworks: [{ id: 5, image_id: 'art456' }],
    });
    expect(url).toBe('https://images.igdb.com/igdb/image/upload/t_1080p/art456.jpg');
  });

  it('getArtworkUrl returns null for game without artworks', () => {
    const adapter = new IGDBAdapter('cid', 'cs');
    expect(adapter.getArtworkUrl({ id: 1, name: 'Test' })).toBeNull();
    expect(adapter.getArtworkUrl({ id: 1, name: 'Test', artworks: [] })).toBeNull();
  });

  // --- downloadGameImage ---

  it('downloadGameImage returns cached path when available', async () => {
    checkLocalFileMock.mockReturnValue('steam/123/game_grid.jpg');

    const adapter = new IGDBAdapter('cid', 'cs');
    const result = await adapter.downloadGameImage('Test', 'steam', '123');
    expect(result).toBe('steam/123/game_grid.jpg');
  });

  it('downloadGameImage searches and downloads cover', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('id.twitch.tv')) {
        return { ok: true, json: async () => ({ access_token: 'tok', expires_in: 3600 }) };
      }
      return {
        ok: true,
        json: async () => ([
          { id: 1, name: 'Halo Infinite', cover: { id: 10, image_id: 'halo_cover' } },
        ]),
      };
    }));

    downloadAndStoreMock.mockResolvedValue('xbox/123/game_grid.jpg');

    const adapter = new IGDBAdapter('cid', 'cs');
    const result = await adapter.downloadGameImage('Halo Infinite', 'xbox', '123');
    expect(result).toBe('xbox/123/game_grid.jpg');
    expect(downloadAndStoreMock).toHaveBeenCalledWith(
      'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/halo_cover.jpg',
      'xbox', '123', 'game', 'grid',
    );
  });

  it('downloadGameImage returns null when game not found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('id.twitch.tv')) {
        return { ok: true, json: async () => ({ access_token: 'tok', expires_in: 3600 }) };
      }
      return { ok: true, json: async () => ([]) };
    }));

    const adapter = new IGDBAdapter('cid', 'cs');
    const result = await adapter.downloadGameImage('NonexistentGame', 'steam', '999');
    expect(result).toBeNull();
  });

  it('downloadGameImage returns null when game has no cover', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('id.twitch.tv')) {
        return { ok: true, json: async () => ({ access_token: 'tok', expires_in: 3600 }) };
      }
      return { ok: true, json: async () => ([{ id: 1, name: 'NoCover' }]) };
    }));

    const adapter = new IGDBAdapter('cid', 'cs');
    const result = await adapter.downloadGameImage('NoCover', 'steam', '111');
    expect(result).toBeNull();
  });

  // --- downloadHeroImage ---

  it('downloadHeroImage downloads artwork', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('id.twitch.tv')) {
        return { ok: true, json: async () => ({ access_token: 'tok', expires_in: 3600 }) };
      }
      return {
        ok: true,
        json: async () => ([
          { id: 1, name: 'Test', artworks: [{ id: 5, image_id: 'hero_art' }] },
        ]),
      };
    }));

    downloadAndStoreMock.mockResolvedValue('playstation/NP123/game_hero.jpg');

    const adapter = new IGDBAdapter('cid', 'cs');
    const result = await adapter.downloadHeroImage('Test', 'playstation', 'NP123');
    expect(result).toBe('playstation/NP123/game_hero.jpg');
    expect(downloadAndStoreMock).toHaveBeenCalledWith(
      'https://images.igdb.com/igdb/image/upload/t_1080p/hero_art.jpg',
      'playstation', 'NP123', 'game', 'hero',
    );
  });

  it('downloadHeroImage returns null when no artwork', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('id.twitch.tv')) {
        return { ok: true, json: async () => ({ access_token: 'tok', expires_in: 3600 }) };
      }
      return { ok: true, json: async () => ([{ id: 1, name: 'Test' }]) };
    }));

    const adapter = new IGDBAdapter('cid', 'cs');
    const result = await adapter.downloadHeroImage('Test', 'steam', '123');
    expect(result).toBeNull();
  });

  // --- createIGDBAdapter factory ---

  it('createIGDBAdapter returns adapter when credentials configured', async () => {
    vi.mocked(configService.getSetting)
      .mockResolvedValueOnce('my-client-id')
      .mockResolvedValueOnce('my-client-secret');

    const adapter = await createIGDBAdapter();
    expect(adapter).toBeInstanceOf(IGDBAdapter);
  });

  it('createIGDBAdapter returns null when client ID missing', async () => {
    vi.mocked(configService.getSetting)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce('my-client-secret');

    const adapter = await createIGDBAdapter();
    expect(adapter).toBeNull();
  });

  it('createIGDBAdapter returns null when client secret missing', async () => {
    vi.mocked(configService.getSetting)
      .mockResolvedValueOnce('my-client-id')
      .mockResolvedValueOnce(undefined);

    const adapter = await createIGDBAdapter();
    expect(adapter).toBeNull();
  });

  it('createIGDBAdapter returns null on settings error', async () => {
    vi.mocked(configService.getSetting).mockRejectedValue(new Error('DB error'));

    const adapter = await createIGDBAdapter();
    expect(adapter).toBeNull();
  });
});
