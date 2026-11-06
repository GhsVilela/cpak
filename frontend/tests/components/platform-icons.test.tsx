import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import MythicIcon from '../../components/MythicIcon';
import PlatinumBadge from '../../components/PlatinumBadge';
import SteamCompletionIcon from '../../components/SteamCompletionIcon';
import TrophyIcon from '../../components/TrophyIcon';

describe('MythicIcon', () => {
  it('draws the circular Xbox logo with a white X when earned', () => {
    const { container } = render(<MythicIcon />);
    const emblem = container.querySelector('circle[data-mythic-emblem="true"]');
    expect(emblem).not.toBeNull();
    expect(emblem!.getAttribute('cx')).toBe('12');
    expect(emblem!.getAttribute('r')).toBe('11.7');
    expect(emblem!.getAttribute('fill')).toContain('url(#');
    expect(emblem!.getAttribute('stroke')).toBe('#2f5300');

    const x = container.querySelector('[data-mythic-x="true"]');
    expect(x).not.toBeNull();
    expect(x!.getAttribute('fill')).toBe('#ffffff');
    expect(x!.getAttribute('mask')).toContain('url(#');
    expect(container.querySelector('mask path')).not.toBeNull();
    expect(container.querySelector('[data-mythic-lock]')).toBeNull();
  });

  it('uses a grayscale version of the same logo when the Mythic is locked', () => {
    const { container } = render(<MythicIcon muted />);
    const emblem = container.querySelector('circle[data-mythic-emblem="true"]');
    expect(emblem).not.toBeNull();
    expect(emblem!.getAttribute('cx')).toBe('12');
    expect(emblem!.getAttribute('r')).toBe('11.7');
    expect(emblem!.getAttribute('fill')).toContain('url(#');
    expect(emblem!.getAttribute('stroke')).toBe('#6b7280');

    const x = container.querySelector('[data-mythic-x="true"]');
    expect(x).not.toBeNull();
    expect(x!.getAttribute('fill')).toBe('#f3f4f6');
    expect(x!.getAttribute('mask')).toContain('url(#');
    expect(container.querySelector('[data-mythic-lock]')).toBeNull();
  });
});

describe('PlatinumBadge', () => {
  it('wraps the platinum trophy in a glowing circular border when earned', () => {
    const { container, getByRole } = render(<PlatinumBadge />);
    expect(getByRole('img', { name: 'Platinum trophy earned' })).toBeInTheDocument();
    const badge = container.querySelector('span');
    expect(badge).not.toBeNull();
    expect(badge).toHaveClass('rounded-full');
    expect(badge).toHaveClass('border-[#7cc4ff]/70');
  });

  it('greys out the circular badge when the Platinum is locked', () => {
    const { container, getByRole } = render(<PlatinumBadge muted />);
    expect(
      getByRole('img', { name: 'Complete the base game to unlock the Platinum trophy' }),
    ).toBeInTheDocument();
    const badge = container.querySelector('span');
    expect(badge).not.toBeNull();
    expect(badge).toHaveClass('rounded-full');
    expect(badge).toHaveClass('border-gray-500/60');
  });
});

describe('SteamCompletionIcon', () => {
  it('renders the Steam mark with a completion label', () => {
    const { container, getByRole } = render(<SteamCompletionIcon />);
    expect(getByRole('img', { name: 'Completed game' })).toBeInTheDocument();
    expect(container.querySelector('[data-steam-complete="true"]')).not.toBeNull();
    const mark = container.querySelector('svg > path');
    expect(mark).not.toBeNull();
    expect(mark!.getAttribute('fill')).toContain('url(#');
  });
  it('renders the mark in grayscale when the base game is incomplete', () => {
    const { container, getByRole } = render(<SteamCompletionIcon muted />);
    expect(getByRole('img', { name: 'Base game not completed' })).toBeInTheDocument();
    expect(container.querySelector('[data-steam-complete-muted="true"]')).not.toBeNull();
    const mark = container.querySelector('svg > path');
    expect(mark).not.toBeNull();
    expect(mark!.getAttribute('fill')).toContain('url(#');
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
