import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams('profileId=demo_xbox_1'),
  usePathname: () => '/xbox',
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

describe('Xbox page — demo mode end to end', () => {
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

  it('shows the gamerscore instead of the sync progress bar', async () => {
    const { default: XboxPage } = await import('../../app/xbox/page');

    render(<XboxPage />);

    await waitFor(
      () => {
        expect(screen.getByText('Eternal Guardians')).toBeTruthy();
      },
      { timeout: 10000 }
    );

    expect(screen.queryByText(/Sync in progress/)).toBeNull();
    expect(screen.getAllByText('Gamerscore').length).toBeGreaterThan(0);
    // 1000 + 550 + 250 + 875 + 450
    expect(screen.getAllByText('3,125').length).toBeGreaterThan(0);
    // Xbox 360 only: Racing Legends
    expect(screen.getAllByText('Xbox 360').length).toBeGreaterThan(0);
    expect(screen.getAllByText('550').length).toBeGreaterThan(0);
  });
});
