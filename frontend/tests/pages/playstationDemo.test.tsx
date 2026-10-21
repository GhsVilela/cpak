import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams('profileId=demo_psn_1'),
  usePathname: () => '/playstation',
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

describe('PlayStation page — demo mode end to end', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true');
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    delete (window as any).__DEMO_MOCK_INSTALLED__;
    delete (window as any).__DEMO_MODE__;
  });

  it('shows the trophy breakdown instead of the sync progress bar', async () => {
    const { default: PsPage } = await import('../../app/playstation/page');

    render(<PsPage />);

    await waitFor(
      () => {
        expect(screen.getByText('Mythic Quest')).toBeTruthy();
      },
      { timeout: 10000 }
    );

    expect(screen.queryByText(/Sync in progress/)).toBeNull();
    expect(screen.getAllByText('Trophies').length).toBeGreaterThan(0);
    // 84 bronze + 33 silver + 11 gold + 2 platinum
    expect(screen.getAllByText('130').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Platinum').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bronze').length).toBeGreaterThan(0);
  });
});
