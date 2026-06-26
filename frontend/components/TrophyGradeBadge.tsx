interface TrophyGradeBadgeProps {
  grade: 'bronze' | 'silver' | 'gold' | 'platinum' | null | undefined;
}

const GRADE_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  platinum: {
    bg: '#1a3a5c',
    text: '#a0b4c8',
    border: '#a0b4c8',
    label: 'Platinum',
  },
  gold: {
    bg: '#7a6800',
    text: '#c8a800',
    border: '#c8a800',
    label: 'Gold',
  },
  silver: {
    bg: '#4a4a4a',
    text: '#a8a8a8',
    border: '#a8a8a8',
    label: 'Silver',
  },
  bronze: {
    bg: '#7a4b1e',
    text: '#cd7f32',
    border: '#cd7f32',
    label: 'Bronze',
  },
};

export default function TrophyGradeBadge({ grade }: TrophyGradeBadgeProps) {
  if (!grade || !(grade in GRADE_STYLES)) return null;

  const { bg, text, border, label } = GRADE_STYLES[grade];

  return (
    <span
      style={{
        backgroundColor: bg,
        color: text,
        border: `1px solid ${border}`,
        borderRadius: '4px',
        padding: '1px 6px',
        fontSize: '0.7rem',
        fontWeight: 600,
        letterSpacing: '0.03em',
        display: 'inline-block',
        lineHeight: '1.4',
      }}
    >
      {label}
    </span>
  );
}
