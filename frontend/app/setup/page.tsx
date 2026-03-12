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
                <input
                  type="text"
                  value={steamApiKey}
                  onChange={(e) => setSteamApiKey(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-[var(--steam-accent)]"
                  placeholder="Enter your Steam API key"
                />
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
            <h2 className="text-xl font-semibold mb-4" style={{ color: '#003791' }}>
              PlayStation
            </h2>
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 text-center">
              <div className="text-4xl mb-3">🕹️</div>
              <h3 className="text-lg font-semibold mb-2 text-gray-200">Coming Soon</h3>
              <p className="text-gray-400 text-sm">
                PlayStation Network integration is not yet available. Check back in a future update.
              </p>
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

