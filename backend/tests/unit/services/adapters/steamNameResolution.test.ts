import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../src/services/rateLimiter.js', () => ({
  rateLimiter: {
    executeWithRetry: vi.fn((_platform: string, fn: () => any) => fn()),
  },
}));

vi.mock('../../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { SteamAdapter } from '../../../../src/services/adapters/steam.js';

function mockResponse({
  ok = true,
  status = 200,
  json,
  text,
  headers,
}: {
  ok?: boolean;
  status?: number;
  json?: any;
  text?: string;
  headers?: Record<string, string>;
}) {
  return {
    ok,
    status,
    headers: {
      get: (name: string) => headers?.[name.toLowerCase()] ?? null,
    },
    json: async () => json ?? {},
    text: async () => text ?? '',
  } as any;
}

function stubFetch(handler: (url: string) => any) {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => handler(String(url)));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('SteamAdapter name resolution', () => {
  let adapter: SteamAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new SteamAdapter('fake-api-key');
  });

  it('falls back to the Steam Community page when the store has no app', async () => {
    stubFetch((url) => {
      if (url.includes('store.steampowered.com/api/appdetails')) {
        return mockResponse({ json: { '107900': { success: false } } });
      }
      if (url.includes('steamcommunity.com/app/107900')) {
        return mockResponse({ text: '<title>Steam Community :: War Inc. Battlezone</title>' });
      }
      return mockResponse({ ok: false, status: 404 });
    });

    await expect(adapter.resolveGameNameByAppId(107900)).resolves.toBe('War Inc. Battlezone');
  });

  it('retries Steam Community requests when rate-limited', async () => {
    let communityCalls = 0;
    stubFetch((url) => {
      if (url.includes('store.steampowered.com/api/appdetails')) {
        return mockResponse({ json: { '96300': { success: false } } });
      }
      if (url.includes('steamcommunity.com/app/96300')) {
        communityCalls++;
        if (communityCalls < 3) {
          return mockResponse({ ok: false, status: 429 });
        }
        return mockResponse({ text: '<title>Steam Community :: Ravaged Zombie Apocalypse</title>' });
      }
      return mockResponse({ ok: false, status: 404 });
    });

    await expect(adapter.resolveGameNameByAppId(96300)).resolves.toBe('Ravaged Zombie Apocalypse');
    expect(communityCalls).toBe(3);
  });

  it('falls back to SteamCMD when Community is unavailable', async () => {
    stubFetch((url) => {
      if (url.includes('store.steampowered.com/api/appdetails')) {
        return mockResponse({ json: { '388120': { success: false } } });
      }
      if (url.includes('steamcommunity.com/app/388120')) {
        return mockResponse({ text: '<title>Steam Community :: Error</title>' });
      }
      if (url.includes('api.steamcmd.net/v1/info/388120')) {
        return mockResponse({
          json: {
            data: {
              '388120': { common: { name: 'Spakoyno: Back To USSR 2.0' } },
            },
          },
        });
      }
      return mockResponse({ ok: false, status: 404 });
    });

    await expect(adapter.resolveGameNameByAppId(388120)).resolves.toBe('Spakoyno: Back To USSR 2.0');
  });

  it('falls back to the legacy achievement schema when other sources fail', async () => {
    stubFetch((url) => {
      if (url.includes('store.steampowered.com/api/appdetails')) {
        return mockResponse({ json: { '493730': { success: false } } });
      }
      if (url.includes('steamcommunity.com/app/493730')) {
        return mockResponse({ text: '<title>Welcome to Steam</title>' });
      }
      if (url.includes('api.steamcmd.net/v1/info/493730')) {
        return mockResponse({ json: { data: { '493730': {} } } });
      }
      if (url.includes('GetSchemaForGame')) {
        return mockResponse({ json: { game: { gameName: 'HardCube' } } });
      }
      return mockResponse({ ok: false, status: 404 });
    });

    await expect(adapter.resolveGameNameByAppId(493730)).resolves.toBe('HardCube');
  });

  it('returns null when no source can resolve the name', async () => {
    stubFetch(() => mockResponse({ ok: false, status: 404 }));

    await expect(adapter.resolveGameNameByAppId(449440)).resolves.toBeNull();
  });

  it('decodes HTML entities in Community titles', async () => {
    stubFetch((url) => {
      if (url.includes('store.steampowered.com/api/appdetails')) {
        return mockResponse({ json: { '123': { success: false } } });
      }
      if (url.includes('steamcommunity.com/app/123')) {
        return mockResponse({ text: '<title>Steam Community :: Tom &amp; Jerry</title>' });
      }
      return mockResponse({ ok: false, status: 404 });
    });

    await expect(adapter.resolveGameNameByAppId(123)).resolves.toBe('Tom & Jerry');
  });

  it('rejects placeholder names from the schema', async () => {
    stubFetch((url) => {
      if (url.includes('store.steampowered.com/api/appdetails')) {
        return mockResponse({ json: { '456': { success: false } } });
      }
      if (url.includes('steamcommunity.com/app/456')) {
        return mockResponse({ text: '<title>Welcome to Steam</title>' });
      }
      if (url.includes('api.steamcmd.net/v1/info/456')) {
        return mockResponse({ json: { data: { '456': {} } } });
      }
      if (url.includes('GetSchemaForGame')) {
        return mockResponse({ json: { game: { gameName: 'test app' } } });
      }
      return mockResponse({ ok: false, status: 404 });
    });

    await expect(adapter.resolveGameNameByAppId(456)).resolves.toBeNull();
  });
});
