import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import MythicIcon from '../../components/MythicIcon';
import TrophyIcon from '../../components/TrophyIcon';

describe('MythicIcon', () => {
  it('fills the badge with green when the Mythic is earned', () => {
    const { container } = render(<MythicIcon />);
    const star = container.querySelector('svg path');
    expect(star).not.toBeNull();
    expect(star!.getAttribute('fill')).toContain('url(#');
    expect(star!.getAttribute('stroke')).toBe('#7fba00');
  });

  it('draws only a green outline when the Mythic is locked', () => {
    const { container } = render(<MythicIcon muted />);
    const star = container.querySelector('svg path');
    expect(star).not.toBeNull();
    expect(star!.getAttribute('fill')).toBe('none');
    expect(star!.getAttribute('stroke')).toBe('#7fba00');
  });
});

describe('TrophyIcon', () => {
  it('fills the platinum trophy with the blue gradient when earned', () => {
    const { container } = render(<TrophyIcon grade="platinum" />);
    const cup = container.querySelector('svg path');
    expect(cup).not.toBeNull();
    expect(cup!.getAttribute('fill')).toContain('url(#');
  });

  it('draws only a blue outline when the platinum trophy is locked', () => {
    const { container } = render(<TrophyIcon grade="platinum" muted />);
    const cup = container.querySelector('svg path');
    expect(cup).not.toBeNull();
    expect(cup!.getAttribute('fill')).toBe('none');
    expect(cup!.getAttribute('stroke')).toBe('#7cc4ff');
  });
});
