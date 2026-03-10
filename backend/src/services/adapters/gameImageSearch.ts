/**
 * Shared game-image lookup utilities.
 *
 * These functions are platform-agnostic: they accept a pre-cleaned game name and
 * query public APIs (PCGamingWiki, Wikipedia) for cover-art images.
 *
 * Callers are responsible for any platform-specific preprocessing (e.g. stripping
 * "Xbox One", edition suffixes, or expanding abbreviations) before passing the
 * name here.
 */

import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// PCGamingWiki
// ---------------------------------------------------------------------------

/**
 * Fetch a cover-art URL from the PCGamingWiki MediaWiki API.
 * Completely public — no API key required.
 *
 * The function resolves the best-matching article title using a scored F1 match
 * and then extracts the `cover` field from the infobox wikitext.
 *
 * NOTE: The CDN backing PCGamingWiki blocks Node.js TLS fingerprints via
 * Cloudflare. Callers should use `imageStorage.downloadAndStoreViaWget` (not
 * `downloadAndStore`) when storing the returned URL.
 */
export async function fetchPCGamingWikiImageUrl(gameName: string): Promise<string | undefined> {
  // Minimal sanitization: strip trademark symbols and control chars.
  gameName = gameName.replace(/[™®©]/g, '').replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim();

  const BASE = 'https://www.pcgamingwiki.com/w/api.php';
  const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    Accept: 'application/json',
  };
  const TIMEOUT = 10_000;
  const RECALL_THRESHOLD = 0.8;
  const F1_THRESHOLD = 0.7;
  const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'or', 'de']);

  // CamelCase split so "DisneyPixar" → ["disney", "pixar"]
  const tokenise = (s: string) =>
    s.replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);

  const needle = gameName;
  const needleAllTokens = tokenise(needle);
  const needleNumbers = needleAllTokens.filter((t) => /^\d+$/.test(t));
  const needleNumberSet = new Set(needleNumbers);
  const needleTokens = needleAllTokens.filter((t) => !STOPWORDS.has(t) && t.length >= 2);

  try {
    const searchUrl = `${BASE}?action=query&list=search&srsearch=${encodeURIComponent(needle)}&srlimit=5&format=json`;
    const searchRes = await fetch(searchUrl, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT) });
    if (!searchRes.ok) return undefined;
    const searchJson = await searchRes.json() as {
      query?: { search?: Array<{ title: string; pageid: number }> };
    };
    const hits = searchJson.query?.search ?? [];
    if (hits.length === 0) return undefined;

    // Score ALL hits and pick the best F1 match.
    // Strip parenthetical wiki disambiguators like "(2016)" or "(video game)"
    // before scoring — they inflate token counts.
    let bestHit: { title: string; pageid: number } | undefined;
    let bestF1 = -1;
    for (const hit of hits) {
      const cleanTitle = hit.title.replace(/\s*\([^)]+\)\s*$/, '');
      const hitAllTokens = tokenise(cleanTitle);
      const hitSet = new Set(hitAllTokens);
      const hitNumbers = hitAllTokens.filter((t) => /^\d+$/.test(t));
      // Hard gate: every number in the needle must appear in the candidate.
      if (needleNumbers.some((n) => !hitSet.has(n))) continue;
      // Reverse hard gate: every number in the candidate must appear in the needle.
      if (hitNumbers.some((n) => !needleNumberSet.has(n))) continue;
      const hitMeaningful = hitAllTokens.filter((t) => !STOPWORDS.has(t) && t.length >= 2);
      const hitTokenSet = new Set(hitMeaningful);
      // First-word anchor: prevent "Doom & Destiny" matching needle "Destiny".
      if (needleTokens[0] && hitMeaningful[0] && needleTokens[0] !== hitMeaningful[0]) continue;
      const matchCount = needleTokens.filter((t) => hitTokenSet.has(t)).length;
      const recall = needleTokens.length > 0 ? matchCount / needleTokens.length : 1;
      const precision = hitTokenSet.size > 0 ? matchCount / hitTokenSet.size : 0;
      const f1 = (recall + precision) > 0 ? 2 * recall * precision / (recall + precision) : 0;
      if (recall >= RECALL_THRESHOLD && f1 >= F1_THRESHOLD && f1 > bestF1) {
        bestF1 = f1;
        bestHit = hit;
      }
    }
    if (!bestHit) {
      logger.info({ gameName: needle, hits: hits.map((h) => h.title) }, '[PCGW] No confident title match');
      return undefined;
    }
    logger.info({ gameName: needle, matchedTitle: bestHit.title }, '[PCGW] Title matched');

    const contentUrl = `${BASE}?action=query&pageids=${bestHit.pageid}&prop=revisions&rvprop=content&rvsection=0&format=json`;
    const contentRes = await fetch(contentUrl, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT) });
    if (!contentRes.ok) return undefined;
    const contentJson = await contentRes.json() as {
      query?: { pages?: Record<string, { revisions?: Array<{ '*': string }> }> };
    };
    const wikitext = Object.values(contentJson.query?.pages ?? {})[0]?.revisions?.[0]?.['*'] ?? '';
    const coverMatch = wikitext.match(/\|\s*cover\s*=\s*([^\n|{}]+)/);
    if (!coverMatch) {
      logger.info({ gameName: needle, title: bestHit.title }, '[PCGW] No cover field in infobox');
      return undefined;
    }
    const coverFilename = coverMatch[1].trim();
    logger.info({ gameName: needle, title: bestHit.title, coverFilename }, '[PCGW] Cover filename found');

    const fileTitle = `File:${coverFilename}`;
    const imageInfoUrl = `${BASE}?action=query&titles=${encodeURIComponent(fileTitle)}&prop=imageinfo&iiprop=url&format=json`;
    const imageInfoRes = await fetch(imageInfoUrl, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT) });
    if (!imageInfoRes.ok) return undefined;
    const imageInfoJson = await imageInfoRes.json() as {
      query?: { pages?: Record<string, { imageinfo?: Array<{ url?: string }> }> };
    };
    const rawImageUrl = Object.values(imageInfoJson.query?.pages ?? {})[0]?.imageinfo?.[0]?.url;
    if (!rawImageUrl) {
      logger.info({ gameName: needle, title: bestHit.title, coverFilename }, '[PCGW] No image URL in imageinfo');
      return undefined;
    }
    // imageinfo can return http:// — upgrade to https://.
    const imageUrl = rawImageUrl.replace(/^http:\/\//i, 'https://');
    logger.info({ gameName: needle, title: bestHit.title, url: imageUrl }, '[PCGW] Image URL found');
    return imageUrl;
  } catch (err) {
    logger.warn({ gameName: needle, err: String(err) }, '[PCGW] Lookup threw');
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Wikipedia
// ---------------------------------------------------------------------------

/**
 * Fetch a cover-art URL from the Wikipedia REST API.
 * Completely public — no API key required.
 *
 * Strategy:
 *  1. Build Wikipedia article slug variants from the game name (title-case,
 *     spaces → _, special chars encoded). "_(video_game)" suffix is tried first
 *     to bypass movie/show articles sharing a game title.
 *  2. Fetch /page/summary/{slug} for each variant. Accept "standard" type only.
 *  3. Apply an ≥80% token-recall relevance guard on the article title.
 *
 * Image priority: originalimage (full-res box art) → thumbnail.
 *
 * NOTE: The Wikimedia CDN blocks Node.js TLS fingerprints. Callers should use
 * `imageStorage.downloadAndStoreViaWget` when storing the returned URL.
 */
export async function fetchWikipediaImageUrl(gameName: string): Promise<string | undefined> {
  // Minimal sanitization: strip trademark/copyright symbols and control chars.
  gameName = gameName.replace(/[™®©]/g, '').replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim();

  /**
   * Small words kept lowercase in Wikipedia slugs (unless the first word).
   * Wikipedia titling convention: prepositions/articles stay lowercase.
   * e.g. "Gears_of_War_2" NOT "Gears_Of_War_2" (the latter 404s).
   */
  const SMALL_WORDS = new Set([
    'a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'for',
    'and', 'or', 'but', 'nor', 'de', 'la', 'le', 'el',
    'as', 'by', 'up', 'vs',
  ]);

  /** Build a Wikipedia slug from a game title. */
  const makeSlug = (name: string): string =>
    name
      .replace(/[™®©]/g, '')
      .trim()
      .split(/\s+/)
      .map((w, i) => {
        const lower = w.toLowerCase();
        const isAllCapsAbbrev = w.length > 1 && w === w.toUpperCase() && /^[A-Z]/.test(w);
        if (i === 0) return w.charAt(0).toUpperCase() + w.slice(1);
        if (SMALL_WORDS.has(lower) && !isAllCapsAbbrev) return lower;
        return w.charAt(0).toUpperCase() + w.slice(1);
      })
      .join('_')
      .replace(/:/g, '%3A')
      .replace(/[''\u2019]/g, '%27')
      .replace(/&/g, '%26')
      .replace(/\?/g, '%3F');

  /**
   * Fetch the Wikipedia summary for a slug and return the image URL and article
   * title if the page is a valid "standard" (non-disambiguation) article.
   */
  const fetchSummary = async (slug: string): Promise<{ imageUrl: string; title: string; description: string } | undefined> => {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`;
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'cpak/1.0 (game-image-lookup; contact via GitHub)',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) return undefined;
      const data = await res.json() as {
        type?: string;
        title?: string;
        description?: string;
        originalimage?: { source?: string };
        thumbnail?: { source?: string };
      };
      if (data.type !== 'standard') return undefined;
      const imageUrl = data.originalimage?.source ?? data.thumbnail?.source;
      if (!imageUrl) return undefined;
      return { imageUrl, title: data.title ?? '', description: data.description ?? '' };
    } catch {
      return undefined;
    }
  };

  /**
   * Build canonical Wikipedia slug variants ordered from most-specific to
   * least-specific. "_(video_game)" suffix is tried before the plain slug so
   * movies/shows sharing a game title are bypassed.
   */
  const buildSlugVariants = (name: string): string[] => {
    const variants: string[] = [];
    const seen = new Set<string>();

    const push = (s: string) => {
      if (!s) return;
      if (!seen.has(s)) { seen.add(s); variants.push(s); }
      if (!s.endsWith('_(video_game)')) {
        const vg = `${s}_(video_game)`;
        if (!seen.has(vg)) { seen.add(vg); variants.push(vg); }
      }
    };

    const primary = makeSlug(name);

    // _(video_game) comes BEFORE plain slug.
    push(`${primary}_(video_game)`);
    push(primary);

    // Subtitle only: text after first ':' (e.g. "Batman: Arkham City" → "Arkham City")
    const colonIdx = name.indexOf(':');
    if (colonIdx > 0) {
      const subtitle = name.slice(colonIdx + 1).trim();
      if (subtitle) push(makeSlug(subtitle));
    }

    // Drop a short leading token or possessive — e.g. "The Crew" stays, but
    // "TC's Ghost Recon" → try "Ghost Recon" as well.
    const words = name.split(/\s+/);
    if (words.length >= 2) {
      const first = words[0];
      const rest = words.slice(1).join(' ');
      if (first.length <= 3 || /['''\u2019]s$/i.test(first)) {
        push(makeSlug(rest));
      }
    }

    return variants;
  };

  const slugVariants = buildSlugVariants(gameName);
  logger.info({ gameName, slugVariants }, '[Wikipedia] Trying slug variants');

  // Tokens used for the relevance guard (article title must share ≥80% of them).
  const gameKeyTokens = gameName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !SMALL_WORDS.has(t));

  for (const slug of slugVariants) {
    const result = await fetchSummary(slug);
    if (!result) continue;

    // Reject articles whose Wikipedia short description indicates a film, TV show,
    // or other non-game media. This prevents movie poster images being used for
    // film tie-in games (e.g. "The Amazing Spider-Man") when the _(video_game)
    // slug fails and the lookup falls through to the movie article.
    const desc = result.description.toLowerCase();
    const looksLikeFilm = /\bfilm\b|\bmovie\b|\btelevision\b|\btv series\b|\banimated series\b/.test(desc);
    const looksLikeGame = /\bgame\b|\bvideo game\b/.test(desc);
    if (looksLikeFilm && !looksLikeGame) {
      logger.info({ gameName, slug, description: result.description }, '[Wikipedia] Skipping — article is a film/TV show, not a game');
      continue;
    }

    if (gameKeyTokens.length > 0) {
      const articleTokens = new Set(
        result.title.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean),
      );
      const matchCount = gameKeyTokens.filter((t) => articleTokens.has(t)).length;
      const recall = matchCount / gameKeyTokens.length;
      if (recall < 0.8) {
        logger.info({ gameName, slug, articleTitle: result.title, matchCount, total: gameKeyTokens.length }, '[Wikipedia] Article not relevant — skipping');
        continue;
      }
    }

    logger.info({ gameName, slug, articleTitle: result.title, url: result.imageUrl }, '[Wikipedia] Image found');
    return result.imageUrl;
  }

  // Slug-variant approach exhausted. Fall back to the Wikipedia search API
  // searching for "{gameName} video game". This handles year-qualified
  // disambiguation pages like "The_Amazing_Spider-Man_(2012_video_game)" that
  // have no plain "_(video_game)" redirect.
  try {
    const searchQuery = `${gameName} video game`;
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchQuery)}&srlimit=5&format=json&origin=*`;
    const searchRes = await fetch(searchUrl, {
      headers: { 'User-Agent': 'cpak/1.0 (game-image-lookup; contact via GitHub)', Accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    });
    if (searchRes.ok) {
      const searchJson = await searchRes.json() as {
        query?: { search?: Array<{ title: string }> };
      };
      const hits = searchJson.query?.search ?? [];
      logger.info({ gameName, hits: hits.map((h) => h.title) }, '[Wikipedia] Search API fallback results');

      for (const hit of hits) {
        // Only consider articles that are explicitly marked as video games in the title.
        if (!/video.?game/i.test(hit.title) && !/\(\d{4}.*game/i.test(hit.title)) continue;

        // Relevance guard: article title must share ≥80% of the game key tokens.
        if (gameKeyTokens.length > 0) {
          const articleTokens = new Set(
            hit.title.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean),
          );
          const matchCount = gameKeyTokens.filter((t) => articleTokens.has(t)).length;
          if (matchCount / gameKeyTokens.length < 0.8) continue;
        }

        const slug = hit.title.replace(/ /g, '_');
        const result = await fetchSummary(slug);
        if (!result) continue;

        logger.info({ gameName, slug, articleTitle: result.title, url: result.imageUrl }, '[Wikipedia] Image found via search API fallback');
        return result.imageUrl;
      }
    }
  } catch (err) {
    logger.warn({ gameName, err: String(err) }, '[Wikipedia] Search API fallback threw');
  }

  logger.info({ gameName }, '[Wikipedia] No image found after all slug variants and search fallback');
  return undefined;
}
