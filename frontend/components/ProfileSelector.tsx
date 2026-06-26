'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '../services/apiClient';

interface Profile {
  _id: string;
  platform: 'steam' | 'xbox' | 'playstation';
  profileId: string;
  displayName: string;
  isDefault?: boolean;
}

interface ProfileSelectorProps {
  platform: 'steam' | 'xbox' | 'playstation';
  selectedProfileId?: string;
  onSelectProfile: (profileId: string) => void;
  onError?: (error: string) => void;
  onProfilesLoaded?: (count: number) => void;
  /** Increment to force a profile data reload (e.g. after sync completes) */
  reloadTrigger?: number;
}

export default function ProfileSelector({
  platform,
  selectedProfileId,
  onSelectProfile,
  onError,
  onProfilesLoaded,
  reloadTrigger,
}: ProfileSelectorProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    loadProfiles();
  }, [platform, reloadTrigger]);

  const loadProfiles = async () => {
    setLoading(true);
    setError('');
    try {
      const allProfiles = await apiClient.get<Profile[]>('/profiles');
      const platformProfiles = allProfiles.filter((p) => p.platform === platform);
      setProfiles(platformProfiles);

      if (onProfilesLoaded) {
        onProfilesLoaded(platformProfiles.length);
      }

      // Auto-select: prefer the default profile, then fall back to first
      if (!selectedProfileId && platformProfiles.length > 0) {
        const defaultProfile = platformProfiles.find((p) => p.isDefault);
        onSelectProfile(defaultProfile ? defaultProfile._id : platformProfiles[0]._id);
      }
    } catch (error) {
      console.error('Failed to load profiles:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to load profiles';
      setError(errorMessage);
      if (onError) {
        onError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const setAsDefault = async (profileId: string) => {
    try {
      await apiClient.patch(`/profiles/${profileId}/default`, {});
      // Update local state
      setProfiles((prev) =>
        prev.map((p) => ({ ...p, isDefault: p._id === profileId }))
      );
    } catch (err) {
      console.error('Failed to set default profile:', err);
    }
  };

  if (loading) {
    return <div className="text-gray-400 text-sm">Loading profiles...</div>;
  }

  if (error) {
    return null; // Let parent handle error display
  }

  if (profiles.length === 0) {
    return null;
  }

  if (profiles.length === 1) {
    // Show profile name but no dropdown when only one profile
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-400">Profile:</span>
        <span className="text-sm text-gray-200 font-medium">{profiles[0].displayName}</span>
      </div>
    );
  }

  const selectedProfile = profiles.find((p) => p._id === selectedProfileId);
  const isSelectedDefault = selectedProfile?.isDefault;

  return (
    <div className="flex items-center gap-2">
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
      {selectedProfileId && !isSelectedDefault && (
        <button
          onClick={() => setAsDefault(selectedProfileId)}
          className="w-5 text-center text-gray-500 hover:text-yellow-400 transition"
          title="Set as default profile"
        >
          ☆
        </button>
      )}
      {selectedProfileId && isSelectedDefault && (
        <span className="w-5 text-center text-yellow-400" title="Default profile">★</span>
      )}
    </div>
  );
}
