import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// fetchPCGamingWikiImageUrl and fetchWikipediaImageUrl use global `fetch`.
// We mock it per-test using vi.spyOn / globalThis.fetch override.

import {
  fetchPCGamingWikiImageUrl,
  fetchWikipediaImageUrl,
} from '../../../../src/services/adapters/gameImageSearch.js';

function mockFetch(responses: Array<{ ok: boolean; json?: object; text?: string }>) {
  let call = 0;
  vi.stubGlobal('fetch', vi.fn(async () => {
    const resp = responses[call] ?? responses[responses.length - 1];
    call++;
    return {
      ok: resp.ok,
      json: async () => resp.json ?? {},
      text: async () => resp.text ?? '',
    };
  }));
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// fetchPCGamingWikiImageUrl
// ---------------------------------------------------------------------------
describe('fetchPCGamingWikiImageUrl', () => {
  it('returns undefined when search returns no hits', async () => {
    mockFetch([{ ok: true, json: { query: { search: [] } } }]);
    const result = await fetchPCGamingWikiImageUrl('Unknown Game XYZ');
    expect(result).toBeUndefined();
  });

  it('returns undefined when no hit passes the confidence threshold', async () => {
    // Title "Doom" for needle "Halo Infinite" — will fail recall/f1 threshold
    mockFetch([{
      ok: true,
      json: {
        query: {
          search: [
            { title: 'Doom', pageid: 1 },
          ],
        },
      },
    }]);
    const result = await fetchPCGamingWikiImageUrl('Halo Infinite');
    // "Doom" shares no tokens with "Halo Infinite" → no confident match
    expect(result).toBeUndefined();
  });

  it('returns undefined when content fetch is not ok', async () => {
    mockFetch([
      // First call: search returns matching hit
      {
        ok: true,
        json: {
          query: { search: [{ title: 'Halo Infinite', pageid: 999 }] },
        },
      },
      // Second call: content fetch fails
      { ok: false },
    ]);
    const result = await fetchPCGamingWikiImageUrl('Halo Infinite');
    expect(result).toBeUndefined();
  });

  it('returns undefined when wikitext has no cover field', async () => {
    mockFetch([
      { ok: true, json: { query: { search: [{ title: 'Halo Infinite', pageid: 999 }] } } },
      { ok: true, json: { query: { pages: { '999': { revisions: [{ '*': '{{Infobox game\n|developer=343 Industries\n}}' }] } } } } },
    ]);
    const result = await fetchPCGamingWikiImageUrl('Halo Infinite');
    expect(result).toBeUndefined();
  });

  it('returns undefined when imageinfo fetch is not ok', async () => {
    mockFetch([
      { ok: true, json: { query: { search: [{ title: 'Halo Infinite', pageid: 999 }] } } },
      { ok: true, json: { query: { pages: { '999': { revisions: [{ '*': '| cover = Halo_Infinite_cover.jpg' }] } } } } },
      { ok: false },
    ]);
    const result = await fetchPCGamingWikiImageUrl('Halo Infinite');
    expect(result).toBeUndefined();
  });

  it('returns undefined when imageinfo has no URL', async () => {
    mockFetch([
      { ok: true, json: { query: { search: [{ title: 'Halo Infinite', pageid: 999 }] } } },
      { ok: true, json: { query: { pages: { '999': { revisions: [{ '*': '| cover = Halo_Infinite_cover.jpg' }] } } } } },
      { ok: true, json: { query: { pages: { '-1': { imageinfo: [{}] } } } } },
    ]);
    const result = await fetchPCGamingWikiImageUrl('Halo Infinite');
    expect(result).toBeUndefined();
  });

  it('returns image URL and upgrades http to https', async () => {
    mockFetch([
      { ok: true, json: { query: { search: [{ title: 'Halo Infinite', pageid: 999 }] } } },
      { ok: true, json: { query: { pages: { '999': { revisions: [{ '*': '| cover = Halo_Infinite_cover.jpg' }] } } } } },
      { ok: true, json: { query: { pages: { '1': { imageinfo: [{ url: 'http://images.pcgamingwiki.com/halo.jpg' }] } } } } },
    ]);
    const result = await fetchPCGamingWikiImageUrl('Halo Infinite');
    expect(result).toBe('https://images.pcgamingwiki.com/halo.jpg');
  });

  it('returns undefined when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    const result = await fetchPCGamingWikiImageUrl('Test Game');
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// fetchWikipediaImageUrl
// ---------------------------------------------------------------------------
describe('fetchWikipediaImageUrl', () => {
  it('returns undefined when all slug variants return non-ok', async () => {
    mockFetch([{ ok: false }, { ok: false }]);
    const result = await fetchWikipediaImageUrl('Nonexistent XYZ Game');
    expect(result).toBeUndefined();
  });

  it('returns image URL when summary contains originalimage', async () => {
    mockFetch([{
      ok: true,
      json: {
        type: 'standard',
        title: 'Halo Infinite',
        originalimage: { source: 'https://upload.wikimedia.org/halo.jpg' },
      },
    }]);
    const result = await fetchWikipediaImageUrl('Halo Infinite');
    expect(result).toBe('https://upload.wikimedia.org/halo.jpg');
  });

  it('returns undefined when article type is not standard', async () => {
    mockFetch([
      { ok: true, json: { type: 'disambiguation', title: 'Doom' } },
      { ok: true, json: { type: 'disambiguation', title: 'Doom (series)' } },
    ]);
    // Falls through all slug variants with non-standard type, then tries search API
    mockFetch([
      { ok: true, json: { type: 'disambiguation', title: 'Doom' } },
      { ok: true, json: { type: 'disambiguation', title: 'Doom (series)' } },
      // Search API: no hits matching filter
      { ok: true, json: { query: { search: [] } } },
    ]);
    const result = await fetchWikipediaImageUrl('Doom');
    expect(result).toBeUndefined();
  });

  it('returns image via search API fallback when found', async () => {
    // Slug variants fail (non-ok), then search API finds a match
    mockFetch([
      { ok: false }, // Slug variant 1 fail
      { ok: false }, // Slug variant 2 fail
      // Search API returns one video game hit
      {
        ok: true,
        json: {
          query: {
            search: [{ title: 'Halo Infinite (video game)' }],
          },
        },
      },
      // Summary for that hit
      {
        ok: true,
        json: {
          type: 'standard',
          title: 'Halo Infinite (video game)',
          originalimage: { source: 'https://upload.wikimedia.org/halo_search.jpg' },
        },
      },
    ]);
    const result = await fetchWikipediaImageUrl('Halo Infinite');
    expect(result).toBe('https://upload.wikimedia.org/halo_search.jpg');
  });

  it('returns undefined when relevance check fails for article', async () => {
    // Return an article that has title but article title shares no tokens with game name
    mockFetch([{
      ok: true,
      json: {
        type: 'standard',
        title: 'Completely Unrelated Article About Cooking',
        originalimage: { source: 'https://upload.wikimedia.org/cooking.jpg' },
      },
    },
    // Second slug variant also returns unrelated
    {
      ok: true,
      json: {
        type: 'standard',
        title: 'Another Unrelated Article',
        originalimage: { source: 'https://upload.wikimedia.org/irrel.jpg' },
      },
    },
    // Search API fallback: no hits
    { ok: true, json: { query: { search: [] } } },
    ]);
    const result = await fetchWikipediaImageUrl('Halo Infinite');
    expect(result).toBeUndefined();
  });
});
