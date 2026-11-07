import { describe, it, expect } from 'vitest';
import { isPlatformListUrl } from '../../lib/navigation';

describe('isPlatformListUrl', () => {
  it('accepts the platform list URL with and without a trailing slash', () => {
    expect(isPlatformListUrl('/xbox', 'xbox')).toBe(true);
    expect(isPlatformListUrl('/xbox/', 'xbox')).toBe(true);
    expect(isPlatformListUrl('/xbox?profileId=p1&page=2', 'xbox')).toBe(true);
    expect(isPlatformListUrl('/xbox/?profileId=p1&page=2', 'xbox')).toBe(true);
  });

  it('rejects game pages and other platforms', () => {
    expect(isPlatformListUrl('/xbox/game/123?profileId=p1', 'xbox')).toBe(false);
    expect(isPlatformListUrl('/steam?profileId=p1', 'xbox')).toBe(false);
    expect(isPlatformListUrl(null, 'xbox')).toBe(false);
  });
});
