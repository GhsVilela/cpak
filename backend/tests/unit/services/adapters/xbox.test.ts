import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
      expect(url).toContain('login.live.com');
    });

    it('appends state parameter when provided', () => {
      const url = adapter.getAuthorizeUrl('my-client-id', 'http://localhost/callback', 'my-state');
      expect(url).toContain('state=my-state');
    });

    it('calls live.getAuthorizeUrl with correct arguments', async () => {
      const { live: mockLive } = await import('@xboxreplay/xboxlive-auth');
      adapter.getAuthorizeUrl('real-client-id', 'http://localhost/cb');
      expect(mockLive.getAuthorizeUrl).toHaveBeenCalledWith(
        'real-client-id',
        'XboxLive.signin XboxLive.offline_access',
        'code',
        'http://localhost/cb',
      );
    });
  });

  // -------------------------------------------------------------------------
  // getTitleHistory
  // -------------------------------------------------------------------------

  describe('getTitleHistory', () => {
    it('returns titles with achievements, filtering out titles with 0 achievements', async () => {
      getXSAPI().mockResolvedValueOnce({
        data: {
          titles: [
            {
              titleId: 'title-1',
              name: 'Halo Infinite',
              currentGamerscore: 500,
              maxGamerscore: 1000,
              achievement: { currentAchievements: 30, totalAchievements: 100 },
              devices: ['XboxSeries', 'PC'],
              displayImage: 'https://example.com/halo.jpg',
            },
            {
              titleId: 'title-2',
              name: 'No Achievements App',
              achievement: { currentAchievements: 0, totalAchievements: 0 },
              devices: ['XboxSeries'],
            },
          ],
          pagingInfo: { continuationToken: null },
        },
      });

      const titles = await adapter.getTitleHistory('user-xuid', 'xsts-token', 'user-hash');

      expect(titles).toHaveLength(1);
      expect(titles[0].titleId).toBe('title-1');
      expect(titles[0].name).toBe('Halo Infinite');
      expect(titles[0].devices).toEqual(['XboxSeries', 'PC']);
    });

    it('handles pagination via continuationToken', async () => {
      // First page
      getXSAPI().mockResolvedValueOnce({
        data: {
          titles: [
            {
              titleId: 'title-1',
              name: 'Game 1',
              achievement: { currentAchievements: 5, totalAchievements: 10 },
              devices: ['XboxOne'],
            },
          ],
          pagingInfo: { continuationToken: 'next-page-token' },
        },
      });
      // Second page
      getXSAPI().mockResolvedValueOnce({
        data: {
          titles: [
            {
              titleId: 'title-2',
              name: 'Game 2',
              achievement: { currentAchievements: 3, totalAchievements: 50 },
              devices: ['Xbox360'],
            },
          ],
          pagingInfo: { continuationToken: null },
        },
      });

      const titles = await adapter.getTitleHistory('user-xuid', 'xsts-token', 'user-hash');

      expect(titles).toHaveLength(2);
      expect(titles[0].titleId).toBe('title-1');
      expect(titles[1].titleId).toBe('title-2');
      expect(getXSAPI()).toHaveBeenCalledTimes(2);
    });

    it('returns empty array when API returns no titles', async () => {
      getXSAPI().mockResolvedValueOnce({
        data: { titles: [], pagingInfo: {} },
      });

      const titles = await adapter.getTitleHistory('user-xuid', 'xsts-token', 'user-hash');
      expect(titles).toEqual([]);
    });

    it('throws error when API call fails (non-privacy errors)', async () => {
      getXSAPI().mockRejectedValueOnce(new Error('Network error'));

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

      const achievements = await adapter.getAchievements('user-xuid', 'title-1', 'xsts-token', 'user-hash');

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

      const achievements = await adapter.getAchievements('user-xuid', 'title-1', 'xsts-token', 'user-hash');
      expect(achievements).toHaveLength(2);
      expect(getXSAPI()).toHaveBeenCalledTimes(2);
    });

    it('returns empty array when title is privacy-blocked (403)', async () => {
      const privacyError = new Error('Forbidden');
      (privacyError as any).statusCode = 403;
      getXSAPI().mockRejectedValueOnce(privacyError);

      const achievements = await adapter.getAchievements('user-xuid', 'private-title', 'xsts-token', 'user-hash');
      expect(achievements).toEqual([]);
    });
  });
});
