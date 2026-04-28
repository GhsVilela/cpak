'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '../../../../services/apiClient';

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

const platformNames = {
  steam: 'Steam',
  xbox: 'Xbox',
  playstation: 'PlayStation',
};

export default function EditProfilePage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  
  const [displayName, setDisplayName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [npssoToken, setNpssoToken] = useState('');
  const [showNpsso, setShowNpsso] = useState(false);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const updates: Record<string, unknown> = {};
      
      if (displayName !== profile?.displayName) {
        updates.displayName = displayName;
      }
      
      // Only update Steam API key if user entered a new value
      if (apiKey.trim()) {
        updates.credentials = { steamApiKey: apiKey };
      }

      // PlayStation: send NPSSO token for re-authentication
      if (npssoToken.trim()) {
        updates.npssoToken = npssoToken.trim();
      }

      await apiClient.patch(`/profiles/${id}`, updates);
      setSuccessMessage('Profile updated successfully!');
      setSaving(false);
      setTimeout(() => {
        router.push('/settings');
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12">Loading profile...</div>;
  }

  if (!profile) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400 mb-4">Profile not found</p>
        <button
          onClick={() => router.push('/settings')}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded font-medium transition"
        >
          Back to Settings
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => router.push('/settings')}
          className="text-gray-400 hover:text-white mb-4 flex items-center gap-2"
        >
          ← Back to Settings
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

      {successMessage && (
        <div className="bg-green-900/20 border border-green-500 text-green-400 px-4 py-2 rounded mb-4">
          {successMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-4">
        <div>
          <label htmlFor="displayName" className="block text-sm font-medium mb-2">
            Display Name
          </label>
          <input
            type="text"
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter display name"
            required
          />
        </div>

        {profile.platform === 'steam' && (
          <div>
            <label htmlFor="apiKey" className="block text-sm font-medium mb-2">
              Steam API Key
            </label>
            <div className="relative">
              <input
                type={showApiKey ? "text" : "password"}
                id="apiKey"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={profile.credentials?.steamApiKeyConfigured ? "Enter new API key" : "Steam API key"}
                className="w-full px-4 py-2 pr-24 bg-gray-900 border border-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
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
        )}

        {profile.platform === 'playstation' && (
          <div>
            <label htmlFor="npssoToken" className="block text-sm font-medium mb-2">
              NPSSO Token
            </label>
            <div className="relative">
              <input
                type={showNpsso ? "text" : "password"}
                id="npssoToken"
                value={npssoToken}
                onChange={(e) => setNpssoToken(e.target.value)}
                placeholder="Paste a new NPSSO token to re-authenticate"
                className="w-full px-4 py-2 pr-12 bg-gray-900 border border-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
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
        )}

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded font-medium transition"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            type="button"
            onClick={() => router.push('/settings')}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded font-medium transition"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
