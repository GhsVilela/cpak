/**
 * Returns true when `url` points at a platform library page rather than a
 * nested route such as a game detail page.
 *
 * The app runs with `trailingSlash: true`, so both `/xbox` and `/xbox/` are
 * valid depending on where Next.js normalises the current location.
 */
export function isPlatformListUrl(
  url: string | null | undefined,
  platform: string,
): url is string {
  if (!url) return false;
  const base = `/${platform}`;
  return (
    url === base ||
    url === `${base}/` ||
    url.startsWith(`${base}?`) ||
    url.startsWith(`${base}/?`)
  );
}

/** Current list URL (path + query), or undefined when not on a library page. */
export function getCurrentListReturnTo(platform: string): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const returnTo = `${window.location.pathname}${window.location.search}`;
  return isPlatformListUrl(returnTo, platform) ? returnTo : undefined;
}
