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

interface GlobalSettings {
  _id: string;
  steamGridApiKey?: string;
  schedulerEnabled?: boolean;
  schedulerCron?: string;
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

const getCronDescription = (cron: string): string => {
  if (!cron) return '';
  
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return 'Invalid cron expression';
  
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  
  // Common patterns
  if (cron === '0 3 * * *') return 'Runs every day at 3:00 AM';
  if (cron === '0 0 * * *') return 'Runs every day at midnight';
  if (cron === '0 */6 * * *') return 'Runs every 6 hours';
  if (cron === '0 * * * *') return 'Runs every hour';
  if (cron === '*/30 * * * *') return 'Runs every 30 minutes';
  if (cron === '0 0 * * 0') return 'Runs every Sunday at midnight';
  if (cron === '0 0 1 * *') return 'Runs on the 1st day of every month at midnight';
  
  // Build description
  let desc = 'Runs ';
  
  // Day of week (0-6, Sunday=0)
  if (dayOfWeek !== '*') {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayNum = parseInt(dayOfWeek);
    desc += `every ${days[dayNum]} `;
  } else if (dayOfMonth !== '*') {
    desc += `on day ${dayOfMonth} of every month `;
  } else {
    desc += 'every day ';
  }
  
  // Hour and minute
  if (hour !== '*' && minute !== '*') {
    const h = parseInt(hour);
    const m = parseInt(minute);
    const period = h >= 12 ? 'PM' : 'AM';
    const displayHour = h > 12 ? h - 12 : h === 0 ? 12 : h;
    desc += `at ${displayHour}:${m.toString().padStart(2, '0')} ${period}`;
  } else if (hour !== '*') {
    desc += `at hour ${hour}`;
  } else if (minute !== '*') {
    desc += `at minute ${minute} of every hour`;
  }
  
  return desc;
};

export default function SettingsPage() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [syncRuns, setSyncRuns] = useState<Record<string, SyncRun>>({});
  const [settings, setSettings] = useState<GlobalSettings>({ 
    _id: 'global',
    schedulerEnabled: false,
    schedulerCron: '0 3 * * *'
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    loadProfiles();
    loadSyncRuns();
    loadSettings();
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

  const loadSettings = async () => {
    try {
      const data = await apiClient.get<GlobalSettings>('/settings');
      setSettings(data);
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  };

  const handleSaveSettings = async () => {
    setSaveMessage('');
    setError('');
    
    try {
      await apiClient.put('/settings', settings);
      setSaveMessage('Settings saved successfully!');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
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

      {saveMessage && (
        <div className="bg-green-900/20 border border-green-500 text-green-400 px-4 py-2 rounded mb-4">
          {saveMessage}
        </div>
      )}

      {/* Global Configuration */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Global Configuration</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              SteamGridDB API Key
              <span className="text-gray-400 font-normal ml-2">(Optional)</span>
            </label>
            <p className="text-sm text-gray-400 mb-2">
              SteamGridDB provides game cover images as a fallback when Steam CDN images are unavailable.
            </p>
            <div className="relative">
              <input
                type={showApiKey ? "text" : "password"}
                value={settings.steamGridApiKey || ''}
                onChange={(e) => setSettings({ ...settings, steamGridApiKey: e.target.value })}
                placeholder="Enter your SteamGridDB API key"
                className="w-full px-4 py-2 pr-12 bg-gray-900 border border-gray-600 rounded focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
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
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Get your free API key from{' '}
              <a 
                href="https://www.steamgriddb.com/profile/preferences/api" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline"
              >
                steamgriddb.com
              </a>
              . After saving your API key, manually trigger a sync for each profile to start download missing game images and also fix image proportions with more suitable images.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Automatic Sync Scheduler
              <span className="text-gray-400 font-normal ml-2">(Optional)</span>
            </label>
            <p className="text-sm text-gray-400 mb-3">
              Automatically sync all profiles on a schedule. Configure when syncs should run using a cron expression.
            </p>
            
            <div className="space-y-3">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={settings.schedulerEnabled || false}
                  onChange={(e) => setSettings({ ...settings, schedulerEnabled: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-900 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-800"
                />
                <span className="text-sm">Enable automatic sync scheduler</span>
              </label>
              
              {settings.schedulerEnabled && (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Cron Expression
                  </label>
                  <input
                    type="text"
                    value={settings.schedulerCron || '0 3 * * *'}
                    onChange={(e) => setSettings({ ...settings, schedulerCron: e.target.value })}
                    placeholder="0 3 * * *"
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded focus:outline-none focus:border-blue-500 font-mono text-sm"
                  />
                  <p className="text-sm text-blue-400 mt-2">
                    {getCronDescription(settings.schedulerCron || '0 3 * * *')}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Need help with cron expressions? Visit{' '}
                    <a 
                      href="https://crontab.guru" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline"
                    >
                      crontab.guru
                    </a>
                    {' '}for examples and explanations.
                  </p>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={handleSaveSettings}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded font-medium transition"
          >
            Save Settings
          </button>
        </div>
      </div>

      {/* Profiles Section */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-4">Profiles</h2>

        {!loading && profiles.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-400">No profiles configured.</p>
            <button
              onClick={handleAddProfile}
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded font-medium transition text-white"
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
    </div>
  );
}
