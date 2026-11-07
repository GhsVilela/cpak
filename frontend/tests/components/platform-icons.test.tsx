import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import TrophyIcon from '../../components/TrophyIcon';

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
