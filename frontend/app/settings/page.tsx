'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '../../services/apiClient';
import ProfileSyncControls from '../../components/ProfileSyncControls';
import SchedulerSettings from '../../components/SchedulerSettings';
import SyncSettings from '../../components/SyncSettings';
import Toast from '../../components/Toast';
import BackupProgressModal from '../../components/BackupProgressModal';
import RestoreProgressModal from '../../components/RestoreProgressModal';
import { ProgressPayload } from '../../components/ProgressIndicator';

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

interface SettingsState {
  // SteamGridDB API key (for image downloads)
  steamgrid_api_key?: string;
  // Scheduler
  scheduler_enabled?: string;
  scheduler_cron?: string;
  // Sync
  sync_batch_size?: string;
  sync_image_concurrency?: string;
}

interface ConfiguredState {
  steamgrid_api_key?: boolean;
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
  const [settings, setSettings] = useState<SettingsState>({});
  const [configured, setConfigured] = useState<ConfiguredState>({});
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showSteamGridApiKey, setShowSteamGridApiKey] = useState(false);
  
  // Toast state
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
    visible: boolean;
  }>({ message: '', type: 'info', visible: false });

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type, visible: true });
  };

  const hideToast = () => {
    setToast({ ...toast, visible: false });
  };
  
  // Backup/Restore status
  interface BackupStatus {
    current: { jobId: string; status: string; progress: number; message: string } | null;
    lastCompleted: { completedAt: string; downloadedAt?: string; jobId: string } | null;
    ready: boolean;
  }
  interface RestoreStatus {
    current: { jobId: string; status: string; progress: number; message: string } | null;
    lastCompleted: { completedAt: string; metadata?: any } | null;
  }
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
  const [restoreStatus, setRestoreStatus] = useState<RestoreStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  
  // Polling interval refs
  const [backupPollInterval, setBackupPollInterval] = useState<NodeJS.Timeout | null>(null);
  const [restorePollInterval, setRestorePollInterval] = useState<NodeJS.Timeout | null>(null);
  
  // Track last notified job IDs to prevent duplicate toasts (using refs for immediate updates)
  const lastBackupNotified = useRef<string | null>(null);
  const lastRestoreNotified = useRef<string | null>(null);

  // T065-T066: Progress modal state
  const [showBackupProgress, setShowBackupProgress] = useState(false);
  const [showRestoreProgress, setShowRestoreProgress] = useState(false);
  const [backupProgress, setBackupProgress] = useState<ProgressPayload | undefined>();
  const [restoreProgress, setRestoreProgress] = useState<ProgressPayload | undefined>();

  useEffect(() => {
    loadProfiles();
    loadSyncRuns();
    loadSettings();
    loadStatus().then((statusData) => {
      // If there's an active backup, start polling
      if (statusData?.backup?.current && !backupPollInterval) {
        console.log('[Settings] Found active backup on mount, starting poll');
        startBackupPolling();
      }
      
      // If there's an active restore, start polling
      if (statusData?.restore?.current && !restorePollInterval) {
        console.log('[Settings] Found active restore on mount, starting poll');
        startRestorePolling();
      }
    });

    // Cleanup polling on unmount
    return () => {
      if (backupPollInterval) {
        clearInterval(backupPollInterval);
      }
      if (restorePollInterval) {
        clearInterval(restorePollInterval);
      }
    };
  }, []);

  const loadProfiles = async () => {
    setLoading(true);

    try {
      const data = await apiClient.get<Profile[]>('/profiles');
      setProfiles(data);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load profiles', 'error');
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
      const { settings: allSettings } = await apiClient.getAllSettings();
      
      const settingsObj: SettingsState = {};
      const configuredObj: ConfiguredState = {};
      
      allSettings.forEach((setting) => {
        if (setting.isSecret) {
          // For secrets, don't populate value, just mark as configured
          configuredObj[setting.key as keyof ConfiguredState] = true;
          settingsObj[setting.key as keyof SettingsState] = '';
        } else {
          settingsObj[setting.key as keyof SettingsState] = setting.value;
        }
      });
      
      setSettings(settingsObj);
      setConfigured(configuredObj);
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  };

  const handleSettingChange = (key: keyof SettingsState, value: string) => {
    setSettings((prevSettings) => ({ ...prevSettings, [key]: value }));
  };

  const handleImageProvidersSettingsSave = async () => {
    try {
      // Only save if value is non-empty (user entered something)
      if (settings.steamgrid_api_key && settings.steamgrid_api_key.trim() !== '') {
        await apiClient.updateSetting('steamgrid_api_key', settings.steamgrid_api_key, 'image_provider');
        showToast('SteamGridDB API key saved successfully!', 'success');
        await loadSettings(); // Reload to get fresh configured state
      } else {
        showToast('Please enter a SteamGridDB API key', 'error');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save SteamGridDB API key', 'error');
    }
  };

  const handleSchedulerSettingsSave = async () => {
    try {
      if (settings.scheduler_enabled !== undefined) {
        await apiClient.updateSetting('scheduler_enabled', settings.scheduler_enabled, 'scheduler');
      }
      if (settings.scheduler_cron && settings.scheduler_cron.trim() !== '') {
        await apiClient.updateSetting('scheduler_cron', settings.scheduler_cron, 'scheduler');
      }

      showToast('Scheduler settings saved successfully!', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save scheduler settings', 'error');
    }
  };

  const handleSyncSettingsSave = async () => {
    try {
      if (settings.sync_batch_size !== undefined) {
        await apiClient.updateSetting('sync_batch_size', settings.sync_batch_size, 'sync');
      }
      if (settings.sync_image_concurrency !== undefined) {
        await apiClient.updateSetting('sync_image_concurrency', settings.sync_image_concurrency, 'sync');
      }

      showToast('Sync settings saved successfully!', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save sync settings', 'error');
    }
  };

  const handleDelete = async (profileId: string) => {
    try {
      await apiClient.delete(`/profiles/${profileId}`);
      setProfiles(profiles.filter((p) => p._id !== profileId));
      setDeleteConfirm(null);
      showToast('Profile deleted successfully', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to delete profile', 'error');
    }
  };

  const handleAddProfile = () => {
    router.push('/setup');
  };

  // Load backup/restore status from server
  const loadStatus = async () => {
    setStatusLoading(true);
    try {
      const response = await fetch('/api/backup/status');
      if (response.ok) {
        const data = await response.json();
        setBackupStatus(data.backup);
        setRestoreStatus(data.restore);
        return data; // Return status data for use in useEffect
      }
    } catch (err) {
      console.error('Failed to load backup/restore status:', err);
    } finally {
      setStatusLoading(false);
    }
    return null;
  };

  // Start polling for backup status
  const startBackupPolling = () => {
    // Clear existing interval if any
    if (backupPollInterval) {
      clearInterval(backupPollInterval);
    }

    // Use faster polling (1 second) for better progress visibility
    const interval = setInterval(async () => {
      const status = await loadStatus();
      
      // Stop polling when backup completes or fails
      if (!status?.backup?.current) {
        clearInterval(interval);
        setBackupPollInterval(null);
        
        // Only show toast if this is a new completed job
        if (status?.backup?.ready && status?.backup?.lastCompleted?.jobId) {
          const jobId = status.backup.lastCompleted.jobId;
          if (jobId !== lastBackupNotified.current) {
            showToast('Backup completed successfully!', 'success');
            lastBackupNotified.current = jobId;
          }
        }
      }
    }, 1000); // Poll every 1 second for better progress tracking
    
    setBackupPollInterval(interval);
  };

  // Start polling for restore status
  const startRestorePolling = () => {
    // Clear existing interval if any
    if (restorePollInterval) {
      clearInterval(restorePollInterval);
    }

    // Use faster polling (1 second) for better progress visibility
    const interval = setInterval(async () => {
      const status = await loadStatus();
      
      // Stop polling when restore completes or fails
      if (!status?.restore?.current) {
        clearInterval(interval);
        setRestorePollInterval(null);
        
        // Only show toast if this is a new completed job
        if (status?.restore?.lastCompleted?.completedAt) {
          const completedAt = status.restore.lastCompleted.completedAt;
          if (completedAt !== lastRestoreNotified.current) {
            showToast('Restore completed successfully!', 'success');
            lastRestoreNotified.current = completedAt;
            loadProfiles(); // Reload profiles after restore
          }
        }
      }
    }, 1000); // Poll every 1 second for better progress tracking
    
    setRestorePollInterval(interval);
  };

  // T065: Start new backup (async, no modal)
  const handleCreateBackup = async () => {
    try {
      const response = await fetch('/api/backup/start', {
        method: 'POST'
      });
      
      if (!response.ok) throw new Error('Failed to start backup');
      
      const { jobId } = await response.json();
      console.log('Backup started:', jobId);
      
      showToast('Backup started successfully', 'success');
      
      // Poll status to update the card
      await loadStatus();
      
      // Start polling using shared function
      startBackupPolling();
      
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to start backup', 'error');
    }
  };

  // Download ready backup with progress tracking
  const handleDownloadBackup = async () => {
    if (!backupStatus?.lastCompleted?.jobId) return;
    
    try {
      const jobId = backupStatus.lastCompleted.jobId;
      
      // Show progress modal
      setShowBackupProgress(true);
      setBackupProgress({
        status: 'downloading',
        progress: {
          current: 0,
          total: 100,
          percentage: 0
        },
        currentStep: 'Downloading backup file...',
        details: {}
      });
      
      // Use XMLHttpRequest for real download progress tracking (same as restore upload)
      const blob = await new Promise<Blob>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.responseType = 'blob';
        
        // Track download progress
        xhr.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percentage = Math.round((e.loaded / e.total) * 100);
            setBackupProgress({
              status: 'downloading',
              progress: {
                current: e.loaded,
                total: e.total,
                percentage: percentage
              },
              currentStep: 'Downloading backup file...',
              details: {
                fileSize: e.total
              }
            });
          }
        });
        
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(xhr.response as Blob);
          } else {
            reject(new Error('Failed to download backup'));
          }
        });
        
        xhr.addEventListener('error', () => {
          reject(new Error('Download failed'));
        });
        
        xhr.open('GET', `/api/backup/download/${jobId}`);
        xhr.send();
      });
      
      // Trigger download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cpak-backup-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      // Download complete - update modal
      setBackupProgress({
        status: 'downloading',
        progress: {
          current: blob.size,
          total: blob.size,
          percentage: 100
        },
        currentStep: 'Download complete!',
        details: {
          fileSize: blob.size
        }
      });
      
      // Close modal after brief delay, then show toast
      setTimeout(() => {
        setShowBackupProgress(false);
        showToast('Backup downloaded successfully', 'success');
      }, 1000);
      
      // Refresh status to show download timestamp
      await loadStatus();
    } catch (err) {
      setShowBackupProgress(false);
      showToast(err instanceof Error ? err.message : 'Failed to download backup', 'error');
    }
  };

  // T066: Start restore - show modal only for upload progress
  const handleRestoreBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Show progress modal only for upload
    setShowRestoreProgress(true);
    setRestoreProgress({
      status: 'uploading',
      progress: {
        current: 0,
        total: file.size,
        percentage: 0
      },
      currentStep: 'Uploading backup file...',
      details: {
        fileSize: file.size
      }
    });

    try {
      const formData = new FormData();
      formData.append('file', file);

      // Use XMLHttpRequest for real upload progress tracking
      const jobId = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        // Track upload progress
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percentage = Math.round((e.loaded / e.total) * 100);
            setRestoreProgress({
              status: 'uploading',
              progress: {
                current: e.loaded,
                total: e.total,
                percentage: percentage
              },
              currentStep: 'Uploading backup file...',
              details: {
                fileSize: file.size
              }
            });
          }
        });
        
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);
              resolve(response.jobId);
            } catch (err) {
              reject(new Error('Invalid response from server'));
            }
          } else {
            reject(new Error(`Failed to start restore: ${xhr.responseText}`));
          }
        });
        
        xhr.addEventListener('error', () => {
          reject(new Error('Upload failed'));
        });
        
        xhr.open('POST', '/api/backup/restore/start');
        xhr.send(formData);
      });

      console.log('Restore started:', jobId);
      
      // Upload complete - close modal
      setRestoreProgress({
        status: 'uploading',
        progress: {
          current: file.size,
          total: file.size,
          percentage: 100
        },
        currentStep: 'Upload complete, starting restore...',
        details: {
          fileSize: file.size
        }
      });
      
      // Close modal after brief delay, then show toast
      setTimeout(() => {
        setShowRestoreProgress(false);
        showToast('File uploaded, restore started', 'success');
      }, 1000);
      
      // Poll status to update the card
      await loadStatus();
      
      // Start polling using shared function
      startRestorePolling();
      
    } catch (err) {
      setShowRestoreProgress(false);
      showToast(err instanceof Error ? err.message : 'Failed to start restore', 'error');
    } finally {
      event.target.value = '';
    }
  };

  // Cancel backup
  const handleCancelBackup = async () => {
    if (!backupStatus?.current?.jobId) return;

    try {
      const jobId = backupStatus.current.jobId;
      
      // Stop polling before cancelling to prevent race condition with completion toast
      if (backupPollInterval) {
        clearInterval(backupPollInterval);
        setBackupPollInterval(null);
      }
      
      const response = await fetch(`/api/backup/cancel/${jobId}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to cancel backup');

      // Refresh status
      await loadStatus();
      
      showToast('Backup cancelled successfully', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to cancel backup', 'error');
    }
  };

  // Cancel restore
  const handleCancelRestore = async () => {
    if (!restoreStatus?.current?.jobId) return;

    try {
      const jobId = restoreStatus.current.jobId;
      
      // Stop polling before cancelling to prevent race condition with completion toast
      if (restorePollInterval) {
        clearInterval(restorePollInterval);
        setRestorePollInterval(null);
      }
      
      const response = await fetch(`/api/backup/restore/cancel/${jobId}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to cancel restore');

      // Refresh status
      await loadStatus();
      
      showToast('Restore cancelled successfully', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to cancel restore', 'error');
    }
  };

  // Format relative time like sync does
  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
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

      {/* Image Providers */}
      <div className="bg-gray-900 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Image Providers</h2>
        
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
                type={showSteamGridApiKey ? "text" : "password"}
                value={settings.steamgrid_api_key || ''}
                onChange={(e) => handleSettingChange('steamgrid_api_key', e.target.value)}
                placeholder={configured.steamgrid_api_key ? "Enter new API key" : "SteamGridDB API key"}
                className="w-full px-4 py-2 pr-24 bg-gray-900 border border-gray-600 rounded focus:outline-none focus:border-blue-500"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                {configured.steamgrid_api_key && !settings.steamgrid_api_key && (
                  <div className="flex items-center gap-1 text-green-400" title="API key is configured">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-xs font-medium">Configured</span>
                  </div>
                )}
                {settings.steamgrid_api_key && (
                  <button
                    type="button"
                    onClick={() => setShowSteamGridApiKey(!showSteamGridApiKey)}
                    className="text-gray-400 hover:text-gray-200"
                    aria-label={showSteamGridApiKey ? "Hide API key" : "Show API key"}
                  >
                    {showSteamGridApiKey ? (
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
              Get your free API key from{' '}
              <a 
                href="https://www.steamgriddb.com/profile/preferences/api" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline"
              >
                steamgriddb.com
              </a>
              . Your API key is encrypted and never displayed. Leave empty to keep your existing key unchanged. After saving your API key, manually trigger a sync for each profile to download missing game images.
            </p>
          </div>

          <button
            onClick={handleImageProvidersSettingsSave}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded font-medium transition"
          >
            Save Image Settings
          </button>
        </div>
      </div>

      {/* Settings Components */}
      <div className="space-y-6 mb-6">
        {/* Scheduler Settings */}
        <SchedulerSettings
          values={{
            scheduler_enabled: settings.scheduler_enabled || 'false',
            scheduler_cron: settings.scheduler_cron || '0 3 * * *'
          }}
          onChange={handleSettingChange}
          onSave={handleSchedulerSettingsSave}
        />

        {/* Sync Performance Settings */}
        <SyncSettings
          values={{
            sync_batch_size: settings.sync_batch_size || '10',
            sync_image_concurrency: settings.sync_image_concurrency || '5'
          }}
          onChange={handleSettingChange}
          onSave={handleSyncSettingsSave}
        />
      </div>

      {/* Backup & Restore Section */}
      <div className="bg-gray-900 rounded-lg p-6 mb-6">
        <div className="mb-4">
          <h2 className="text-xl font-semibold">Backup & Restore</h2>
        </div>
        
        <div className="space-y-4">
          {/* Backup Section */}
          <div>
            <h3 className="text-sm font-medium mb-2">Backup</h3>
            <p className="text-sm text-gray-400 mb-3">
              Create a complete backup including all data (profiles, games, achievements, settings) and images.
            </p>
            
            {/* Current backup in progress */}
            {backupStatus?.current && (
              <div className="mb-3 p-3 bg-blue-900/20 border border-blue-500/30 rounded">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-blue-400 font-medium">{backupStatus.current.message}</span>
                  <span className="text-blue-400 font-bold">{backupStatus.current.progress}%</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${backupStatus.current.progress}%` }}
                  ></div>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-gray-400">Backup is running in the background. You can check back later.</p>
                  <button
                    onClick={handleCancelBackup}
                    className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm font-medium transition flex items-center gap-1"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            
            {/* Ready to download */}
            {backupStatus?.ready && !backupStatus?.current && (
              <div className="mb-3">
                <div className="flex items-center gap-2 text-sm text-green-400 mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-medium">Backup ready for download</span>
                </div>
                {backupStatus.lastCompleted && (
                  <p className="text-xs text-gray-400 mb-3">
                    Created: {formatRelativeTime(backupStatus.lastCompleted.completedAt)}
                    {backupStatus.lastCompleted.downloadedAt && (
                      <span> • Downloaded: {formatRelativeTime(backupStatus.lastCompleted.downloadedAt)}</span>
                    )}
                  </p>
                )}
                <button
                  onClick={handleDownloadBackup}
                  disabled={!!restoreStatus?.current}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded font-medium transition flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Download Backup
                </button>
              </div>
            )}
            
            {/* Last download info (no backup ready) */}
            {!backupStatus?.ready && !backupStatus?.current && backupStatus?.lastCompleted?.downloadedAt && (
              <p className="text-xs text-gray-400 mb-3">
                Last backup downloaded: {formatRelativeTime(backupStatus.lastCompleted.downloadedAt)}
              </p>
            )}
            
            {/* Create backup button */}
            {!backupStatus?.current && (
              <button
                onClick={handleCreateBackup}
                disabled={!!backupStatus?.current || !!restoreStatus?.current}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded font-medium transition flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Create Backup
              </button>
            )}
          </div>

          {/* Restore Section */}
          <div className="border-t border-gray-700 pt-4">
            <h3 className="text-sm font-medium mb-2">Restore</h3>
            <p className="text-sm text-gray-400 mb-3">
              Upload a backup file to restore all data and images. This will merge with existing data.
            </p>
            
            {/* Current restore in progress */}
            {restoreStatus?.current && (
              <div className="mb-3 p-3 bg-orange-900/20 border border-orange-500/30 rounded">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-orange-400 font-medium">{restoreStatus.current.message}</span>
                  <span className="text-orange-400 font-bold">{restoreStatus.current.progress}%</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div 
                    className="bg-orange-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${restoreStatus.current.progress}%` }}
                  ></div>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-gray-400">Restore is running in the background. You can check back later.</p>
                  <button
                    onClick={handleCancelRestore}
                    className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm font-medium transition flex items-center gap-1"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            
            {/* Last restore info */}
            {restoreStatus?.lastCompleted && !restoreStatus?.current && (
              <div className="mb-3 text-sm">
                <div className="flex items-center gap-2 text-green-400 mb-1">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-medium">Last restore: {formatRelativeTime(restoreStatus.lastCompleted.completedAt)}</span>
                </div>
                {restoreStatus.lastCompleted.metadata && (
                  <p className="text-xs text-gray-400 ml-7">
                    Restored {restoreStatus.lastCompleted.metadata.settings || 0} settings, {restoreStatus.lastCompleted.metadata.profiles || 0} profiles, {restoreStatus.lastCompleted.metadata.games || 0} games, {restoreStatus.lastCompleted.metadata.achievements || 0} achievements, and {restoreStatus.lastCompleted.metadata.images || 0} images
                  </p>
                )}
              </div>
            )}
            
            {/* Upload button */}
            {!restoreStatus?.current && (
              <div className="flex items-center gap-3">
                <label className={`px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded font-medium transition flex items-center gap-2 ${(backupStatus?.current || restoreStatus?.current) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  Upload Backup File
                  <input
                    type="file"
                    accept=".zip"
                    onChange={handleRestoreBackup}
                    disabled={!!backupStatus?.current || !!restoreStatus?.current}
                    className="hidden"
                  />
                </label>
                <span className="text-xs text-gray-500">.zip files only</span>
              </div>
            )}
            
            <p className="text-xs text-yellow-500 mt-2">
              ⚠️ Warning: Restoring a backup will merge data with existing records. Consider creating a backup first.
            </p>
          </div>
        </div>
      </div>

      {/* Profiles Section */}
      <div className="bg-gray-900 rounded-lg p-6 mb-6">
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
              className="bg-gray-800 rounded-lg p-6"
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <span
                      className="px-3 py-1 rounded-full text-sm font-semibold whitespace-nowrap"
                      style={{
                        backgroundColor: `${platformColors[profile.platform]}20`,
                        color: platformColors[profile.platform],
                        border: `1px solid ${platformColors[profile.platform]}`,
                      }}
                    >
                      {platformNames[profile.platform]}
                    </span>
                    <h3 className="text-xl font-semibold break-words">{profile.displayName}</h3>
                  </div>
                  <p className="text-sm text-gray-400 break-all">Profile ID: {profile.profileId}</p>
                  <p className="text-xs text-gray-500 mt-2">
                    Added: {new Date(profile.createdAt).toLocaleDateString()}
                  </p>
                </div>
                
                <div className="flex gap-2 flex-shrink-0 sm:self-start">
                  <button
                    onClick={() => router.push(`/settings/edit/${profile._id}`)}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded font-medium transition whitespace-nowrap"
                  >
                    Edit
                  </button>
                  {deleteConfirm === profile._id ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDelete(profile._id)}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded font-medium transition whitespace-nowrap"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded font-medium transition whitespace-nowrap"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(profile._id)}
                      className="px-4 py-2 bg-red-900/50 hover:bg-red-900/70 border border-red-500/50 rounded font-medium transition whitespace-nowrap"
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
                lastSync={syncRuns[profile._id]}
                onSyncComplete={loadSyncRuns}
                onToast={showToast}
                disabled={!!backupStatus?.current || !!restoreStatus?.current}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Toast Notification */}
      {toast.visible && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={hideToast}
        />
      )}

      {/* T065: Backup Progress Modal */}
      <BackupProgressModal
        isOpen={showBackupProgress}
        onClose={() => {
          setShowBackupProgress(false);
        }}
        currentProgress={backupProgress}
      />

      {/* T066: Restore Progress Modal */}
      <RestoreProgressModal
        isOpen={showRestoreProgress}
        onClose={() => {
          setShowRestoreProgress(false);
        }}
        currentProgress={restoreProgress}
      />
    </div>
  );
}
