'use client';

import { use, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiClient } from '../../../../services/apiClient';
import TrophyBackupImportSection from '../../../../components/TrophyBackupImportSection';

interface Profile {
  _id: string;
  platform: 'steam' | 'xbox' | 'playstation';
  profileId: string;
  displayName: string;
  credentials: {
    steamApiKey?: string;
    steamApiKeyConfigured?: boolean;
  };
}

interface PageProps {
  params: Promise<{ id: string }>;
}

type CardStatus = { type: 'success' | 'error'; message: string } | null;

const platformNames = {
  steam: 'Steam',
  xbox: 'Xbox',
  playstation: 'PlayStation',
};

export default function EditProfilePage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo') || '/settings';
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [displayName, setDisplayName] = useState('');
  const [savingDisplayName, setSavingDisplayName] = useState(false);
  const [displayNameStatus, setDisplayNameStatus] = useState<CardStatus>(null);

  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [savingApiKey, setSavingApiKey] = useState(false);
  const [apiKeyStatus, setApiKeyStatus] = useState<CardStatus>(null);

  const [npssoToken, setNpssoToken] = useState('');
  const [showNpsso, setShowNpsso] = useState(false);
  const [savingNpsso, setSavingNpsso] = useState(false);
  const [npssoStatus, setNpssoStatus] = useState<CardStatus>(null);

  useEffect(() => {
    loadProfile();
  }, [id]);

  const loadProfile = async () => {
    setLoading(true);
    setError('');

    try {
      const data = await apiClient.get<Profile>(`/profiles/${id}`);
      setProfile(data);
      setDisplayName(data.displayName || '');
      // Never populate the API key field for security - keep it empty
      setApiKey('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Persist the given changes for the profile.
   * The user stays on this page after saving so that other options can be
   * changed without navigating back and forth.
   */
  const saveProfile = async (updates: Record<string, unknown>): Promise<void> => {
    await apiClient.patch(`/profiles/${id}`, updates);
    // Reflect the new display name locally so the field stays in sync.
    if (typeof updates.displayName === 'string') {
      setProfile((prev) => (prev ? { ...prev, displayName: updates.displayName as string } : prev));
    }
  };

  const handleSaveDisplayName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setSavingDisplayName(true);
    setDisplayNameStatus(null);

    try {
      const updates: Record<string, unknown> = {};
      if (displayName.trim() && displayName !== profile.displayName) {
        updates.displayName = displayName.trim();
      }

      if (Object.keys(updates).length === 0) {
        setDisplayNameStatus({ type: 'success', message: 'Display name is already up to date.' });
        setSavingDisplayName(false);
        return;
      }

      await saveProfile(updates);
      setDisplayNameStatus({ type: 'success', message: 'Display name updated successfully!' });
    } catch (err) {
      setDisplayNameStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to update display name',
      });
    } finally {
      setSavingDisplayName(false);
    }
  };

  const handleSaveApiKey = async (e: React.FormEvent) => {
    e.preventDefault();

    setSavingApiKey(true);
    setApiKeyStatus(null);

    try {
      if (!apiKey.trim()) {
        setApiKeyStatus({ type: 'error', message: 'Enter a Steam API key first.' });
        setSavingApiKey(false);
        return;
      }

      await saveProfile({ credentials: { steamApiKey: apiKey.trim() } });
      setApiKey('');
      setApiKeyStatus({ type: 'success', message: 'Steam API key updated successfully!' });
    } catch (err) {
      setApiKeyStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to update Steam API key',
      });
    } finally {
      setSavingApiKey(false);
    }
  };

  const handleSaveNpsso = async (e: React.FormEvent) => {
    e.preventDefault();

    setSavingNpsso(true);
    setNpssoStatus(null);

    try {
      if (!npssoToken.trim()) {
        setNpssoStatus({ type: 'error', message: 'Paste a new NPSSO token first.' });
        setSavingNpsso(false);
        return;
      }

      await saveProfile({ npssoToken: npssoToken.trim() });
      setNpssoToken('');
      setNpssoStatus({ type: 'success', message: 'NPSSO token updated successfully!' });
    } catch (err) {
      setNpssoStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to update NPSSO token',
      });
    } finally {
      setSavingNpsso(false);
    }
  };

  const handleImportFinished = () => {
    // Feedback is rendered inside the import section itself — nothing to do here.
  };

  // The save buttons stay disabled until the field actually holds a new value.
  const isDisplayNameChanged =
    !!profile &&
    displayName.trim().length > 0 &&
    displayName.trim() !== (profile.displayName || '').trim();
  const isSteamApiKeyEntered = apiKey.trim().length > 0;
  const isNpssoTokenEntered = npssoToken.trim().length > 0;

  if (loading) {
    return <div className="text-center py-12">Loading profile...</div>;
  }

  if (!profile) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400 mb-4">Profile not found</p>
        <button
          onClick={() => router.push(returnTo)}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded font-medium transition"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => router.push(returnTo)}
          className="text-gray-400 hover:text-white mb-4 flex items-center gap-2"
        >
          ← Back
        </button>
        <h1 className="text-3xl font-bold">Edit Profile</h1>
        <p className="text-gray-400 mt-2">
          {platformNames[profile.platform]} • {profile.profileId}
        </p>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-500 text-red-400 px-4 py-2 rounded mb-4">
          {error}
        </div>
      )}

      {/* Profile Data */}
      <div className="bg-gray-900 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Profile Data</h2>

        <form onSubmit={handleSaveDisplayName} className="space-y-4">
          <div>
            <label htmlFor="displayName" className="block text-sm font-medium mb-2">
              Display Name
            </label>
            <input
              type="text"
              id="displayName"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                setDisplayNameStatus(null);
              }}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter display name"
              required
            />
          </div>

          {displayNameStatus && (
            <div
              className={`px-4 py-2 rounded text-sm ${
                displayNameStatus.type === 'success'
                  ? 'bg-green-900/20 border border-green-500 text-green-400'
                  : 'bg-red-900/20 border border-red-500 text-red-400'
              }`}
            >
              {displayNameStatus.message}
            </div>
          )}

          <button
            type="submit"
            disabled={savingDisplayName || !isDisplayNameChanged}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded font-medium transition"
          >
            {savingDisplayName ? 'Saving...' : 'Save Profile Data'}
          </button>
        </form>
      </div>

      {/* Token */}
      {(profile.platform === 'steam' || profile.platform === 'playstation') && (
        <div className="bg-gray-900 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Token</h2>

          {/* Steam API Key */}
          {profile.platform === 'steam' && (
            <form onSubmit={handleSaveApiKey} className="space-y-4">
              <div>
                <label htmlFor="apiKey" className="block text-sm font-medium mb-2">
                  Steam API Key
                </label>
                <div className="relative">
                  <input
                    type={showApiKey ? "text" : "password"}
                    id="apiKey"
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value);
                      setApiKeyStatus(null);
                    }}
                    placeholder={profile.credentials?.steamApiKeyConfigured ? "Enter new API key" : "Steam API key"}
                    className="w-full px-4 py-2 pr-24 bg-gray-800 border border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    {profile.credentials?.steamApiKeyConfigured && !apiKey && (
                      <div className="flex items-center gap-1 text-green-400" title="API key is configured">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-xs font-medium">Configured</span>
                      </div>
                    )}
                    {apiKey && (
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="text-gray-400 hover:text-gray-200"
                        aria-label={showApiKey ? "Hide API key" : "Show API key"}
                      >
                        {showApiKey ? (
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        )}
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {profile.credentials?.steamApiKeyConfigured
                    ? "Your API key is encrypted and never displayed. Leave empty to keep your existing key unchanged."
                    : "Enter your Steam API key. It will be encrypted and never displayed after saving."}
                </p>
              </div>

              {apiKeyStatus && (
                <div
                  className={`px-4 py-2 rounded text-sm ${
                    apiKeyStatus.type === 'success'
                      ? 'bg-green-900/20 border border-green-500 text-green-400'
                      : 'bg-red-900/20 border border-red-500 text-red-400'
                  }`}
                >
                  {apiKeyStatus.message}
                </div>
              )}

              <button
                type="submit"
                disabled={savingApiKey || !isSteamApiKeyEntered}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded font-medium transition"
              >
                {savingApiKey ? 'Saving...' : 'Save Token'}
              </button>
            </form>
          )}

          {/* NPSSO Token */}
          {profile.platform === 'playstation' && (
            <form onSubmit={handleSaveNpsso} className="space-y-4">
              <div>
                <label htmlFor="npssoToken" className="block text-sm font-medium mb-2">
                  NPSSO Token
                </label>
                <div className="relative">
                  <input
                    type={showNpsso ? "text" : "password"}
                    id="npssoToken"
                    value={npssoToken}
                    onChange={(e) => {
                      setNpssoToken(e.target.value);
                      setNpssoStatus(null);
                    }}
                    placeholder="Paste a new NPSSO token to re-authenticate"
                    className="w-full px-4 py-2 pr-12 bg-gray-800 border border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {npssoToken && (
                    <button
                      type="button"
                      onClick={() => setShowNpsso(!showNpsso)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
                      aria-label={showNpsso ? "Hide NPSSO token" : "Show NPSSO token"}
                    >
                      {showNpsso ? (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      )}
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Paste a fresh NPSSO token to re-authenticate your PlayStation account. Get one from{' '}
                  <a
                    href="https://ca.account.sony.com/api/v1/ssocookie"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300"
                  >
                    Sony SSO Cookie
                  </a>
                  . Leave empty to keep existing credentials.
                </p>
              </div>

              {npssoStatus && (
                <div
                  className={`px-4 py-2 rounded text-sm ${
                    npssoStatus.type === 'success'
                      ? 'bg-green-900/20 border border-green-500 text-green-400'
                      : 'bg-red-900/20 border border-red-500 text-red-400'
                  }`}
                >
                  {npssoStatus.message}
                </div>
              )}

              <button
                type="submit"
                disabled={savingNpsso || !isNpssoTokenEntered}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded font-medium transition"
              >
                {savingNpsso ? 'Saving...' : 'Save Token'}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Import Backup */}
      {profile.platform === 'playstation' && (
        <div className="bg-gray-900 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-2">Import Backup</h2>
          <p className="text-sm text-gray-400 mb-4">
            Add trophies for games that are not returned by the PlayStation API by importing a PS5
            trophy backup. Games that are already tracked are never overwritten.
          </p>

          <TrophyBackupImportSection
            profileId={id}
            onFinished={handleImportFinished}
          />
        </div>
      )}
    </div>
  );
}
