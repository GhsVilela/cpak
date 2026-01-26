'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '../../services/apiClient';
import ProfileSyncControls from '../../components/ProfileSyncControls';

interface Profile {
  _id: string;
  platform: 'steam' | 'xbox' | 'playstation';
  profileId: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

interface SyncRun {
  _id: string;
  profileId: string | { _id: string }; // Can be string or populated object
  completedAt: string;
  status: 'success' | 'failed';
}

const platformColors = {
  steam: 'var(--steam-accent)',
  xbox: '#107c10',
  playstation: '#003791',
};

const platformNames = {
  steam: 'Steam',
  xbox: 'Xbox',
  playstation: 'PlayStation',
};

export default function SettingsPage() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [syncRuns, setSyncRuns] = useState<Record<string, SyncRun>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    loadProfiles();
    loadSyncRuns();
  }, []);

  const loadProfiles = async () => {
    setLoading(true);
    setError('');

    try {
      const data = await apiClient.get<Profile[]>('/profiles');
      setProfiles(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profiles');
    } finally {
      setLoading(false);
    }
  };

  const loadSyncRuns = async () => {
    try {
      const runs = await apiClient.get<SyncRun[]>('/sync/runs?limit=100');
      const runsByProfile: Record<string, SyncRun> = {};
      runs.forEach((run) => {
        // Group by the profile's MongoDB _id (run.profileId._id if populated, or run.profileId if string)
        const profileId = typeof run.profileId === 'string' ? run.profileId : (run.profileId as any)._id;
        if (!runsByProfile[profileId]) {
          runsByProfile[profileId] = run;
        }
      });
      setSyncRuns(runsByProfile);
    } catch (err) {
      console.error('Failed to load sync runs:', err);
    }
  };

  const handleDelete = async (profileId: string) => {
    try {
      await apiClient.delete(`/profiles/${profileId}`);
      setProfiles(profiles.filter((p) => p._id !== profileId));
      setDeleteConfirm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete profile');
    }
  };

  const handleAddProfile = () => {
    router.push('/setup');
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Settings</h1>
        <button
          onClick={handleAddProfile}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded font-medium transition"
        >
          + Add Profile
        </button>
      </div>

      {loading && <p>Loading profiles...</p>}

      {error && (
        <div className="bg-red-900/20 border border-red-500 text-red-400 px-4 py-2 rounded mb-4">
          {error}
        </div>
      )}

      {!loading && profiles.length === 0 && (
        <div className="text-gray-400 text-center py-12">
          <p>No profiles configured.</p>
          <button
            onClick={handleAddProfile}
            className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded font-medium transition"
          >
            Add Your First Profile
          </button>
        </div>
      )}

      <div className="space-y-4">
        {profiles.map((profile) => (
          <div
            key={profile._id}
            className="bg-gray-800 border border-gray-700 rounded-lg p-6"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span
                    className="px-3 py-1 rounded-full text-sm font-semibold"
                    style={{
                      backgroundColor: `${platformColors[profile.platform]}20`,
                      color: platformColors[profile.platform],
                      border: `1px solid ${platformColors[profile.platform]}`,
                    }}
                  >
                    {platformNames[profile.platform]}
                  </span>
                  <h3 className="text-xl font-semibold">{profile.displayName}</h3>
                </div>
                <p className="text-sm text-gray-400">Profile ID: {profile.profileId}</p>
                <p className="text-xs text-gray-500 mt-2">
                  Added: {new Date(profile.createdAt).toLocaleDateString()}
                </p>
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={() => router.push(`/settings/edit/${profile._id}`)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded font-medium transition"
                >
                  Edit
                </button>
                {deleteConfirm === profile._id ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDelete(profile._id)}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded font-medium transition"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded font-medium transition"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirm(profile._id)}
                    className="px-4 py-2 bg-red-900/50 hover:bg-red-900/70 border border-red-500/50 rounded font-medium transition"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>

            {/* Sync Controls */}
            <ProfileSyncControls
              profileId={profile._id}
              platform={profile.platform}
              displayName={profile.displayName}
              lastSync={syncRuns[profile._id]}
              onSyncComplete={loadSyncRuns}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
