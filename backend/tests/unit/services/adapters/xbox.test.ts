import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { XboxAdapter } from '../../../../src/services/adapters/xbox.js';
import { XSAPIClient } from '@xboxreplay/xboxlive-auth';

// ---------------------------------------------------------------------------
// Mock @xboxreplay/xboxlive-auth
// vi.mock is hoisted, so factory must not reference external variables
// ---------------------------------------------------------------------------

vi.mock('@xboxreplay/xboxlive-auth', () => ({
  live: {
    getAuthorizeUrl: vi.fn().mockReturnValue(
      'https://login.live.com/oauth20_authorize.srf?client_id=test&scope=XboxLive.signin+XboxLive.offline_access&response_type=code&redirect_uri=http%3A%2F%2Flocalhost%2Fcallback',
    ),
    exchangeCodeForAccessToken: vi.fn().mockResolvedValue({
      token_type: 'bearer',
      expires_in: 3600,
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      scope: 'XboxLive.signin XboxLive.offline_access',
      user_id: 'mock-user-id',
    }),
    refreshAccessToken: vi.fn().mockResolvedValue({
      token_type: 'bearer',
      expires_in: 3600,
      access_token: 'mock-refreshed-access-token',
      refresh_token: 'mock-new-refresh-token',
      scope: 'XboxLive.signin XboxLive.offline_access',
      user_id: 'mock-user-id',
    }),
  },
  xnet: {
    exchangeRpsTicketForUserToken: vi.fn().mockResolvedValue({
      IssueInstant: '2025-01-01T00:00:00.0000000Z',
      NotAfter: '2025-01-02T00:00:00.0000000Z',
      Token: 'mock-user-token',
      DisplayClaims: { xui: [{ uhs: 'mock-uhs' }] },
    }),
    exchangeTokenForXSTSToken: vi.fn().mockResolvedValue({
      IssueInstant: '2025-01-01T00:00:00.0000000Z',
      NotAfter: '2025-01-02T00:00:00.0000000Z',
      Token: 'mock-xsts-token',
      DisplayClaims: { xui: [{ xid: 'mock-xuid-99999', uhs: 'mock-uhs' }] },
    }),
  },
  XSAPIClient: {
    get: vi.fn(),
  },
}));

vi.mock('../../../../src/services/rateLimiter.js', () => ({
  rateLimiter: {
    executeWithRetry: vi.fn().mockImplementation((_platform: string, fn: () => Promise<unknown>) => fn()),
  },
}));

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

// Convenience alias for the mocked XSAPIClient.get
const getXSAPI = () => vi.mocked(XSAPIClient.get);

