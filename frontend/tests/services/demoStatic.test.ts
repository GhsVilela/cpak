import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getImageUrl } from '../../services/imageUrl';
import { demoGames, demoProfiles } from '../../services/demo/demoData';

describe('getImageUrl', () => {
  it('keeps absolute urls as-is (demo mode)', () => {
    expect(getImageUrl('https://picsum.photos/seed/x/460/215')).toBe(
      'https://picsum.photos/seed/x/460/215'
    );
    expect(getImageUrl('//cdn.example.com/a.png')).toBe('//cdn.example.com/a.png');
    expect(getImageUrl('data:image/svg+xml;base64,AAA')).toBe(
      'data:image/svg+xml;base64,AAA'
    );
  });

  it('prefixes relative paths with the icons endpoint', () => {
    expect(getImageUrl('steam/730/header.jpg')).toBe('/api/icons/steam/730/header.jpg');
  });

  it('returns undefined for missing paths', () => {
    expect(getImageUrl(undefined)).toBeUndefined();
    expect(getImageUrl(null)).toBeUndefined();
    expect(getImageUrl('')).toBeUndefined();
  });
});

describe('demo static params', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // The game tiles link to /<platform>/game/<gameId>, so the prerendered
  // pages have to use the same id — otherwise the static export 404s.
  const linkedIds = demoGames.map((game) => game.gameId);

  async function staticParams(platform: 'steam' | 'xbox' | 'playstation') {
    const loaders = {
      steam: () => import('../../app/steam/game/[id]/page'),
      xbox: () => import('../../app/xbox/game/[id]/page'),
      playstation: () => import('../../app/playstation/game/[id]/page'),
    };
    const mod = await loaders[platform]();
    return (await mod.generateStaticParams()) as Array<{ id: string }>;
  }

  it('uses gameId (not _id) for the prerendered game pages', async () => {
    for (const platform of ['steam', 'xbox', 'playstation'] as const) {
      const params = await staticParams(platform);
      expect(params.length).toBeGreaterThan(0);
      for (const param of params) {
        expect(linkedIds).toContain(param.id);
        expect(demoGames.find((g) => g.gameId === param.id)?._id).not.toBe(param.id);
      }
    }
  });

  it('prerenders every demo game exactly once', async () => {
    const ids = [
      ...(await staticParams('steam')),
      ...(await staticParams('xbox')),
      ...(await staticParams('playstation')),
    ].map((p) => p.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(demoGames.length);
  });

  it('prerenders every demo profile edit page', async () => {
    const mod = await import('../../app/settings/edit/[id]/page');
    const params = (await mod.generateStaticParams()) as Array<{ id: string }>;
    expect(params.map((p) => p.id).sort()).toEqual(
      demoProfiles.map((p) => p._id).sort()
    );
  });
});
