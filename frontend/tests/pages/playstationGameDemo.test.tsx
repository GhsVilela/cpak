import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent, within } from '@testing-library/react';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams('profileId=demo_psn_1'),
  usePathname: () => '/playstation/game/psn_001',
}));

vi.mock('react', async (importOriginal) => {
  const React = (await importOriginal()) as typeof import('react');
  return {
    ...React,
    use: (promise: Promise<unknown>) => {
      if (promise instanceof Promise) {
        return { id: 'psn_001' };
      }
      return React.use(promise);
    },
  };
});

describe('PlayStation game detail page — demo mode end to end', () => {
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

  it('shows the Platinum base game badge and per-category trophy counts', async () => {
    const { default: GamePage } = await import('../../app/playstation/game/[id]/page');

    render(<GamePage params={Promise.resolve({ id: 'psn_001' })} />);

    await waitFor(
      () => {
        expect(screen.getByText('Mythic Quest')).toBeTruthy();
        expect(screen.getByText('Base Game')).toBeTruthy();
        expect(screen.getByText('DLC / Update')).toBeTruthy();
      },
      { timeout: 10000 }
    );

    const baseGroupButton = screen.getByText('Base Game').closest('button');
    const dlcGroupButton = screen.getByText('DLC / Update').closest('button');
    expect(baseGroupButton).not.toBeNull();
    expect(dlcGroupButton).not.toBeNull();

    expect(
      within(baseGroupButton!).getByLabelText('Platinum trophy earned')
    ).toBeTruthy();
    expect(
      within(baseGroupButton!).getByTitle('1 platinum trophy')
    ).toBeTruthy();
    expect(within(dlcGroupButton!).queryByLabelText('Platinum trophy earned')).toBeNull();

    fireEvent.click(screen.getByText('Base Game'));
    await waitFor(() => {
      expect(screen.getByText('Mythic Quest - Challenge 1')).toBeTruthy();
    });
  });
});
