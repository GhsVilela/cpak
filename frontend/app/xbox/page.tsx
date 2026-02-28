'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiClient } from '../../services/apiClient';
import ProfileSelector from '../../components/ProfileSelector';
import ProfileSyncControls from '../../components/ProfileSyncControls';
import GameGrid from '../../components/GameGrid';
import Toast from '../../components/Toast';

interface Game {
  _id: string;
  gameId: string;
  title: string;
  platform: 'steam' | 'xbox' | 'playstation';
  achievementsTotal: number;
  achievementsUnlocked: number;
  completionPercent: number;
  imagePath?: string;
  profileId: string;
  devices?: string[];
}

interface GamesResponse {
  data: Game[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

interface XboxProfile {
  _id: string;
  profileId: string;
  displayName: string;
  platform: string;
  credentials?: {
    expiresAt?: string;
    tokenType?: string;
  };
}

const GENERATION_FILTERS = [
  { value: '', label: 'All Generations' },
  { value: 'XboxSeries', label: 'Xbox Series X|S' },
  { value: 'XboxOne', label: 'Xbox One' },
  { value: 'Xbox360', label: 'Xbox 360' },
  { value: 'PC', label: 'PC' },
];

function XboxPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [onlyCompleted, setOnlyCompleted] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [sortBy, setSortBy] = useState<string>('completionPercent');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(100);
  const [reloadTrigger, setReloadTrigger] = useState(0);
  const [generationFilter, setGenerationFilter] = useState('');
  const [selectedProfileId, setSelectedProfileId] = useState<string | undefined>(
    searchParams.get('profileId') || undefined
  );
  const [selectedProfile, setSelectedProfile] = useState<XboxProfile | null>(null);
  const [reAuthUrl, setReAuthUrl] = useState('');

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
  };

  // Load selected profile details (to check token expiry)
  useEffect(() => {
    if (!selectedProfileId) return;
    apiClient.get<XboxProfile[]>('/profiles?platform=xbox').then((profiles) => {
      const found = profiles.find((p) => p._id === selectedProfileId);
      setSelectedProfile(found ?? null);
    }).catch(() => {/* ignore */});
  }, [selectedProfileId]);

  // Check if token is expired (T025 re-auth banner)
  const tokenExpired =
    selectedProfile?.credentials?.expiresAt &&
    new Date(selectedProfile.credentials.expiresAt) < new Date();

  // Fetch re-auth URL when token is expired
  useEffect(() => {
    if (!tokenExpired) return;
    apiClient.get<{ url: string }>('/auth/xbox/url').then((data) => {
      setReAuthUrl(data.url);
    }).catch(() => {/* ignore */});
  }, [tokenExpired]);

  useEffect(() => {
    if (selectedProfileId) {
      loadGames();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlyCompleted, selectedProfileId, sortBy, sortOrder, currentPage, itemsPerPage, reloadTrigger, generationFilter]);

  const handleProfileChange = (profileId: string) => {
    setSelectedProfileId(profileId);
    router.push(`/xbox?profileId=${profileId}`, { scroll: false });
  };

  const handleProfileError = (errorMessage: string) => {
    setError(errorMessage);
  };

  const handleItemsPerPageChange = async (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1);
    await loadGames({ page: 1, perPage: newItemsPerPage });
  };