describe('XboxAdapter', () => {
  let adapter: XboxAdapter;

  beforeEach(() => {
    adapter = new XboxAdapter();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // getAuthorizeUrl
  // -------------------------------------------------------------------------

  describe('getAuthorizeUrl', () => {
    it('returns a Microsoft OAuth authorization URL', () => {
      const url = adapter.getAuthorizeUrl('my-client-id', 'http://localhost/callback');
      expect(url).toContain('login.microsoftonline.com');
    });

    it('appends state parameter when provided', () => {
      const url = adapter.getAuthorizeUrl('my-client-id', 'http://localhost/callback', 'my-state');
      expect(url).toContain('state=my-state');
    });

    it('includes correct OAuth parameters in the URL', () => {
      const url = adapter.getAuthorizeUrl('real-client-id', 'http://localhost/cb');
      expect(url).toContain('client_id=real-client-id');
      expect(url).toContain('response_type=code');
      expect(url).toContain('XboxLive.signin');
      expect(url).toContain('redirect_uri=http');
    });
  });

  // -------------------------------------------------------------------------
  // getTitleHistory
  // -------------------------------------------------------------------------

  describe('getTitleHistory', () => {
    it('returns game titles and filters out non-game titles (apps, movies, etc.)', async () => {
      // v2 call (Xbox One / Series / PC games)
      getXSAPI().mockResolvedValueOnce({
        data: {
          titles: [
            {
              titleId: 'title-1',
              name: 'Halo Infinite',
              titleType: 'Game',
              currentGamerscore: 500,
              maxGamerscore: 1000,
              earnedAchievements: 30,
              platform: 'XboxSeries',
              displayImage: 'https://example.com/halo.jpg',
            },
            {
              titleId: 'title-2',
              name: 'Some App',
              titleType: 'App',
              currentGamerscore: 0,
              maxGamerscore: 0,
            },
          ],
          pagingInfo: { continuationToken: null },
        },
      });
      // v1 call (Xbox 360 legacy) — no 360 titles for this test
      getXSAPI().mockResolvedValueOnce({
        data: { titles: [], pagingInfo: {} },
      });
      // GS5 all-achievements scan (empty — no extra discovered titles)
      getXSAPI().mockResolvedValueOnce({
        data: { achievements: [], pagingInfo: {} },
      });
      // GS4 all-achievements scan (empty)
      getXSAPI().mockResolvedValueOnce({
        data: { achievements: [], pagingInfo: {} },
      });

      const titles = await adapter.getTitleHistory('user-xuid', 'xsts-token', 'user-hash');

      expect(titles).toHaveLength(1);
      expect(titles[0].titleId).toBe('title-1');
      expect(titles[0].name).toBe('Halo Infinite');
      expect(titles[0].devices).toContain('XboxSeries');
    });

    it('handles pagination via continuationToken', async () => {
      // v2 page 1: returns title-1 with a continuation token
      getXSAPI().mockResolvedValueOnce({
        data: {
          titles: [
            {
              titleId: 'title-1',
              name: 'Game 1',
              currentGamerscore: 50,
              maxGamerscore: 100,
              earnedAchievements: 5,
              platform: 'XboxOne',
            },
          ],
          pagingInfo: { continuationToken: 'next-page-token' },
        },
      });
      // v1 page 1: no 360 titles
      getXSAPI().mockResolvedValueOnce({
        data: { titles: [], pagingInfo: {} },
      });
      // GS5 all-achievements scan (empty)
      getXSAPI().mockResolvedValueOnce({
        data: { achievements: [], pagingInfo: {} },
      });
      // GS4 all-achievements scan (empty)
      getXSAPI().mockResolvedValueOnce({
        data: { achievements: [], pagingInfo: {} },
      });
      // v2 page 2: returns title-2, no more pages
      getXSAPI().mockResolvedValueOnce({
        data: {
          titles: [
            {
              titleId: 'title-2',
              name: 'Game 2',
              currentGamerscore: 30,
              maxGamerscore: 500,
              earnedAchievements: 3,
              platform: 'XboxOne',
            },
          ],
          pagingInfo: { continuationToken: null },
        },
      });

      const titles = await adapter.getTitleHistory('user-xuid', 'xsts-token', 'user-hash');

      expect(titles).toHaveLength(2);
      expect(titles[0].titleId).toBe('title-1');
      expect(titles[1].titleId).toBe('title-2');
      // 5 calls: v2 page1, v1 page1, gs5 scan, gs4 scan, v2 page2
      expect(getXSAPI()).toHaveBeenCalledTimes(5);
    });

    it('returns empty array when API returns no titles', async () => {
      // v2 history (empty)
      getXSAPI().mockResolvedValueOnce({
        data: { titles: [], pagingInfo: {} },
      });
      // v1 history (empty)
      getXSAPI().mockResolvedValueOnce({
        data: { titles: [], pagingInfo: {} },
      });
      // GS5 all-achievements scan (empty)
      getXSAPI().mockResolvedValueOnce({
        data: { achievements: [], pagingInfo: {} },
      });
      // GS4 all-achievements scan (empty)
      getXSAPI().mockResolvedValueOnce({
        data: { achievements: [], pagingInfo: {} },
      });

      const titles = await adapter.getTitleHistory('user-xuid', 'xsts-token', 'user-hash');
      expect(titles).toEqual([]);
    });

    it('throws error when API call fails (non-privacy errors)', async () => {
      // v2 history rejects — this causes Promise.all to reject
      getXSAPI().mockRejectedValueOnce(new Error('Network error'));
      // Provide mocks for v1, GS5, GS4 so their parallel calls complete
      // immediately (no sleeps / retries that would bleed into subsequent tests)
      getXSAPI().mockResolvedValueOnce({ data: { titles: [], pagingInfo: {} } });
      getXSAPI().mockResolvedValueOnce({ data: { achievements: [], pagingInfo: {} } });
      getXSAPI().mockResolvedValueOnce({ data: { achievements: [], pagingInfo: {} } });

      await expect(
        adapter.getTitleHistory('user-xuid', 'xsts-token', 'user-hash'),
      ).rejects.toThrow('Network error');
    });
  });

  // -------------------------------------------------------------------------
  // getAchievements
  // -------------------------------------------------------------------------

  describe('getAchievements', () => {
    it('returns mapped achievements for a title', async () => {
      getXSAPI().mockResolvedValueOnce({
        data: {
          achievements: [
            {
              id: 'ach-1',
              name: 'First Steps',
              description: 'Complete the tutorial',
              lockedDescription: 'Complete something to unlock this',
              progressState: 'Achieved',
              progression: { timeUnlocked: '2024-01-15T10:00:00.0000000Z' },
              mediaAssets: [{ name: 'icon', type: 'Icon', url: 'https://example.com/icon.png' }],
              isSecret: false,
              productId: 'product-1',
              achievementType: 'Persistent',
              participationType: 'Individual',
              rewards: [],
            },
            {
              id: 'ach-2',
              name: 'Secret Achievement',
              description: 'Hidden achievement',
              lockedDescription: 'Keep playing to find out',
              progressState: 'NotStarted',
              progression: { timeUnlocked: '0001-01-01T00:00:00.0000000Z' },
              mediaAssets: [],
              isSecret: true,
              productId: 'product-1',
              achievementType: 'Persistent',
              participationType: 'Individual',
              rewards: [],
            },
          ],
          pagingInfo: { continuationToken: null },
        },
      });

      const { achievements } = await adapter.getAchievements('user-xuid', 'title-1', 'xsts-token', 'user-hash');

      expect(achievements).toHaveLength(2);

      // First achievement — unlocked
      expect(achievements[0].achievementId).toBe('ach-1');
      expect(achievements[0].name).toBe('First Steps');
      expect(achievements[0].unlockedAt).toBeInstanceOf(Date);
      expect(achievements[0].iconUrl).toBe('https://example.com/icon.png');
      expect(achievements[0].isSecret).toBe(false);

      // Second achievement — locked secret
      expect(achievements[1].achievementId).toBe('ach-2');
      expect(achievements[1].unlockedAt).toBeUndefined();
      expect(achievements[1].isSecret).toBe(true);
    });

    it('handles pagination for achievements', async () => {
      getXSAPI().mockResolvedValueOnce({
        data: {
          achievements: [
            {
              id: 'ach-1',
              name: 'First',
              description: '',
              lockedDescription: '',
              progressState: 'NotStarted',
              progression: { timeUnlocked: '0001-01-01T00:00:00.0000000Z' },
              mediaAssets: [],
              isSecret: false,
              productId: 'p1',
              achievementType: 'Persistent',
              participationType: 'Individual',
              rewards: [],
            },
          ],
          pagingInfo: { continuationToken: 'next-achievements-token' },
        },
      });
      getXSAPI().mockResolvedValueOnce({
        data: {
          achievements: [
            {
              id: 'ach-2',
              name: 'Second',
              description: '',
              lockedDescription: '',
              progressState: 'Achieved',
              progression: { timeUnlocked: '2024-06-01T00:00:00.0000000Z' },
              mediaAssets: [],
              isSecret: false,
              productId: 'p1',
              achievementType: 'Persistent',
              participationType: 'Individual',
              rewards: [],
            },
          ],
          pagingInfo: { continuationToken: null },
        },
      });

      const { achievements } = await adapter.getAchievements('user-xuid', 'title-1', 'xsts-token', 'user-hash');
      expect(achievements).toHaveLength(2);
      expect(getXSAPI()).toHaveBeenCalledTimes(2);
    });

    it('returns empty array when title is privacy-blocked (403)', async () => {
      const privacyError = new Error('Forbidden');
      (privacyError as any).statusCode = 403;
      getXSAPI().mockRejectedValueOnce(privacyError);

      const result = await adapter.getAchievements('user-xuid', 'private-title', 'xsts-token', 'user-hash');
      expect(result.achievements).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // exchangeCodeForTokens
  // -------------------------------------------------------------------------

  describe('exchangeCodeForTokens', () => {
    afterAll(() => {
      vi.unstubAllGlobals();
    });

    it('exchanges auth code for a full token bundle', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: 'new-at', refresh_token: 'new-rt' }),
      }));

      const bundle = await adapter.exchangeCodeForTokens('auth-code', 'cid', 'csecret', 'http://localhost/cb');
      expect(bundle.accessToken).toBe('new-at');
      expect(bundle.refreshToken).toBe('new-rt');
      expect(bundle.xstsToken).toBe('mock-xsts-token');
      expect(bundle.xuid).toBe('mock-xuid-99999');
      expect(bundle.userHash).toBe('mock-uhs');
      expect(bundle.expiresAt).toBeInstanceOf(Date);
    });

    it('throws when token endpoint returns non-OK', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Bad request',
      }));

      await expect(
        adapter.exchangeCodeForTokens('bad-code', 'cid', 'csecret', 'http://localhost/cb'),
      ).rejects.toThrow('Token exchange failed (400)');
    });
  });

  // -------------------------------------------------------------------------
  // refreshXboxTokens
  // -------------------------------------------------------------------------

  describe('refreshXboxTokens', () => {
    afterAll(() => {
      vi.unstubAllGlobals();
    });

    it('refreshes tokens and returns a new bundle', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: 'refreshed-at', refresh_token: 'refreshed-rt' }),
      }));

      const bundle = await adapter.refreshXboxTokens('old-rt', 'cid', 'csecret');
      expect(bundle.accessToken).toBe('refreshed-at');
      expect(bundle.refreshToken).toBe('refreshed-rt');
      expect(bundle.xstsToken).toBe('mock-xsts-token');
    });

    it('throws when refresh endpoint returns non-OK', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Invalid grant',
      }));

      await expect(
        adapter.refreshXboxTokens('bad-rt', 'cid', 'csecret'),
      ).rejects.toThrow('Token refresh failed (401)');
    });
  });

  // -------------------------------------------------------------------------
  // getXboxProfile
  // -------------------------------------------------------------------------

  describe('getXboxProfile', () => {
    it('returns gamertag and avatar from profile API', async () => {
      getXSAPI().mockResolvedValueOnce({
        data: {
          profileUsers: [{
            id: 'xuid-123',
            settings: [
              { id: 'Gamertag', value: 'TestGamer' },
              { id: 'GameDisplayPicRaw', value: 'https://example.com/avatar.png' },
            ],
          }],
        },
      });

      const profile = await adapter.getXboxProfile('xuid-123', 'xsts', 'uhash');
      expect(profile.gamertag).toBe('TestGamer');
      expect(profile.avatarUrl).toBe('https://example.com/avatar.png');
      expect(profile.xuid).toBe('xuid-123');
    });

    it('throws when no profile data is returned', async () => {
      getXSAPI().mockResolvedValueOnce({ data: { profileUsers: [] } });

      await expect(
        adapter.getXboxProfile('xuid', 'xsts', 'uhash'),
      ).rejects.toThrow('No profile data returned');
    });
  });

  // -------------------------------------------------------------------------
  // String normalisation
  // -------------------------------------------------------------------------

  describe('stripPlatformSuffix', () => {
    it('removes (PC) suffix', () => {
      expect(adapter.stripPlatformSuffix('Game Name (PC)')).toBe('Game Name');
    });

    it('removes (Xbox One) suffix', () => {
      expect(adapter.stripPlatformSuffix('Game Name (Xbox One)')).toBe('Game Name');
    });

    it('removes (Windows) suffix', () => {
      expect(adapter.stripPlatformSuffix('Game Name (Windows)')).toBe('Game Name');
    });

    it('removes " for PC" suffix', () => {
      expect(adapter.stripPlatformSuffix('Game Name for PC')).toBe('Game Name');
    });

    it('removes " Windows 10 Edition" suffix', () => {
      expect(adapter.stripPlatformSuffix('Minecraft Windows 10 Edition')).toBe('Minecraft');
    });

    it('removes " Xbox One" suffix', () => {
      expect(adapter.stripPlatformSuffix('Forza Horizon 5 Xbox One')).toBe('Forza Horizon 5');
    });

    it('removes " PC Edition" suffix', () => {
      expect(adapter.stripPlatformSuffix('Some Game PC Edition')).toBe('Some Game');
    });

    it('leaves normal names unchanged', () => {
      expect(adapter.stripPlatformSuffix('Halo Infinite')).toBe('Halo Infinite');
    });
  });

  describe('expandAbbreviations', () => {
    it('expands GTA prefix', () => {
      expect(adapter.expandAbbreviations('GTA IV')).toBe('Grand Theft Auto IV');
    });

    it('expands MOH prefix', () => {
      expect(adapter.expandAbbreviations('MOH Airborne')).toBe('Medal of Honor: Airborne');
    });

    it('expands TC\'s prefix', () => {
      expect(adapter.expandAbbreviations("TC's Ghost Recon")).toBe("Tom Clancy's Ghost Recon");
    });

    it('expands FC prefix', () => {
      expect(adapter.expandAbbreviations('FC 5')).toBe('Far Cry 5');
    });

    it('expands :WaW suffix', () => {
      expect(adapter.expandAbbreviations('Call of Duty: WaW')).toBe('Call of Duty: World at War');
    });

    it('splits CamelCase', () => {
      expect(adapter.expandAbbreviations('SplinterCell')).toBe('Splinter Cell');
    });

    it('returns undefined when no expansion applies', () => {
      expect(adapter.expandAbbreviations('Halo Infinite')).toBeUndefined();
    });
  });

  describe('sanitizeTitle', () => {
    it('removes trademark symbols', () => {
      expect(adapter.sanitizeTitle('HITMAN™')).toBe('HITMAN');
      expect(adapter.sanitizeTitle('Game®')).toBe('Game');
    });

    it('replaces control characters with spaces', () => {
      expect(adapter.sanitizeTitle('Rush: A Disney\u009EPixar Adventure')).toBe('Rush: A Disney Pixar Adventure');
    });

    it('collapses multiple spaces', () => {
      expect(adapter.sanitizeTitle('Game   Name')).toBe('Game Name');
    });

    it('trims whitespace', () => {
      expect(adapter.sanitizeTitle('  Game  ')).toBe('Game');
    });
  });

  describe('stripEditionSuffix', () => {
    it('removes Remastered suffix', () => {
      expect(adapter.stripEditionSuffix('Alan Wake Remastered')).toBe('Alan Wake');
    });

    it('removes Remaster suffix', () => {
      expect(adapter.stripEditionSuffix('XIII Remaster')).toBe('XIII');
    });

    it('removes Remake suffix', () => {
      expect(adapter.stripEditionSuffix('Dead Space Remake')).toBe('Dead Space');
    });

    it('leaves non-matching names unchanged', () => {
      expect(adapter.stripEditionSuffix('Halo Infinite')).toBe('Halo Infinite');
    });
  });

  describe('normalizeForSearch', () => {
    it('applies full pipeline', () => {
      expect(adapter.normalizeForSearch('GTA IV™ (PC)')).toBe('Grand Theft Auto IV');
    });

    it('handles names with no transformations needed', () => {
      expect(adapter.normalizeForSearch('Halo Infinite')).toBe('Halo Infinite');
    });

    it('strips remastered and platform from complex names', () => {
      expect(adapter.normalizeForSearch('Crysis Remastered Xbox One')).toBe('Crysis');
    });
  });

  // -------------------------------------------------------------------------
  // fetchEmeraldImageUrl
  // -------------------------------------------------------------------------

  describe('fetchEmeraldImageUrl', () => {
    afterAll(() => {
      vi.unstubAllGlobals();
    });

    it('returns undefined for empty productId', async () => {
      expect(await adapter.fetchEmeraldImageUrl('')).toBeUndefined();
    });

    it('returns undefined for UUID-format productId', async () => {
      expect(await adapter.fetchEmeraldImageUrl('d3270100-495e-44f5-ab77-d255362a3073')).toBeUndefined();
    });

    it('returns image URL from poster field', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          productSummaries: [{
            productId: '9NNN',
            title: 'Test Game',
            images: { poster: { url: 'https://store-images.s-microsoft.com/image/poster.jpg' } },
          }],
        }),
      }));

      const result = await adapter.fetchEmeraldImageUrl('9NNN');
      expect(result).toContain('store-images.s-microsoft.com');
      expect(result).toContain('w=600');
    });

    it('returns undefined when API returns non-OK', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => 'Not found',
      }));

      expect(await adapter.fetchEmeraldImageUrl('9NNN')).toBeUndefined();
    });

    it('returns undefined when no productSummaries in response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      }));

      expect(await adapter.fetchEmeraldImageUrl('9NNN')).toBeUndefined();
    });

    it('returns undefined on network error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));

      expect(await adapter.fetchEmeraldImageUrl('9NNN')).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // fetchWikipediaImageUrl
  // -------------------------------------------------------------------------

  describe('fetchWikipediaImageUrl', () => {
    afterAll(() => {
      vi.unstubAllGlobals();
    });

    it('returns image URL for a matched Wikipedia page', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          type: 'standard',
          title: 'Halo Infinite',
          originalimage: { source: 'https://upload.wikimedia.org/halo.jpg' },
        }),
      }));

      const result = await adapter.fetchWikipediaImageUrl('Halo Infinite');
      expect(result).toBe('https://upload.wikimedia.org/halo.jpg');
    });

    it('returns undefined when fetch fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

      expect(await adapter.fetchWikipediaImageUrl('Some Game')).toBeUndefined();
    });

    it('returns undefined when page is not of standard type', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ type: 'disambiguation', title: 'Test' }),
      }));

      // fetchWikipediaImageUrl retries with "(video game)" suffix on disambiguation
      // then returns undefined when both attempts are non-standard
      expect(await adapter.fetchWikipediaImageUrl('Test')).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // fetchPCGamingWikiImageUrl
  // -------------------------------------------------------------------------

  describe('fetchPCGamingWikiImageUrl', () => {
    afterAll(() => {
      vi.unstubAllGlobals();
    });

    it('returns image URL via 3-step MediaWiki flow', async () => {
      const mockFetch = vi.fn()
        // Step 1: search
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            query: { search: [{ title: 'Halo Infinite', pageid: 123 }] },
          }),
        })
        // Step 2: content (wikitext with cover field)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            query: { pages: { '123': { revisions: [{ '*': '|cover = Halo_Infinite_cover.jpg\n|developer' }] } } },
          }),
        })
        // Step 3: imageinfo
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            query: { pages: { '1': { imageinfo: [{ url: 'https://images.pcgamingwiki.com/halo.jpg' }] } } },
          }),
        });
      vi.stubGlobal('fetch', mockFetch);

      const result = await adapter.fetchPCGamingWikiImageUrl('Halo Infinite');
      expect(result).toBe('https://images.pcgamingwiki.com/halo.jpg');
    });

    it('returns undefined when search returns no results', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ query: { search: [] } }),
      }));

      expect(await adapter.fetchPCGamingWikiImageUrl('Unknown Game')).toBeUndefined();
    });

    it('returns undefined on network error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Timeout')));

      expect(await adapter.fetchPCGamingWikiImageUrl('Test')).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // getTitleHubDevices
  // -------------------------------------------------------------------------

  describe('getTitleHubDevices', () => {
    it('returns empty map when API returns no titles', async () => {
      getXSAPI().mockResolvedValue({ data: { titles: [] } } as any);

      const result = await adapter.getTitleHubDevices('xuid', 'token', 'hash');
      expect(result.size).toBe(0);
    });

    it('returns empty map when API returns undefined data', async () => {
      getXSAPI().mockResolvedValue({ data: undefined } as any);

      const result = await adapter.getTitleHubDevices('xuid', 'token', 'hash');
      expect(result.size).toBe(0);
    });

    it('maps titleId to devices list', async () => {
      getXSAPI().mockResolvedValue({
        data: {
          titles: [
            { titleId: '12345', devices: ['PC', 'XboxSeries'] },
            { titleId: '67890', devices: ['XboxOne'] },
          ],
        },
      } as any);

      const result = await adapter.getTitleHubDevices('xuid', 'token', 'hash');
      expect(result.size).toBe(2);
      expect(result.get('12345')).toEqual(['PC', 'XboxSeries']);
      expect(result.get('67890')).toEqual(['XboxOne']);
    });

    it('skips titles with no devices', async () => {
      getXSAPI().mockResolvedValue({
        data: {
          titles: [
            { titleId: '111', devices: ['PC'] },
            { titleId: '222', devices: [] },
            { titleId: '333' },
          ],
        },
      } as any);

      const result = await adapter.getTitleHubDevices('xuid', 'token', 'hash');
      expect(result.size).toBe(1);
      expect(result.has('111')).toBe(true);
    });

    it('handles pagination with continuationToken', async () => {
      getXSAPI()
        .mockResolvedValueOnce({
          data: {
            titles: [{ titleId: '1', devices: ['PC'] }],
            pagingInfo: { continuationToken: 'page2' },
          },
        } as any)
        .mockResolvedValueOnce({
          data: {
            titles: [{ titleId: '2', devices: ['XboxOne'] }],
            pagingInfo: {},
          },
        } as any);

      const result = await adapter.getTitleHubDevices('xuid', 'token', 'hash');
      expect(result.size).toBe(2);
    });

    it('returns empty map when API throws error', async () => {
      getXSAPI().mockRejectedValue(new Error('API error'));

      const result = await adapter.getTitleHubDevices('xuid', 'token', 'hash');
      expect(result.size).toBe(0);
    });
  });
});
