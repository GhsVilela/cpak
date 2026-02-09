'use client';

import { useState } from 'react';
import { apiClient } from '../../services/apiClient';

export default function SetupPage() {
  const [steamApiKey, setSteamApiKey] = useState('');
  const [steamId, setSteamId] = useState('');
  const [xboxEnabled, setXboxEnabled] = useState(false);
  const [psnEnabled, setPsnEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
      
      console.log('Sending profile data:', profileData);
      
      const createdProfile = await apiClient.post<{ _id: string }>('/profiles', profileData);

      // Trigger initial sync using the MongoDB _id
      await apiClient.post(`/sync/steam?profileId=${createdProfile._id}`);

      // Go directly to games page after setup
      window.location.href = '/steam';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to setup Steam profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Setup Wizard</h1>

      <div className="space-y-6">
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
                <h3 className="text-sm font-semibold text-yellow-400 mb-2">⚠️ Important: Profile Privacy</h3>
                <p className="text-xs text-gray-300 mb-2">
                  Your Steam profile must be set to <strong>Public</strong> for achievement syncing to work properly.
                </p>
                <p className="text-xs text-gray-400 mb-2">
                  If you experience sync issues or some games don't appear after syncing, verify if your profile is set to Public. 
                  Steam may not return free-to-play games when profiles are set to Private or Friends Only.
                </p>
                <p className="text-xs text-gray-400">
                  Go to{' '}
                  <a
                    href="https://steamcommunity.com/my/edit/settings"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--steam-accent)] hover:underline"
                  >
                    Privacy Settings
                  </a>
                  {' '}and set both <strong>"My profile"</strong> and <strong>"Game details"</strong> to Public.
                </p>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-4">Optional Platforms</h2>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={xboxEnabled}
                  onChange={(e) => setXboxEnabled(e.target.checked)}
                  className="w-4 h-4"
                />
                <span>Enable Xbox (coming soon)</span>
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={psnEnabled}
                  onChange={(e) => setPsnEnabled(e.target.checked)}
                  className="w-4 h-4"
                />
                <span>Enable PlayStation (coming soon)</span>
              </label>
            </div>
          </div>

        {error && <div className="bg-red-900/20 border border-red-500 text-red-400 px-4 py-2 rounded">{error}</div>}

        <button
          onClick={handleSteamSetup}
          disabled={loading}
          className="w-full bg-[var(--steam-accent)] hover:bg-[var(--steam-accent)]/80 text-gray-900 font-semibold px-6 py-3 rounded disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {loading ? 'Setting up...' : 'Setup Steam Profile'}
        </button>
      </div>
    </div>
  );
}
