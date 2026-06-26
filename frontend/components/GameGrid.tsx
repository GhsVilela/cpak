'use client';

import { useState } from 'react';
import GameTile from './GameTile';
import GameListItem from './GameListItem';
import GameHeroCard from './GameHeroCard';
import GameEditModal from './GameEditModal';
import { apiClient } from '../services/apiClient';
import type { ViewMode } from './ViewModeSelector';

interface Game {
  _id: string;
  gameId: string;
  title: string;
  customTitle?: string;
  platform: 'steam' | 'xbox' | 'playstation';
  achievementsTotal: number;
  achievementsUnlocked: number;
  completionPercent: number;
  capsuleImagePath?: string;
  iconImagePath?: string;
  heroImagePath?: string;
  profileId: string;
  currentGamerscore?: number;
  maxGamerscore?: number;
  trophyBronze?: number;
  trophySilver?: number;
  trophyGold?: number;
  trophyPlatinum?: number;
}

interface GameGridProps {
  games: Game[];
  loading?: boolean;
  emptyMessage?: string;
  viewMode?: ViewMode;
  onGamesUpdated?: () => void;
}

export default function GameGrid({ games, loading = false, emptyMessage = 'No games found', viewMode = 'capsule', onGamesUpdated }: GameGridProps) {
  const [editingGame, setEditingGame] = useState<Game | null>(null);

  const handleSave = async (updates: { customTitle?: string | null; images?: { type: string; file: File }[] }) => {
    if (!editingGame) return;

    if (updates.customTitle !== undefined) {
      await apiClient.patch(`/games/${editingGame._id}`, { customTitle: updates.customTitle });
    }

    if (updates.images) {
      for (const img of updates.images) {
        const formData = new FormData();
        formData.append('image', img.file);
        await fetch(`/api/games/${editingGame._id}/images/${img.type}`, {
          method: 'PATCH',
          body: formData,
        }).then((res) => {
          if (!res.ok) return res.json().then((e) => { throw new Error(e.error || 'Upload failed'); });
        });
      }
    }

    onGamesUpdated?.();
  };
  if (loading) {
    return (
      <div className={viewMode === 'list' ? 'space-y-2' : viewMode === 'hero' ? 'grid grid-cols-1 md:grid-cols-2 gap-4' : 'grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4'}>
        {[...Array(viewMode === 'hero' ? 4 : 12)].map((_, i) => (
          <div
            key={i}
            className="bg-gray-800 rounded-lg overflow-hidden animate-pulse"
          >
            <div className={viewMode === 'list' ? 'h-16' : viewMode === 'hero' ? 'aspect-[16/5]' : 'aspect-[2/3]'} style={{ backgroundColor: '#374151' }} />
            {viewMode !== 'hero' && (
              <div className="p-4 space-y-2">
                <div className="h-4 bg-gray-700 rounded w-3/4" />
                <div className="h-3 bg-gray-700 rounded w-1/2" />
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <svg
          className="w-16 h-16 mx-auto mb-4 text-gray-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
          />
        </svg>
        <p className="text-lg">{emptyMessage}</p>
      </div>
    );
  }

  if (viewMode === 'list') {
    return (
      <>
        <div className="space-y-2">
          {games.map((game) => (
            <GameListItem key={game._id} game={game} onEdit={() => setEditingGame(game)} />
          ))}
        </div>
        {editingGame && <GameEditModal game={editingGame} onClose={() => setEditingGame(null)} onSave={handleSave} />}
      </>
    );
  }

  if (viewMode === 'hero') {
    return (
      <>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {games.map((game) => (
            <GameHeroCard key={game._id} game={game} onEdit={() => setEditingGame(game)} />
          ))}
        </div>
        {editingGame && <GameEditModal game={editingGame} onClose={() => setEditingGame(null)} onSave={handleSave} />}
      </>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
        {games.map((game) => (
          <GameTile key={game._id} game={game} onEdit={() => setEditingGame(game)} />
        ))}
      </div>
      {editingGame && <GameEditModal game={editingGame} onClose={() => setEditingGame(null)} onSave={handleSave} />}
    </>
  );
}
