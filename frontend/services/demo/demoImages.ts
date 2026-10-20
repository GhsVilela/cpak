export function getPlaceholderCover(seed: string, width = 460, height = 215): string {
  // Use picsum for generic photos (no copyrighted game art) with stable seeds
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${width}/${height}`;
}

export function getPlaceholderIcon(seed: string, size = 64): string {
  return `https://picsum.photos/seed/${encodeURIComponent(seed + '-icon')}/${size}/${size}`;
}

export function getPlaceholderHero(seed: string, width = 1920, height = 600): string {
  return `https://picsum.photos/seed/${encodeURIComponent(seed + '-hero')}/${width}/${height}`;
}

export function getSvgPlaceholder(text: string, width = 460, height = 215, bg = '#1f2937', fg = '#9ca3af'): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${bg}"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="${fg}" font-size="14">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
