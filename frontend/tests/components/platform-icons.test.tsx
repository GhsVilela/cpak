import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import MythicIcon from '../../components/MythicIcon';
import TrophyIcon from '../../components/TrophyIcon';

describe('MythicIcon', () => {
  it('fills the badge with green when the Mythic is earned', () => {
    const { container } = render(<MythicIcon />);
    const star = container.querySelector('svg > path');
    expect(star).not.toBeNull();
    expect(star!.getAttribute('fill')).toContain('url(#');
    expect(star!.getAttribute('stroke')).toBe('#d9ff8a');
    expect(container.querySelector('[data-mythic-lock]')).toBeNull();
  });

  it('keeps the same filled badge in grayscale with a lock when the Mythic is locked', () => {
    const { container } = render(<MythicIcon muted />);
    const wreath = container.querySelector('svg g');
    const star = container.querySelector('svg > path');
    expect(wreath).not.toBeNull();
    expect(wreath!.getAttribute('fill')).toContain('url(#');
    expect(wreath!.getAttribute('stroke')).toBe('#6b7280');
    expect(star).not.toBeNull();
    expect(star!.getAttribute('fill')).toContain('url(#');
    expect(star!.getAttribute('stroke')).toBe('#d1d5db');
    expect(container.querySelector('[data-mythic-lock]')).not.toBeNull();
  });
});

describe('TrophyIcon', () => {
  it('fills the platinum trophy with the blue gradient when earned', () => {
    const { container } = render(<TrophyIcon grade="platinum" />);
    const cup = container.querySelector('svg path');
    expect(cup).not.toBeNull();
    expect(cup!.getAttribute('fill')).toContain('url(#');
  });

  it.each([
    ['bronze', '#e0a06a'],
    ['silver', '#f2f4f7'],
    ['gold', '#ffe27a'],
    ['platinum', '#7cc4ff'],
  ] as const)('draws only a %s outline when the trophy is locked', (grade, color) => {
    const { container } = render(<TrophyIcon grade={grade} muted />);
    const cup = container.querySelector('svg path');
    expect(cup).not.toBeNull();
    expect(cup!.getAttribute('fill')).toBe('none');
    expect(cup!.getAttribute('stroke')).toBe(color);
  });
});
