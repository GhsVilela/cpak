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
    apiKey?: string;
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
  
  const [displayName, setDisplayName] = useState('');
  const [apiKey, setApiKey] = useState('');

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
      setApiKey(data.credentials?.apiKey || '');
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
      const updates: Partial<Profile> = {};
      
      if (displayName !== profile?.displayName) {
        updates.displayName = displayName;
      }
      
      if (apiKey && apiKey !== profile?.credentials?.apiKey) {
        updates.credentials = { apiKey };
      }

      await apiClient.patch(`/profiles/${id}`, updates);
      router.push('/settings');
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
            <input
              type="password"
              id="apiKey"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter Steam API key (optional)"
            />
            <p className="text-xs text-gray-500 mt-1">
              Leave empty to keep existing key
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