  const loadGames = async (overrides?: { page?: number; perPage?: number }) => {
    if (!selectedProfileId) return;

    setLoading(true);
    setError('');

    const page = overrides?.page ?? currentPage;
    const perPage = overrides?.perPage ?? itemsPerPage;

    try {
      const params = new URLSearchParams({
        platform: 'xbox',
        profileId: selectedProfileId,
        limit: perPage.toString(),
        offset: ((page - 1) * perPage).toString(),
        sortBy: sortBy,
        sortOrder: sortOrder,
      });

      if (onlyCompleted) {
        params.append('onlyCompleted', 'true');
      }
      if (generationFilter) {
        params.append('device', generationFilter);
      }

      const response = await apiClient.get<GamesResponse>(`/games?${params.toString()}`);
      setGames(response.data);
      setTotalCount(response.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load games');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-[var(--xbox-accent)] mb-4">Xbox Games</h1>

        {/* Profile selector */}
        <div className="mb-4">
          <ProfileSelector
            platform="xbox"
            selectedProfileId={selectedProfileId}
            onSelectProfile={handleProfileChange}
            onError={handleProfileError}
          />
        </div>

        {/* Re-auth banner (T025) */}
        {tokenExpired && (
          <div className="flex items-center gap-4 bg-yellow-900/30 border border-yellow-600 text-yellow-300 px-4 py-3 rounded mb-4">
            <span>⚠️ Your Xbox token has expired. Re-connect your account to resume syncing.</span>
            {reAuthUrl && (
              <a
                href={reAuthUrl}
                className="underline font-semibold whitespace-nowrap hover:text-yellow-100"
              >
                Re-connect Xbox
              </a>
            )}
          </div>
        )}

        {/* Sync controls + filters */}
        {selectedProfileId && (
          <div className="flex items-center gap-4 flex-wrap">
            <ProfileSyncControls
              profileId={selectedProfileId}
              platform="xbox"
              onSyncComplete={() => setReloadTrigger((t) => t + 1)}
              onToast={(msg, type) => showToast(msg, type)}
            />

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={onlyCompleted}
                onChange={(e) => setOnlyCompleted(e.target.checked)}
                className="w-4 h-4"
              />
              <span>100% Only</span>
            </label>

            {/* Generation filter */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-400">Generation:</label>
              <select
                value={generationFilter}
                onChange={(e) => setGenerationFilter(e.target.value)}
                className="px-3 py-1 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-[var(--xbox-accent)]"
              >
                {GENERATION_FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-400">Sort:</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-3 py-1 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-[var(--xbox-accent)]"
              >
                <option value="title">Title</option>
                <option value="completionPercent">Completion %</option>
                <option value="achievementsTotal">Total Achievements</option>
                <option value="lastSyncedAt">Last Synced</option>
              </select>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                className="px-3 py-1 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-[var(--xbox-accent)]"
              >
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-500 text-red-400 px-4 py-2 rounded mb-4">
          {error}
        </div>
      )}

      {/* Pagination info */}
      {totalCount > 0 && (
        <div className="mb-4 flex items-center justify-between flex-wrap gap-4">
          <p className="text-sm text-gray-400">
            Showing {((currentPage - 1) * itemsPerPage) + 1}{'-'}{Math.min(currentPage * itemsPerPage, totalCount)} of {totalCount} games
          </p>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-400">Per page:</label>
              <select
                value={itemsPerPage}
                onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
                className="px-3 py-1 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-[var(--xbox-accent)]"
              >
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="200">200</option>
                <option value="500">500</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-gray-800 border border-gray-700 rounded text-sm hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-gray-400">
                Page {currentPage} of {Math.ceil(totalCount / itemsPerPage)}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(Math.ceil(totalCount / itemsPerPage), p + 1))}
                disabled={currentPage >= Math.ceil(totalCount / itemsPerPage)}
                className="px-3 py-1 bg-gray-800 border border-gray-700 rounded text-sm hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Game grid */}
      <GameGrid
        games={games}
        loading={loading}
        emptyMessage={
          !selectedProfileId
            ? 'Select an Xbox profile to view games'
            : onlyCompleted
            ? 'No 100% completed Xbox games yet'
            : 'No Xbox games found. Try syncing your profile.'
        }
      />

      {/* Toast notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

export default function XboxPage() {
  return (
    <Suspense fallback={<div className="text-gray-400 py-8">Loading...</div>}>
      <XboxPageContent />
    </Suspense>
  );
}
