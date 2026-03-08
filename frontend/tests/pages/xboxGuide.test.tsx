import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

describe('Xbox Guide page', () => {
  it('renders the guide with setup steps', async () => {
    const { default: XboxGuidePage } = await import('../../app/xbox-guide/page');
    render(<XboxGuidePage />);
    // Should render some headings/steps
    expect(document.body.textContent).toContain('Azure');
  });
});
