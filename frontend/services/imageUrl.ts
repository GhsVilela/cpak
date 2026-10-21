/**
 * Image URLs for game artwork.
 *
 * In production the artwork is served by the backend under `/api/icons/<path>`.
 * In demo mode the paths already point at an absolute URL (or a data URL), so
 * they must be used as-is — the demo is a static export with no backend, and
 * `<img>` requests are not intercepted by the fetch mock.
 */
export function getImageUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:')) return path;
  return `/api/icons/${path}`;
}

function svgPlaceholder(text: string, width = 460, height = 215): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#1f2937"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#9ca3af" font-size="14">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Fallback for artwork that fails to load (e.g. the placeholder service is
 * unreachable): swap in a generated placeholder instead of a broken image.
 */
export function handleImageError(
  event: { currentTarget: HTMLImageElement },
  label?: string
): void {
  const img = event.currentTarget;
  if (img.dataset.fallbackApplied === 'true') return;
  img.dataset.fallbackApplied = 'true';
  img.src = svgPlaceholder(label ?? '');
}
