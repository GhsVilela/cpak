'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { apiClient } from '../../services/apiClient';

type Platform = 'steam' | 'xbox' | 'playstation';

const VALID_PLATFORMS: Platform[] = ['steam', 'xbox', 'playstation'];

function SetupPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const platformParam = searchParams.get('platform') as Platform | null;
  const initialPlatform: Platform =
    platformParam && VALID_PLATFORMS.includes(platformParam) ? platformParam : 'steam';

  // Platform selector
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>(initialPlatform);

  // Steam form state
  const [steamApiKey, setSteamApiKey] = useState('');
  const [steamId, setSteamId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSteamApiKey, setShowSteamApiKey] = useState(false);

  // PlayStation form state
  const [npssoToken, setNpssoToken] = useState('');
  const [showNpssoToken, setShowNpssoToken] = useState(false);

  // Xbox OAuth config check
  const [xboxConfigured, setXboxConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    apiClient.getAllSettings().then(({ settings }) => {
      const map = Object.fromEntries(settings.map((s) => [s.key, s]));
      const hasClientId = !!(map['xbox_client_id']?.value);
      const hasSecret = !!(map['xbox_client_secret']); // secret: present = configured
      const hasRedirectUri = !!(map['xbox_redirect_uri']?.value);
      setXboxConfigured(hasClientId && hasSecret && hasRedirectUri);
    }).catch(() => setXboxConfigured(false));
  }, []);

  const handleSteamSetup = async () => {
    if (!steamApiKey || !steamId) {
      setError('Steam API Key and Steam ID are required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const profileData = {
        platform: 'steam' as const,
        profileId: steamId,
        displayName: `Steam User ${steamId}`,
        credentials: {
          steamApiKey,
        },
      };

      const createdProfile = await apiClient.post<{ _id: string }>('/profiles', profileData);

      // Trigger initial sync using the MongoDB _id
      await apiClient.post(`/sync/steam?profileId=${createdProfile._id}`);

      // Go directly to the games page for the newly added profile
      router.push(`/steam?profileId=${createdProfile._id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to setup Steam profile');
    } finally {
      setLoading(false);
    }
  };

  const handlePlayStationSetup = async () => {
    if (!npssoToken.trim()) {
      setError('NPSSO token is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Validate NPSSO before creating the profile
      const validation = await apiClient.post<{ valid: boolean; accountId?: string; onlineId?: string; error?: string }>(
        '/auth/playstation/validate',
        { npssoToken: npssoToken.trim() },
      );

      if (!validation.valid || !validation.accountId) {
        setError(validation.error ?? 'Invalid NPSSO token. Make sure you copied it correctly.');
        return;
      }

      // Create the profile (backend exchanges NPSSO → OAuth internally)
      const created = await apiClient.post<{ _id: string }>('/profiles', {
        platform: 'playstation' as const,
        profileId: validation.accountId,
        displayName: validation.onlineId ?? validation.accountId,
        npssoToken: npssoToken.trim(),
      });

      // Trigger initial sync
      await apiClient.post(`/sync/playstation?profileId=${created._id}`, {});

      router.push(`/playstation?profileId=${created._id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to setup PlayStation profile');
    } finally {
      setLoading(false);
    }
  };

  const handleXboxSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiClient.get<{ url: string }>('/auth/xbox/url?redirectTo=/xbox');
      window.location.href = response.url;
    } catch (err: any) {
      if (err?.status === 400 || err?.message?.includes('not configured')) {
        setError(
          'Xbox OAuth is not configured. Please go to Settings and enter your Xbox Client ID, Client Secret, and Redirect URI.',
        );
      } else {
        setError(err instanceof Error ? err.message : 'Failed to start Xbox authentication');
      }
    } finally {
      setLoading(false);
    }
  };

  const platforms: { id: Platform; label: string; color: string; icon: string }[] = [
    { id: 'steam', label: 'Steam', color: 'var(--steam-accent)', icon: '🎮' },
    { id: 'xbox', label: 'Xbox', color: 'var(--xbox-accent)', icon: '🎯' },
    { id: 'playstation', label: 'PlayStation', color: '#003791', icon: '🕹️' },
  ];

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Add Account</h1>

      {/* Platform Cards */}
      <div className="flex gap-4 mb-8">
        {platforms.map((platform) => (
          <button
            key={platform.id}
            onClick={() => { setSelectedPlatform(platform.id); setError(''); router.replace(`/setup?platform=${platform.id}`); }}
            className={`flex-1 py-4 px-3 rounded-lg border-2 text-center font-semibold transition ${
              selectedPlatform === platform.id
                ? 'border-current opacity-100'
                : 'border-gray-700 opacity-60 hover:opacity-80'
            }`}
            style={
              selectedPlatform === platform.id
                ? { borderColor: platform.color, color: platform.color }
                : {}
            }
            aria-label={platform.label}
          >
            <div className="text-2xl mb-1">{platform.icon}</div>
            <div>{platform.label}</div>
          </button>
        ))}
      </div>

      {/* Platform-specific content */}
      <div className="space-y-6">

        {/* Steam Form */}
        {selectedPlatform === 'steam' && (
          <div>
            <h2 className="text-xl font-semibold mb-4">Steam Configuration</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Steam ID</label>
                <input
                  type="text"
                  value={steamId}
                  onChange={(e) => setSteamId(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-[var(--steam-accent)]"
                  placeholder="Enter your Steam ID (64-bit)"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Find your Steam ID at{' '}
                  <a
                    href="https://steamid.io/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--steam-accent)] hover:underline"
                  >
                    steamid.io
                  </a>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Steam API Key</label>
                <div className="relative">
                  <input
                    type={showSteamApiKey ? "text" : "password"}
                    value={steamApiKey}
                    onChange={(e) => setSteamApiKey(e.target.value)}
                    className="w-full px-3 py-2 pr-10 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-[var(--steam-accent)]"
                    placeholder="Enter your Steam API key"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSteamApiKey(!showSteamApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
                    aria-label={showSteamApiKey ? "Hide API Key" : "Show API Key"}
                  >
                    {showSteamApiKey ? (
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
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Get your API key from{' '}
                  <a
                    href="https://steamcommunity.com/dev/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--steam-accent)] hover:underline"
                  >
                    steamcommunity.com/dev/apikey
                  </a>
                </p>
              </div>

              <div className="bg-yellow-900/20 border border-yellow-700/50 rounded p-4">
                <h3 className="text-sm font-semibold text-yellow-400 mb-2">⚠️ Important: Sync Details</h3>
                <p className="text-xs text-gray-300 mb-2">
                  Your Steam profile must be set to <strong>Public</strong> for achievement syncing to work properly.
                </p>
                <p className="text-xs text-gray-400 mb-2">
                  If you experience sync issues or some games don't appear after syncing, verify if your profile is set to
                  Public. Steam may not return free-to-play games when profiles are set to Private or Friends Only.
                </p>
                <p className="text-xs text-gray-400 mb-2">
                  Go to{' '}
                  <a
                    href="https://steamcommunity.com/my/edit/settings"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--steam-accent)] hover:underline"
                  >
                    Privacy Settings
                  </a>{' '}
                  and set both <strong>"My profile"</strong> and <strong>"Game details"</strong> to Public.
                </p>
                <p className="text-xs text-gray-400">
                  Some unlocked achievements may not be synced due to <strong>revoked licenses</strong> from a <strong>refunded</strong> game, a
                  <strong> limited-time free-to-play</strong> campaign, or no longer being part of a <strong>family sharing</strong> group.
                </p>
              </div>

              {error && (
                <div className="bg-red-900/20 border border-red-500 text-red-400 px-4 py-2 rounded">
                  {error}
                </div>
              )}

              <button
                onClick={handleSteamSetup}
                disabled={loading}
                className="w-full bg-[var(--steam-accent)] hover:bg-[var(--steam-accent)]/80 text-gray-900 font-semibold px-6 py-3 rounded disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {loading ? 'Setting up...' : 'Setup Steam Profile'}
              </button>
            </div>
          </div>
        )}

        {/* Xbox Form */}
        {selectedPlatform === 'xbox' && (
          <div>
            <h2 className="text-xl font-semibold mb-4 text-[var(--xbox-accent)]">Xbox Sign In</h2>
            <div className="space-y-4">
              <p className="text-gray-300">
                Sign in with your Microsoft account to connect your Xbox profile. Your Xbox achievement history
                will be synced automatically.
              </p>

              <div className="bg-gray-800 border border-gray-700 rounded p-4 text-sm text-gray-400 space-y-2">
                <p>
                  <strong className="text-gray-200">Before you connect:</strong> Xbox integration requires an
                  Azure AD application.
                </p>
                <p>
                  Make sure you have configured your <strong>Client ID</strong>, <strong>Client Secret</strong>,
                  and <strong>Redirect URI</strong> in{' '}
                  <a href="/settings" className="text-[var(--xbox-accent)] hover:underline">
                    Settings → Xbox OAuth Settings
                  </a>
                  .
                </p>
              </div>

              {/* First sync performance notice */}
              <div className="bg-yellow-900/20 border border-yellow-700/50 rounded p-4">
                <h3 className="text-sm font-semibold text-yellow-400 mb-2">⚠️ Important: First Sync Duration</h3>
                <p className="text-xs text-gray-300 mb-2">
                  Achievement icons for <strong>modern Xbox titles</strong> (Xbox One and later) are served as
                  high-resolution images (1080p or higher, typically 5–10 MB each). During the{' '}
                  <strong>first sync</strong>, cpak downloads every icon and automatically crops and resizes it
                  for local storage, this can take a while depending on your internet connection and how many
                  games you have.
                </p>
                <p className="text-xs text-gray-400">
                  Subsequent syncs skip any icons that are already stored locally, so only new achievements
                  will be downloaded.
                </p>
              </div>

              {error && (
                <div className="bg-red-900/20 border border-red-500 text-red-400 px-4 py-2 rounded">
                  {error}
                </div>
              )}

              {xboxConfigured === false && (
                <div className="bg-yellow-900/20 border border-yellow-600/40 rounded px-4 py-3 text-yellow-300 text-sm">
                  Xbox OAuth is not configured. Please go to{' '}
                  <a href="/settings" className="underline hover:text-yellow-100">Settings → Xbox OAuth Settings</a>{' '}
                  and enter your <strong>Client ID</strong>, <strong>Client Secret</strong>, and <strong>Redirect URI</strong> before signing in.
                </div>
              )}

              <button
                onClick={handleXboxSignIn}
                disabled={loading || xboxConfigured !== true}
                title={xboxConfigured !== true ? 'Configure Xbox OAuth settings first' : undefined}
                className="w-full bg-[var(--xbox-accent)] hover:opacity-90 text-white font-semibold px-6 py-3 rounded disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
              >
                {loading ? (
                  'Redirecting...'
                ) : (
                  <>
                    <span>Sign in with Xbox</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* PlayStation Form */}
        {selectedPlatform === 'playstation' && (
          <div>
            <h2 className="text-xl font-semibold mb-4 text-[var(--playstation-accent)]">PlayStation Sign In</h2>
            <div className="space-y-4">
              <p className="text-gray-300">
                Connect your PlayStation Network account using an NPSSO token. Your trophy history will be
                synced automatically.
              </p>

              <div>
                <label className="block text-sm font-medium mb-2">NPSSO Token</label>
                <div className="relative">
                  <input
                    type={showNpssoToken ? "text" : "password"}
                    value={npssoToken}
                    onChange={(e) => setNpssoToken(e.target.value)}
                    className="w-full px-3 py-2 pr-10 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-[var(--playstation-accent)] font-mono text-sm"
                    placeholder="Paste your NPSSO token here"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNpssoToken(!showNpssoToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
                    aria-label={showNpssoToken ? "Hide NPSSO Token" : "Show NPSSO Token"}
                  >
                    {showNpssoToken ? (
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
                </div>
              </div>

              <div className="bg-gray-800 border border-gray-700 rounded p-4 text-sm text-gray-400 space-y-2">
                <p className="font-semibold text-gray-200">How to get your NPSSO token:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Sign in to <a href="https://store.playstation.com" target="_blank" rel="noopener noreferrer" className="text-[var(--playstation-accent)] hover:underline">store.playstation.com</a></li>
                  <li>Visit <a href="https://ca.account.sony.com/api/v1/ssocookie" target="_blank" rel="noopener noreferrer" className="text-[var(--playstation-accent)] hover:underline">ca.account.sony.com/api/v1/ssocookie</a></li>
                  <li>Copy the <code className="bg-gray-700 px-1 rounded">npsso</code> value from the JSON response</li>
                </ol>
                <p className="text-xs text-gray-500 pt-1">
                  The NPSSO token expires in ~24 hours but will be exchanged for a longer-lived OAuth token (~60 days) during setup.
                </p>
              </div>

              <div className="bg-yellow-900/20 border border-yellow-700/50 rounded p-4">
                <h3 className="text-sm font-semibold text-yellow-400 mb-2">⚠️ Privacy Settings</h3>
                <p className="text-xs text-gray-300">
                  Your PSN trophies must be set to <strong>Public</strong> or <strong>Friends</strong> visibility.
                  Go to <strong>PlayStation App → Profile → Privacy Settings → Trophies</strong> to check.
                </p>
              </div>

              {error && (
                <div className="bg-red-900/20 border border-red-500 text-red-400 px-4 py-2 rounded">
                  {error}
                </div>
              )}

              <button
                onClick={handlePlayStationSetup}
                disabled={loading || !npssoToken.trim()}
                className="w-full bg-[var(--playstation-accent)] hover:opacity-90 text-white font-semibold px-6 py-3 rounded disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {loading ? 'Connecting...' : 'Connect PlayStation Account'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SetupPage() {
  return (
    <Suspense fallback={<div className="animate-pulse text-gray-500">Loading...</div>}>
      <SetupPageContent />
    </Suspense>
  );
}

