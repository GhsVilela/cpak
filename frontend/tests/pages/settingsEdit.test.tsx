import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, act } from '@testing-library/react';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => '/settings/edit/profile-1',
  useSearchParams: () => ({ get: () => null }),
}));

const mockGet = vi.fn();
const mockPatch = vi.fn();

vi.mock('../../services/apiClient', () => ({
  apiClient: {
    get: mockGet,
    patch: mockPatch,
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

const steamProfile = {
  _id: 'profile-1',
  platform: 'steam',
  profileId: 'steam-123',
  displayName: 'Test User',
  credentials: { steamApiKeyConfigured: true },
};

const playstationProfile = {
  _id: 'profile-1',
  platform: 'playstation',
  profileId: 'ps-123',
  displayName: 'Test User',
  credentials: {},
};

const renderEditPage = async () => {
  const { default: EditProfilePage } = await import(
    // @ts-ignore
    '../../app/settings/edit/[id]/page'
  );
  render(<EditProfilePage params={Promise.resolve({ id: 'profile-1' })} />);
};

describe('Settings Edit page — app/settings/edit/[id]/page.tsx', () => {
  beforeEach(() => {
    mockGet.mockResolvedValue(steamProfile);
    mockPatch.mockResolvedValue({});
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders without crashing', async () => {
    await renderEditPage();
    await waitFor(() => {
      expect(document.body.firstChild).toBeTruthy();
    });
  });

  it('groups the options into category cards', async () => {
    await renderEditPage();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /profile data/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: /^token$/i })).toBeInTheDocument();
    // The category heading is not repeated as a field label
    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/steam api key/i)).toBeInTheDocument();
    // PlayStation-only card is not rendered for Steam profiles
    expect(screen.queryByRole('heading', { name: /import backup/i })).toBeNull();
  });

  it('keeps the save buttons disabled until a new value is entered', async () => {
    await renderEditPage();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save profile data/i })).toBeInTheDocument();
    });

    const saveProfileData = screen.getByRole('button', { name: /save profile data/i });
    const saveToken = screen.getByRole('button', { name: /save token/i });

    expect(saveProfileData).toBeDisabled();
    expect(saveToken).toBeDisabled();

    // Re-typing the current display name is not a change.
    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: { value: 'Test User' },
    });
    expect(saveProfileData).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: { value: 'New Name' },
    });
    expect(saveProfileData).toBeEnabled();

    fireEvent.change(screen.getByLabelText(/steam api key/i), {
      target: { value: 'steam-api-key' },
    });
    expect(saveToken).toBeEnabled();
  });

  it('stays on the page after saving the profile data', async () => {
    await renderEditPage();
    await waitFor(() => {
      expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: { value: 'New Name' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save profile data/i }));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith('/profiles/profile-1', {
        displayName: 'New Name',
      });
    });
    expect(pushMock).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/display name updated successfully/i),
    ).toBeInTheDocument();
  });
});

describe('Settings Edit page — PlayStation profile', () => {
  class MockXHR {
    static instances: MockXHR[] = [];
    upload: { onprogress?: (e: any) => void; onload?: () => void } = {};
    onload?: () => void;
    onerror?: () => void;
    status = 200;
    responseText = JSON.stringify({
      imported: [
        { gameId: 'NPWR12345_00', title: 'Backup Game', trophiesTotal: 10, trophiesUnlocked: 4 },
      ],
      skipped: [],
      errors: [],
    });
    sent = false;

    constructor() {
      MockXHR.instances.push(this as unknown as Record<string, any>);
    }

    open() {}
    abort() {}

    send() {
      this.sent = true;
      setTimeout(() => {
        act(() => {
          this.upload.onload?.();
          this.onload?.();
        });
      }, 0);
    }
  }

  beforeEach(() => {
    MockXHR.instances = [];
    mockGet.mockResolvedValue(playstationProfile);
    mockPatch.mockResolvedValue({});
    (globalThis as any).XMLHttpRequest = MockXHR;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows the profile data, token and import backup cards', async () => {
    await renderEditPage();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /profile data/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: /^token$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /import backup/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/npsso token/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/steam api key/i)).toBeNull();
  });

  it('does not navigate away after saving the token', async () => {
    await renderEditPage();
    await waitFor(() => {
      expect(screen.getByLabelText(/npsso token/i)).toBeInTheDocument();
    });

    const saveToken = screen.getByRole('button', { name: /save token/i });
    expect(saveToken).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/npsso token/i), {
      target: { value: 'v3:new-token' },
    });
    expect(saveToken).toBeEnabled();

    fireEvent.click(saveToken);

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith('/profiles/profile-1', {
        npssoToken: 'v3:new-token',
      });
    });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('renders the import backup section inline without a modal', async () => {
    await renderEditPage();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /import backup/i })).toBeInTheDocument();
    });

    expect(screen.getByTestId('trophy-backup-section')).toBeInTheDocument();
    expect(screen.queryByTestId('trophy-backup-modal')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: /playstation 5/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /playstation 4/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /playstation 3/i })).toBeDisabled();
  });

  it('only starts the upload after the user confirms, and shows the result inline', async () => {
    await renderEditPage();
    await waitFor(() => {
      expect(screen.getByTestId('trophy-backup-section')).toBeInTheDocument();
    });

    // Pick the console and a file — nothing is uploaded yet.
    fireEvent.click(screen.getByRole('button', { name: /playstation 5/i }));
    const fileInput = screen.getByTestId('trophy-backup-input');
    const file = new File(['trophy'], 'trophy.zip', { type: 'application/zip' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId('trophy-backup-selected-file').textContent).toContain('trophy.zip');
    });
    expect(MockXHR.instances).toHaveLength(0);

    const confirmButton = screen.getByRole('button', { name: /confirm import/i });
    expect(confirmButton).not.toBeDisabled();

    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(MockXHR.instances).toHaveLength(1);
    });
    expect(MockXHR.instances[0].sent).toBe(true);

    // The outcome is reported inline — no toast involved.
    await waitFor(() => {
      expect(screen.getByTestId('trophy-backup-result')).toBeInTheDocument();
    });
    expect(screen.getByTestId('trophy-backup-result').textContent).toMatch(
      /imported 1 game/i,
    );
    expect(screen.getByRole('button', { name: /import another backup/i })).toBeInTheDocument();
  });
});
