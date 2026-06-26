'use client';

import { useState, useRef, useEffect } from 'react';

interface Game {
  _id: string;
  gameId: string;
  title: string;
  customTitle?: string;
  platform: string;
  capsuleImagePath?: string;
  iconImagePath?: string;
  heroImagePath?: string;
}

interface GameEditModalProps {
  game: Game;
  onClose: () => void;
  onSave: (updates: { customTitle?: string | null; images?: { type: string; file: File }[] }) => Promise<void>;
}

export default function GameEditModal({ game, onClose, onSave }: GameEditModalProps) {
  const [customTitle, setCustomTitle] = useState(game.customTitle || game.title);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Image preview state
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [heroPreview, setHeroPreview] = useState<string | null>(null);
  const [capsulePreview, setCapsulePreview] = useState<string | null>(null);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [heroFile, setHeroFile] = useState<File | null>(null);
  const [capsuleFile, setCapsuleFile] = useState<File | null>(null);

  const iconInputRef = useRef<HTMLInputElement>(null);
  const heroInputRef = useRef<HTMLInputElement>(null);
  const capsuleInputRef = useRef<HTMLInputElement>(null);

  // Lock body scroll while modal is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  const handleFileSelect = (type: 'icon' | 'hero' | 'capsule', file: File | null) => {
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      setError(`File exceeds 10MB limit`);
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file');
      return;
    }

    setError('');
    const previewUrl = URL.createObjectURL(file);

    if (type === 'icon') {
      setIconFile(file);
      setIconPreview(previewUrl);
    } else if (type === 'hero') {
      setHeroFile(file);
      setHeroPreview(previewUrl);
    } else {
      setCapsuleFile(file);
      setCapsulePreview(previewUrl);
    }
  };

  const getImageUrl = (imagePath?: string) => {
    if (!imagePath) return null;
    return `/api/icons/${imagePath}`;
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');

    try {
      const titleChanged = customTitle !== (game.customTitle || game.title);
      const images: { type: string; file: File }[] = [];
      if (iconFile) images.push({ type: 'icon', file: iconFile });
      if (heroFile) images.push({ type: 'hero', file: heroFile });
      if (capsuleFile) images.push({ type: 'capsule', file: capsuleFile });

      await onSave({
        customTitle: titleChanged ? (customTitle.trim() === game.title ? null : customTitle.trim()) : undefined,
        images: images.length > 0 ? images : undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleResetTitle = () => {
    setCustomTitle(game.title);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-gray-900 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Edit Game</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition" aria-label="Close">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Title edit */}
        <div className="mb-6">
          <label className="block text-sm text-gray-400 mb-2">Display Title</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500 transition"
            />
            {customTitle !== game.title && (
              <button
                onClick={handleResetTitle}
                className="px-3 py-2 text-xs bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition"
                title="Reset to original title"
              >
                Reset
              </button>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1">Original: {game.title}</p>
        </div>

        {/* Image previews and uploads */}
        <div className="space-y-4 mb-6">
          {/* Icon */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Icon (64×64)</label>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-gray-800 rounded overflow-hidden flex-shrink-0">
                {iconPreview ? (
                  <img src={iconPreview} alt="Icon preview" className="w-full h-full object-cover" />
                ) : getImageUrl(game.iconImagePath) ? (
                  <img src={getImageUrl(game.iconImagePath)!} alt="Current icon" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-600 text-2xl font-bold">
                    {game.title[0]}
                  </div>
                )}
              </div>
              <input
                ref={iconInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileSelect('icon', e.target.files?.[0] || null)}
              />
              <button
                onClick={() => iconInputRef.current?.click()}
                className="px-3 py-1.5 text-sm bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition"
              >
                Upload Icon
              </button>
            </div>
          </div>

          {/* Hero */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Hero Banner (1920×620)</label>
            <div className="space-y-2">
              <div className="w-full aspect-[16/5] bg-gray-800 rounded overflow-hidden">
                {heroPreview ? (
                  <img src={heroPreview} alt="Hero preview" className="w-full h-full object-cover" />
                ) : getImageUrl(game.heroImagePath) ? (
                  <img src={getImageUrl(game.heroImagePath)!} alt="Current hero" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-600 text-sm">No hero image</div>
                )}
              </div>
              <input
                ref={heroInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileSelect('hero', e.target.files?.[0] || null)}
              />
              <button
                onClick={() => heroInputRef.current?.click()}
                className="px-3 py-1.5 text-sm bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition"
              >
                Upload Hero
              </button>
            </div>
          </div>

          {/* Capsule */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Capsule (600×900)</label>
            <div className="flex items-start gap-4">
              <div className="w-24 h-36 bg-gray-800 rounded overflow-hidden flex-shrink-0">
                {capsulePreview ? (
                  <img src={capsulePreview} alt="Capsule preview" className="w-full h-full object-cover" />
                ) : getImageUrl(game.capsuleImagePath) ? (
                  <img src={getImageUrl(game.capsuleImagePath)!} alt="Current capsule" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-600 text-sm">No image</div>
                )}
              </div>
              <input
                ref={capsuleInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileSelect('capsule', e.target.files?.[0] || null)}
              />
              <button
                onClick={() => capsuleInputRef.current?.click()}
                className="px-3 py-1.5 text-sm bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition"
              >
                Upload Capsule
              </button>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded text-sm text-red-400">{error}</div>
        )}

        {/* Action buttons */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition disabled:opacity-50"
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
