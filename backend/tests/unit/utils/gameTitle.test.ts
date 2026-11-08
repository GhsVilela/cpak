import { describe, expect, it } from 'vitest';
import { isUnknownGameTitle, selectGameTitle } from '../../../src/utils/gameTitle.js';

describe('game title helpers', () => {
  it('detects placeholder titles', () => {
    expect(isUnknownGameTitle(null)).toBe(true);
    expect(isUnknownGameTitle('')).toBe(true);
    expect(isUnknownGameTitle('Unknown (107900)')).toBe(true);
    expect(isUnknownGameTitle('App 107900')).toBe(true);
    expect(isUnknownGameTitle('War Inc. Battlezone')).toBe(false);
  });

  it('prefers a newly resolved name', () => {
    expect(selectGameTitle('107900', 'War Inc. Battlezone', 'Unknown (107900)'))
      .toBe('War Inc. Battlezone');
  });

  it('preserves a previous valid title when the new name is missing', () => {
    expect(selectGameTitle('107900', '', 'War Inc. Battlezone'))
      .toBe('War Inc. Battlezone');
    expect(selectGameTitle('107900', 'Unknown (107900)', 'War Inc. Battlezone'))
      .toBe('War Inc. Battlezone');
  });

  it('falls back to an explicit placeholder when no valid title exists', () => {
    expect(selectGameTitle('107900', '', 'Unknown (107900)'))
      .toBe('Unknown (107900)');
  });
});
