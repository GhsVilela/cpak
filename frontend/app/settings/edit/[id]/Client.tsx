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

export default function Client({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [steamApiKey, setSteamApiKey] = useState('');
  const [hasSteamApiKey, setHasSteamApiKey] = useState(false);

  useEffect(() => {
    async function fetchProfile() {
      try {
        const response = await fetch(`/api/profiles/${id}`);
        if (!response.ok) {
          throw new Error('Failed to fetch profile');
        }
        const data = await response.json();
        setProfile(data);
        setDisplayName(data.displayName || '');
        setHasSteamApiKey(data.credentials?.steamApiKeyConfigured || !!data.credentials?.steamApiKey);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      await apiClient.patch(`/profiles/${id}`, {
        displayName,
        ...(steamApiKey ? { credentials: { steamApiKey } } : {}),
      });
      router.push('/settings');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] p-8">
        <div className="max-w-2xl mx-auto">Loading...</div>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] p-8">
        <div className="max-w-2xl mx-auto">
          <p className="text-red-500">{error}</p>
          <button onClick={() => router.push('/settings')} className="mt-4 px-4 py-2 bg-gray-700 rounded">
            Back to Settings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] p-8">
      <div className="max-w-2xl mx-auto">
        <button onClick={() => router.push('/settings')} className="mb-6 text-blue-400 hover:underline">
          ← Back to Settings
        </button>
        <h1 className="text-3xl font-bold mb-6">Edit Profile</h1>
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <p className="text-sm text-gray-400 mb-2">Platform</p>
          <p className="text-lg mb-4">{profile ? platformNames[profile.platform] : ''}</p>
          <p className="text-sm text-gray-400 mb-2">Profile ID</p>
          <p className="text-lg font-mono">{profile?.profileId}</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-gray-800 rounded-lg p-6">
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600"
            />
          </div>
          {profile?.platform === 'steam' && (
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Steam API Key</label>
              {hasSteamApiKey && !steamApiKey && (
                <p className="text-sm text-green-400 mb-2">API key configured</p>
              )}
              <input
                type="password"
                value={steamApiKey}
                onChange={(e) => setSteamApiKey(e.target.value)}
                placeholder={hasSteamApiKey ? 'Enter new key to update' : 'Enter Steam API key'}
                className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600"
              />
            </div>
          )}
          {error && <p className="text-red-500 mb-4">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </form>
      </div>
    </div>
  );
}
