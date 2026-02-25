import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => '/settings/edit/profile-1',
}));

vi.mock('../../services/apiClient', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({
      _id: 'profile-1',
      platform: 'steam',
      profileId: 'steam-123',
      displayName: 'Test User',
      credentials: { steamApiKeyConfigured: true },
    }),
    patch: vi.fn().mockResolvedValue({}),
  },
}));

// next/navigation's `use` / React19 `use(params)` needs special handling
// We mock the params Promise by importing `use` from react
vi.mock('react', async (importOriginal) => {
  const React = await importOriginal() as typeof import('react');
  return {
    ...React,
    use: (promise: Promise<unknown>) => {
      // If it's a promise for params, return the resolved value synchronously
      // For the edit page, params resolves to { id: 'profile-1' }
      if (promise instanceof Promise) {
        return { id: 'profile-1' };
      }
      return React.use(promise);
    },
  };
});

describe('Settings Edit page — app/settings/edit/[id]/page.tsx', () => {
  it('renders without crashing', async () => {
    const { default: EditProfilePage } = await import(
      // @ts-ignore
      '../../app/settings/edit/[id]/page'
    );
    render(<EditProfilePage params={Promise.resolve({ id: 'profile-1' })} />);
    await waitFor(() => {
      expect(document.body.firstChild).toBeTruthy();
    });
  });
});
