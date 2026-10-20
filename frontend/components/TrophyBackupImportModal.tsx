'use client';

import { useEffect, useRef, useState } from 'react';

export interface TrophyBackupImportResult {
  imported: Array<{
    gameId: string;
    title: string;
    trophiesTotal: number;
    trophiesUnlocked: number;
  }>;
  skipped: Array<{ gameId: string; reason?: string }>;
  errors: Array<{ file: string; error: string }>;
}

type ConsoleGeneration = 'ps5' | 'ps4' | 'ps3';

interface TrophyBackupImportModalProps {
  isOpen: boolean;
  profileId: string | null;
  onClose: () => void;
  onFinished: (result: TrophyBackupImportResult) => void;
  onImportingChange?: (importing: boolean) => void;
}

const CONSOLE_OPTIONS: Array<{
  id: ConsoleGeneration;
  label: string;
  available: boolean;
}> = [
  { id: 'ps5', label: 'PlayStation 5', available: true },
  { id: 'ps4', label: 'PlayStation 4', available: false },
  { id: 'ps3', label: 'PlayStation 3', available: false },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function TrophyBackupImportModal({
  isOpen,
  profileId,
  onClose,
  onFinished,
  onImportingChange,
}: TrophyBackupImportModalProps) {
  const [console_, setConsole] = useState<ConsoleGeneration | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const busy = uploading || processing;

  // Reset state whenever the modal is (re)opened.
  useEffect(() => {
    if (isOpen) {
      setConsole(null);
      setFile(null);
      setUploading(false);
      setProcessing(false);
      setProgress(0);
      setError('');
      setDragging(false);
    }
  }, [isOpen]);

  // Lock body scroll while open.
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Abort any in-flight upload if the component unmounts.
  useEffect(() => {
    return () => {
      xhrRef.current?.abort();
    };
  }, []);

  if (!isOpen) return null;

  const resetForRetry = () => {
    setUploading(false);
    setProcessing(false);
    setProgress(0);
    setError('');
    onImportingChange?.(false);
  };

  const importFile = (selected: File) => {
    if (busy) return;
    if (!profileId) {
      setError('Select a PlayStation profile first.');
      return;
    }
    setFile(selected);
    setError('');
    setUploading(true);
    setProcessing(false);
    setProgress(0);
    onImportingChange?.(true);

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open(
      'POST',
      `/api/playstation/trophy-backup/import?profileId=${encodeURIComponent(profileId)}`,
    );

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        setProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.upload.onload = () => {
      setUploading(false);
      setProcessing(true);
    };

    xhr.onload = () => {
      xhrRef.current = null;
      onImportingChange?.(false);
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          setUploading(false);
          setProcessing(false);
          onFinished(data as TrophyBackupImportResult);
          onClose();
        } else {
          setUploading(false);
          setProcessing(false);
          setError(data.error || 'Failed to import trophy backup');
        }
      } catch {
        setUploading(false);
        setProcessing(false);
        setError('Failed to import trophy backup');
      }
    };

    xhr.onerror = () => {
      xhrRef.current = null;
      onImportingChange?.(false);
      setUploading(false);
      setProcessing(false);
      setError('Upload failed. Check your connection and try again.');
    };

    const formData = new FormData();
    formData.append('file', selected);
    xhr.send(formData);
  };

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    event.target.value = '';
    if (selected) importFile(selected);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const selected = event.dataTransfer.files?.[0];
    if (selected) importFile(selected);
  };

  const handleClose = () => {
    if (busy) {
      xhrRef.current?.abort();
      xhrRef.current = null;
      onImportingChange?.(false);
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
      data-testid="trophy-backup-modal"
    >
      <div
        className="bg-gray-800 rounded-lg shadow-2xl max-w-lg w-full"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Import trophy backup"
      >
        <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Import Trophy Backup</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white transition"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Step 1 — console generation */}
          <div>
            <div className="text-sm text-gray-400 mb-3">
              1. Which console is this backup from?
            </div>
            <div className="grid grid-cols-3 gap-3">
              {CONSOLE_OPTIONS.map((option) => {
                const selected = console_ === option.id;
                return (
                  <button
                    key={option.id}
                    onClick={() => {
                      if (!option.available || busy) return;
                      setConsole(option.id);
                      setError('');
                    }}
                    disabled={!option.available || busy}
                    className={`px-3 py-4 rounded-lg border text-center transition ${
                      selected
                        ? 'border-[var(--playstation-accent)] bg-[var(--playstation-accent)]/10 text-white'
                        : option.available
                          ? 'border-gray-600 hover:border-gray-500 text-gray-200'
                          : 'border-gray-700 text-gray-600 cursor-not-allowed'
                    }`}
                  >
                    <div className="font-semibold text-sm">{option.label}</div>
                    <div className="text-xs mt-1">
                      {option.available ? 'Supported' : 'Coming soon'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2 — file selection */}
          <div className={console_ === 'ps5' ? '' : 'opacity-40 pointer-events-none'}>
            <div className="text-sm text-gray-400 mb-3">2. Select your backup file</div>

            {!file ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!busy) setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-lg p-6 text-center transition ${
                  dragging ? 'border-[var(--playstation-accent)] bg-gray-700/40' : 'border-gray-600'
                }`}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".zip,.dat,.ucp"
                  className="hidden"
                  onChange={handleFileInput}
                  data-testid="trophy-backup-input"
                />
                <p className="text-sm text-gray-300 mb-3">
                  Drop your backup here, or
                </p>
                <button
                  onClick={() => inputRef.current?.click()}
                  disabled={busy || console_ !== 'ps5'}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 disabled:cursor-not-allowed rounded font-medium text-sm transition text-gray-200"
                >
                  Choose File
                </button>
                <p className="text-xs text-gray-500 mt-3">
                  ZIP of the PS5 trophy2 folders, a single TRPTITLE.DAT, or a TROPHY.UCP.
                </p>
              </div>
            ) : (
              <div className="bg-gray-700/50 rounded-lg p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm text-white truncate">{file.name}</div>
                  <div className="text-xs text-gray-400">{formatFileSize(file.size)}</div>
                </div>
                {!busy && (
                  <button
                    onClick={() => setFile(null)}
                    className="text-xs text-gray-400 hover:text-white transition whitespace-nowrap"
                  >
                    Remove
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Progress */}
          {busy && (
            <div>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-gray-300">
                  {processing ? 'Importing trophies…' : `Uploading… ${progress}%`}
                </span>
                {!processing && <span className="text-gray-400">{progress}%</span>}
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2.5 overflow-hidden">
                <div
                  className={`h-2.5 rounded-full bg-[var(--playstation-accent)] transition-all ${
                    processing ? 'animate-pulse' : ''
                  }`}
                  style={{ width: `${processing ? 100 : progress}%` }}
                />
              </div>
              {processing && (
                <p className="text-xs text-gray-500 mt-2">
                  Parsing the backup and saving the games. This can take a moment for large files.
                </p>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-900/30 border border-red-600 text-red-300 px-4 py-3 rounded text-sm">
              {error}
              {file && (
                <button
                  onClick={() => {
                    resetForRetry();
                    if (file) importFile(file);
                  }}
                  className="block mt-2 underline hover:text-red-200"
                >
                  Try again
                </button>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
          <button
            onClick={handleClose}
            className="px-4 py-2 rounded font-medium text-sm transition text-gray-300 hover:text-white"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
