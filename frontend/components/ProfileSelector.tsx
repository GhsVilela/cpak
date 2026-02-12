'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '../services/apiClient';

interface Profile {
  _id: string;
  platform: 'steam' | 'xbox' | 'playstation';
  profileId: string;
  displayName: string;
}

interface ProfileSelectorProps {
  platform: 'steam' | 'xbox' | 'playstation';
  selectedProfileId?: string;
  onSelectProfile: (profileId: string) => void;
}

export default function ProfileSelector({
  platform,
  selectedProfileId,
  onSelectProfile,
}: ProfileSelectorProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProfiles();
  }, [platform]);

  const loadProfiles = async () => {
    setLoading(true);
    try {
      const allProfiles = await apiClient.get<Profile[]>('/profiles');
      const platformProfiles = allProfiles.filter((p) => p.platform === platform);
      setProfiles(platformProfiles);

      // Auto-select first profile if none selected
      if (!selectedProfileId && platformProfiles.length > 0) {
        onSelectProfile(platformProfiles[0]._id);
      }
    } catch (error) {
      console.error('Failed to load profiles:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-gray-400 text-sm">Loading profiles...</div>;
  }

  if (profiles.length === 0) {
    return (
      <div className="text-gray-400 text-sm">
        No {platform} profiles configured. <a href="/setup" className="text-blue-400 hover:underline">Add one</a>
      </div>
    );
  }

  if (profiles.length === 1) {
    // Don't show selector if only one profile
    return null;
  }

  return (
    <div className="flex items-center gap-3">
      <label htmlFor="profile-select" className="text-sm text-gray-400">
        Profile:
      </label>
      <select
        id="profile-select"
        value={selectedProfileId || ''}
        onChange={(e) => onSelectProfile(e.target.value)}
        className="px-3 py-1 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {profiles.map((profile) => (
          <option key={profile._id} value={profile._id}>
            {profile.displayName}
          </option>
        ))}
      </select>
    </div>
  );
}
