import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SteamGridDBAdapter, createSteamGridDBAdapter } from '../../../../src/services/adapters/steamgriddb.js';

const { checkLocalFileMock, downloadAndStoreMock, getAbsolutePathMock, existsSyncMock, readdirSyncMock } = vi.hoisted(() => ({
  checkLocalFileMock: vi.fn().mockReturnValue(null),
  downloadAndStoreMock: vi.fn().mockResolvedValue('path.jpg'),
  getAbsolutePathMock: vi.fn().mockReturnValue('/fake'),
  existsSyncMock: vi.fn().mockReturnValue(false),
  readdirSyncMock: vi.fn().mockReturnValue([]),
}));

vi.mock('../../../../src/services/configService.js', () => ({
  configService: {
    getSetting: vi.fn().mockResolvedValue('fake-sgdb-api-key'),
    getAllSettings: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../../../src/utils/imageStorage.js', () => ({
  imageStorage: {
    checkLocalFile: checkLocalFileMock,
    downloadAndStore: downloadAndStoreMock,
    getAbsolutePath: getAbsolutePathMock,
  },
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: existsSyncMock,
      readdirSync: readdirSyncMock,
    },
    existsSync: existsSyncMock,
    readdirSync: readdirSyncMock,
  };
});

describe('SteamGridDBAdapter', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    checkLocalFileMock.mockReturnValue(null);
    downloadAndStoreMock.mockResolvedValue('path.jpg');
    existsSyncMock.mockReturnValue(false);
    readdirSyncMock.mockReturnValue([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // --- searchGameBySteamId ---

  it('searchGameBySteamId returns game data on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { id: 100, name: 'Half-Life 2', types: ['game'], verified: true },
      }),
    }));
    const adapter = new SteamGridDBAdapter('fake-key');
    const game = await adapter.searchGameBySteamId(220);
    expect(game).not.toBeNull();
    expect(game!.name).toBe('Half-Life 2');
  });

  it('searchGameBySteamId returns null on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    }));
    const adapter = new SteamGridDBAdapter('fake-key');
    const game = await adapter.searchGameBySteamId(99999);
    expect(game).toBeNull();
  });

  it('searchGameBySteamId returns null on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Timeout')));
    const adapter = new SteamGridDBAdapter('fake-key');
    const game = await adapter.searchGameBySteamId(220);
    expect(game).toBeNull();
  });

  it('searchGameBySteamId returns null on non-404 error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    }));
    const adapter = new SteamGridDBAdapter('fake-key');
    const game = await adapter.searchGameBySteamId(220);
    expect(game).toBeNull();
  });

  // --- getGridImages ---

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

  it('createSteamGridDBAdapter returns null when getSetting throws', async () => {
    const { configService } = await import('../../../../src/services/configService.js');
    vi.mocked(configService.getSetting).mockRejectedValueOnce(new Error('DB error'));

    const adapter = await createSteamGridDBAdapter();
    expect(adapter).toBeNull();
  });

  // --- getHeroImages ---

  it('getHeroImages returns array of images on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 1, url: 'https://example.com/hero.png', thumb: '', tags: [], author: { name: 'A', steam64: '1' }, width: 1920, height: 620, score: 50, style: 'default', notes: null },
        ],
      }),
    }));
    const adapter = new SteamGridDBAdapter('fake-key');
    const images = await adapter.getHeroImages(12345);
    expect(images).toHaveLength(1);
    expect(images[0].url).toBe('https://example.com/hero.png');
  });

  it('getHeroImages passes dimension filter in request', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 1, url: 'https://example.com/hero.png' }] }),
    });
    vi.stubGlobal('fetch', mockFetch);
    const adapter = new SteamGridDBAdapter('fake-key');
    await adapter.getHeroImages(12345);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('dimensions=1920x620');
    expect(calledUrl).toContain('types=static');
  });

  it('getHeroImages falls back to all dimensions when filtered results are empty', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ id: 2, url: 'https://example.com/hero-large.png' }] }) });
    vi.stubGlobal('fetch', mockFetch);
    const adapter = new SteamGridDBAdapter('fake-key');
    const images = await adapter.getHeroImages(12345);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    // First call has dimension filter, second does not
    expect((mockFetch.mock.calls[0][0] as string)).toContain('dimensions=');
    expect((mockFetch.mock.calls[1][0] as string)).not.toContain('dimensions=');
    expect(images).toHaveLength(1);
    expect(images[0].url).toBe('https://example.com/hero-large.png');
  });

  it('getHeroImages returns empty array on error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    }));
    const adapter = new SteamGridDBAdapter('fake-key');
    const images = await adapter.getHeroImages(12345);
    expect(images).toEqual([]);
  });

  it('getHeroImages returns empty array on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Timeout')));
    const adapter = new SteamGridDBAdapter('fake-key');
    const images = await adapter.getHeroImages(12345);
    expect(images).toEqual([]);
  });

  // --- getIconImages ---

  it('getIconImages returns all icons sorted PNG-first', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 1, url: 'https://example.com/icon.ico', thumb: '', tags: [], author: { name: 'A', steam64: '1' }, width: 64, height: 64, score: 80, style: 'default', notes: null },
          { id: 2, url: 'https://example.com/icon.png', thumb: '', tags: [], author: { name: 'B', steam64: '2' }, width: 64, height: 64, score: 50, style: 'default', notes: null },
        ],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);
    const adapter = new SteamGridDBAdapter('fake-key');
    const images = await adapter.getIconImages(12345);
    expect(images).toHaveLength(2);
    // PNG should come first despite lower score
    expect(images[0].url).toBe('https://example.com/icon.png');
    expect(images[1].url).toBe('https://example.com/icon.ico');
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('types=static');
    expect(calledUrl).not.toContain('mimes=');
  });

  it('getIconImages returns empty array on error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    }));
    const adapter = new SteamGridDBAdapter('fake-key');
    const images = await adapter.getIconImages(12345);
    expect(images).toEqual([]);
  });

  it('getIconImages returns empty array on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Timeout')));
    const adapter = new SteamGridDBAdapter('fake-key');
    const images = await adapter.getIconImages(12345);
    expect(images).toEqual([]);
  });

  // --- searchGameByName ---

  it('searchGameByName returns verified game when available', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 1, name: 'Halo', types: ['game'], verified: false },
          { id: 2, name: 'Halo Infinite', types: ['game'], verified: true },
        ],
      }),
    }));
    const adapter = new SteamGridDBAdapter('fake-key');
    const game = await adapter.searchGameByName('Halo');
    expect(game).not.toBeNull();
    expect(game!.id).toBe(2); // verified entry preferred
    expect(game!.verified).toBe(true);
  });

  it('searchGameByName returns first result when none verified', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 1, name: 'Halo', types: ['game'], verified: false },
        ],
      }),
    }));
    const adapter = new SteamGridDBAdapter('fake-key');
    const game = await adapter.searchGameByName('Halo');
    expect(game).not.toBeNull();
    expect(game!.id).toBe(1);
  });

  it('searchGameByName returns null on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    }));
    const adapter = new SteamGridDBAdapter('fake-key');
    const game = await adapter.searchGameByName('nonexistent');
    expect(game).toBeNull();
  });

  it('searchGameByName returns null when empty results', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    }));
    const adapter = new SteamGridDBAdapter('fake-key');
    const game = await adapter.searchGameByName('nothing');
    expect(game).toBeNull();
  });

  it('searchGameByName returns null on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));
    const adapter = new SteamGridDBAdapter('fake-key');
    const game = await adapter.searchGameByName('Halo');
    expect(game).toBeNull();
  });

  it('searchGameByName returns null on non-404 API error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    }));
    const adapter = new SteamGridDBAdapter('fake-key');
    const game = await adapter.searchGameByName('Halo');
    expect(game).toBeNull();
  });

  // --- getGridImages with styles parameter ---

  it('getGridImages passes styles parameter when provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    });
    vi.stubGlobal('fetch', mockFetch);
    const adapter = new SteamGridDBAdapter('fake-key');
    await adapter.getGridImages(123, 'alternate');
    expect(mockFetch.mock.calls[0][0]).toContain('styles=alternate');
  });

  it('getGridImages returns empty array on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));
    const adapter = new SteamGridDBAdapter('fake-key');
    const images = await adapter.getGridImages(123);
    expect(images).toEqual([]);
  });

  // --- normalizeGameName (accessed indirectly via downloadGameImageByName) ---

  describe('normalizeGameName (via downloadGameImageByName)', () => {
    // We test normalizeGameName indirectly because it's private.
    // downloadGameImageByName calls normalizeGameName then searchGameByName.
    // We can observe the normalized name through the fetch URL.

    it('splits CamelCase into spaced words', async () => {
      const calls: string[] = [];
      vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
        calls.push(url);
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: [] }),
        });
      }));
      const adapter = new SteamGridDBAdapter('fake-key');
      await adapter.downloadGameImageByName('SplinterCellConviction', 'xbox', 'id1');
      // First call should be searchGameByName with normalized name
      expect(calls[0]).toContain(encodeURIComponent('Splinter Cell Conviction'));
    });

    it('converts ALLCAPS to title case', async () => {
      const calls: string[] = [];
      vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
        calls.push(url);
        return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
      }));
      const adapter = new SteamGridDBAdapter('fake-key');
      await adapter.downloadGameImageByName('DEAD RISING', 'xbox', 'id2');
      expect(calls[0]).toContain(encodeURIComponent('Dead Rising'));
    });

    it('removes parenthesized content', async () => {
      const calls: string[] = [];
      vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
        calls.push(url);
        return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
      }));
      const adapter = new SteamGridDBAdapter('fake-key');
      await adapter.downloadGameImageByName('Halo (Xbox Edition)', 'xbox', 'id3');
      expect(calls[0]).toContain(encodeURIComponent('Halo'));
      expect(calls[0]).not.toContain('Xbox');
    });

    it('inserts space between letter-digit boundaries', async () => {
      const calls: string[] = [];
      vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
        calls.push(url);
        return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
      }));
      const adapter = new SteamGridDBAdapter('fake-key');
      await adapter.downloadGameImageByName('DEADRISING2', 'xbox', 'id4');
      // DEADRISING2 → DEADRISING 2 → letters then camelCase → Dead Rising 2
      expect(calls[0]).toContain('2');
    });

    it('title-cases uppercase words in mixed-case names', async () => {
      const calls: string[] = [];
      vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
        calls.push(url);
        return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
      }));
      const adapter = new SteamGridDBAdapter('fake-key');
      // "HaloCOMBAT" → CamelCase split → "Halo COMBAT" → not all-caps → else branch title-cases "COMBAT" → "Halo Combat"
      await adapter.downloadGameImageByName('HaloCOMBAT', 'xbox', 'id5');
      expect(calls[0]).toContain(encodeURIComponent('Halo Combat'));
    });
  });

  // --- downloadGameImage ---

  describe('downloadGameImage', () => {
    it('returns cached path when grid image already exists', async () => {
      vi.stubGlobal('fetch', vi.fn());
      existsSyncMock.mockReturnValue(true);
      readdirSyncMock.mockReturnValue(['game_grid.jpg']);
      
      const adapter = new SteamGridDBAdapter('fake-key');
      const result = await adapter.downloadGameImage(440);
      expect(result).toContain('game_grid.jpg');
    });

    it('returns null when game not found in SteamGridDB', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      }));
      const adapter = new SteamGridDBAdapter('fake-key');
      const result = await adapter.downloadGameImage(99999);
      expect(result).toBeNull();
    });

    it('downloads portrait image sorted by score', async () => {
      downloadAndStoreMock.mockResolvedValue('steam/440/game_grid.png');
      
      let callCount = 0;
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ data: { id: 100, name: 'TF2', types: ['game'], verified: true } }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [
              { id: 1, url: 'https://img/a.png', thumb: '', tags: [], author: { name: 'A', steam64: '1' }, width: 600, height: 900, score: 50, style: 'alternate', notes: null },
              { id: 2, url: 'https://img/b.png', thumb: '', tags: [], author: { name: 'B', steam64: '2' }, width: 600, height: 900, score: 100, style: 'alternate', notes: null },
            ],
          }),
        });
      }));
      
      const adapter = new SteamGridDBAdapter('fake-key');
      const result = await adapter.downloadGameImage(440);
      expect(result).toBe('steam/440/game_grid.png');
      expect(downloadAndStoreMock).toHaveBeenCalledWith(
        'https://img/b.png', 'steam', '440', 'game', 'grid'
      );
    });

    it('falls back to landscape image when no portrait available', async () => {
      downloadAndStoreMock.mockResolvedValue('steam/440/game_grid.png');
      
      let callCount = 0;
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ data: { id: 100, name: 'TF2', types: ['game'], verified: true } }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [
              { id: 1, url: 'https://img/wide.png', thumb: '', tags: [], author: { name: 'A', steam64: '1' }, width: 920, height: 430, score: 80, style: 'default', notes: null },
            ],
          }),
        });
      }));
      
      const adapter = new SteamGridDBAdapter('fake-key');
      const result = await adapter.downloadGameImage(440);
      expect(result).toBe('steam/440/game_grid.png');
    });

    it('returns null when no images available', async () => {
      let callCount = 0;
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ data: { id: 100, name: 'TF2', types: ['game'], verified: true } }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: [] }),
        });
      }));
      
      const adapter = new SteamGridDBAdapter('fake-key');
      const result = await adapter.downloadGameImage(440);
      expect(result).toBeNull();
    });

    it('returns null on exception during download', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
      const adapter = new SteamGridDBAdapter('fake-key');
      const result = await adapter.downloadGameImage(440);
      expect(result).toBeNull();
    });

    it('prefers 600x900 portrait when scores are equal', async () => {
      downloadAndStoreMock.mockResolvedValue('steam/440/game_grid.png');

      let callCount = 0;
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ data: { id: 100, name: 'TF2', types: ['game'], verified: true } }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [
              { id: 1, url: 'https://img/large.png', thumb: '', tags: [], author: { name: 'A', steam64: '1' }, width: 800, height: 1200, score: 100, style: 'alternate', notes: null },
              { id: 2, url: 'https://img/ideal.png', thumb: '', tags: [], author: { name: 'B', steam64: '2' }, width: 600, height: 900, score: 100, style: 'alternate', notes: null },
            ],
          }),
        });
      }));

      const adapter = new SteamGridDBAdapter('fake-key');
      const result = await adapter.downloadGameImage(440);
      expect(result).toBe('steam/440/game_grid.png');
      // Should prefer the 600x900 image (id=2) over the larger one when scores are equal
      expect(downloadAndStoreMock).toHaveBeenCalledWith(
        'https://img/ideal.png', 'steam', '440', 'game', 'grid'
      );
    });

    it('prefers larger dimensions when scores are equal and neither is 600x900', async () => {
      downloadAndStoreMock.mockResolvedValue('steam/440/game_grid.png');

      let callCount = 0;
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ data: { id: 100, name: 'TF2', types: ['game'], verified: true } }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [
              { id: 1, url: 'https://img/small.png', thumb: '', tags: [], author: { name: 'A', steam64: '1' }, width: 400, height: 600, score: 80, style: 'alternate', notes: null },
              { id: 2, url: 'https://img/big.png', thumb: '', tags: [], author: { name: 'B', steam64: '2' }, width: 800, height: 1200, score: 80, style: 'alternate', notes: null },
            ],
          }),
        });
      }));

      const adapter = new SteamGridDBAdapter('fake-key');
      const result = await adapter.downloadGameImage(440);
      expect(result).toBe('steam/440/game_grid.png');
      // Should prefer the larger image (800x1200) over the smaller one when scores equal
      expect(downloadAndStoreMock).toHaveBeenCalledWith(
        'https://img/big.png', 'steam', '440', 'game', 'grid'
      );
    });
  });

  // --- downloadGameImageByName ---

  describe('downloadGameImageByName', () => {
    it('returns cached image when exists', async () => {
      checkLocalFileMock.mockReturnValue('xbox/id/game_grid.jpg');
      const adapter = new SteamGridDBAdapter('fake-key');
      const result = await adapter.downloadGameImageByName('Halo', 'xbox', 'id');
      expect(result).toBe('xbox/id/game_grid.jpg');
    });

    it('returns null when game not found by name', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      }));
      const adapter = new SteamGridDBAdapter('fake-key');
      const result = await adapter.downloadGameImageByName('NonexistentGame', 'xbox', 'id');
      expect(result).toBeNull();
    });

    it('downloads and returns image path on success', async () => {
      downloadAndStoreMock.mockResolvedValue('xbox/tid/game_grid.png');
      
      let callCount = 0;
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // searchGameByName
          return Promise.resolve({
            ok: true,
            json: async () => ({ data: [{ id: 50, name: 'Halo', types: ['game'], verified: true }] }),
          });
        }
        if (callCount === 2) {
          // getGridImages (alternate) - return portrait images
          return Promise.resolve({
            ok: true,
            json: async () => ({
              data: [
                { id: 1, url: 'https://img/halo.png', thumb: '', tags: [], author: { name: 'A', steam64: '1' }, width: 600, height: 900, score: 90, style: 'alternate', notes: null },
              ],
            }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
      }));
      
      const adapter = new SteamGridDBAdapter('fake-key');
      const result = await adapter.downloadGameImageByName('Halo', 'xbox', 'tid');
      expect(result).toBe('xbox/tid/game_grid.png');
    });

    it('falls back to original name when normalized name yields no result', async () => {
      
      let callCount = 0;
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
        callCount++;
        // First searchGameByName (normalized) returns nothing
        if (callCount === 1) {
          return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
        }
        // Second searchGameByName (original) also returns nothing
        return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
      }));
      
      const adapter = new SteamGridDBAdapter('fake-key');
      const result = await adapter.downloadGameImageByName('SplinterCellConviction', 'xbox', 'tid');
      expect(result).toBeNull();
    });

    it('returns null on exception', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));
      
      const adapter = new SteamGridDBAdapter('fake-key');
      const result = await adapter.downloadGameImageByName('Game', 'xbox', 'tid');
      expect(result).toBeNull();
    });
  });

  // --- downloadGameImages (batch) ---

  describe('downloadGameImages', () => {
    it('returns map with results for all appIds', async () => {
      existsSyncMock.mockReturnValue(true);
      readdirSyncMock.mockReturnValue(['game_grid.jpg'] as any);
      
      const adapter = new SteamGridDBAdapter('fake-key');
      const results = await adapter.downloadGameImages([10], 1);
      expect(results.size).toBe(1);
      expect(results.get(10)).toContain('game_grid.jpg');
    });
  });
});
