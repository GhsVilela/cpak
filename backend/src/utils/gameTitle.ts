/**
 * Steam game titles that are placeholders rather than real names.
 */
export function isUnknownGameTitle(title?: string | null): boolean {
  if (!title) return true;

  const normalized = title.trim();
  if (!normalized) return true;

  return /^Unknown \(\d+\)$/i.test(normalized) || /^App \d+$/i.test(normalized);
}

/**
 * Pick the best title for a synced game.
 *
 * A newly resolved name wins, then a previously stored valid title. Only when
 * neither exists do we store an explicit placeholder so the UI still has
 * something to display.
 */
export function selectGameTitle(
  appId: string | number,
  incomingTitle?: string | null,
  previousTitle?: string | null,
): string {
  const incoming = incomingTitle?.trim();
  if (incoming && !isUnknownGameTitle(incoming)) return incoming;

  const previous = previousTitle?.trim();
  if (previous && !isUnknownGameTitle(previous)) return previous;

  return incoming || `Unknown (${appId})`;
}
