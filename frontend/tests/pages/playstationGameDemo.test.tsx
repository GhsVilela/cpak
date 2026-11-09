import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent, within } from '@testing-library/react';

const pushMock = vi.fn();
const testState = vi.hoisted(() => ({ gameId: 'psn_001' }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams('profileId=demo_psn_1'),
  usePathname: () => `/playstation/game/${testState.gameId}`,
}));

vi.mock('react', async (importOriginal) => {
  const React = (await importOriginal()) as typeof import('react');
  return {
    ...React,
    use: (promise: Promise<unknown>) => {
      if (promise instanceof Promise) {
        return { id: testState.gameId };
      }
      return React.use(promise);
    },
  };
});

describe('PlayStation game detail page — demo mode end to end', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true');
    localStorage.clear();
    testState.gameId = 'psn_001';
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    delete (window as any).__DEMO_MOCK_INSTALLED__;
    delete (window as any).__DEMO_MODE__;
  });

  it('shows per-category trophy counts without a Platinum badge', async () => {
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
      within(baseGroupButton!).queryByLabelText('Platinum trophy earned')
    ).toBeNull();
    expect(
      within(baseGroupButton!).getByTitle('1 platinum trophy')
    ).toBeTruthy();
    expect(within(dlcGroupButton!).queryByLabelText('Platinum trophy earned')).toBeNull();

    fireEvent.click(screen.getByText('Base Game'));
    await waitFor(() => {
      expect(screen.getByText('Mythic Quest - Challenge 1')).toBeTruthy();
    });
  });

  it('auto-expands the only base game group', async () => {
    testState.gameId = 'psn_005';
    const { default: GamePage } = await import('../../app/playstation/game/[id]/page');

    render(<GamePage params={Promise.resolve({ id: 'psn_005' })} />);

    const groupButton = (
      await screen.findByText('Base Game', undefined, { timeout: 10000 })
    ).closest('button');
    expect(groupButton).not.toBeNull();
    expect(groupButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByText('DLC / Update')).toBeNull();
    expect(screen.getByText('Base Camp Chronicles - Challenge 1')).toBeTruthy();
  });

  it('renders trophies directly when the game has no groups', async () => {
    testState.gameId = 'psn_006';
    const { default: GamePage } = await import('../../app/playstation/game/[id]/page');

    render(<GamePage params={Promise.resolve({ id: 'psn_006' })} />);

    expect(
      await screen.findByText('Standalone Saga - Challenge 1', undefined, { timeout: 10000 })
    ).toBeTruthy();
    expect(screen.queryByText('Base Game')).toBeNull();
    expect(screen.getByText('Unlocked (20)')).toBeTruthy();
    expect(screen.getByText('Locked (10)')).toBeTruthy();
  });
});
