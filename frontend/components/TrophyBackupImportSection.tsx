'use client';

import { useEffect, useRef, useState } from 'react';

export interface TrophyBackupImportResult {
  imported: Array<{
    gameId: string;
    title: string;
    trophiesTotal: number;
    trophiesUnlocked: number;
  }>;
  updated?: Array<{
    gameId: string;
    title: string;
    trophiesTotal: number;
    trophiesUnlocked: number;
  }>;
  skipped: Array<{ gameId: string; reason?: string }>;
  ignored?: Array<{ file: string; reason: string }>;
  errors: Array<{ file: string; error: string }>;
}

type ConsoleGeneration = 'ps5' | 'ps4' | 'ps3';

interface TrophyBackupImportSectionProps {
  profileId: string | null;
  onFinished?: (result: TrophyBackupImportResult) => void;
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

export default function TrophyBackupImportSection({
  profileId,
  onFinished,
}: TrophyBackupImportSectionProps) {
  const [console_, setConsole] = useState<ConsoleGeneration | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<TrophyBackupImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const busy = uploading || processing;

  // Abort any in-flight upload if the component unmounts.
  useEffect(() => {
    return () => {
      xhrRef.current?.abort();
    };
  }, []);

  const resetForRetry = () => {
    setUploading(false);
    setProcessing(false);
    setProgress(0);
    setError('');
  };

  /**
   * Upload the selected file and import the trophies it contains.
   * Only ever called after the user explicitly confirms the import.
   */
  const importFile = (selected: File) => {
    if (busy) return;
    if (!profileId) {
      setError('Select a PlayStation profile first.');
      return;
    }
    setFile(selected);
    setError('');
    setResult(null);
    setUploading(true);
    setProcessing(false);
    setProgress(0);

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
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          setUploading(false);
          setProcessing(false);
          // Feedback is rendered inline — no toast involved.
          setResult(data as TrophyBackupImportResult);
          onFinished?.(data as TrophyBackupImportResult);
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
    if (selected) {
      setFile(selected);
      setError('');
      setResult(null);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const selected = event.dataTransfer.files?.[0];
    if (selected) {
      setFile(selected);
      setError('');
      setResult(null);
    }
  };

  const handleConfirm = () => {
    if (!file || busy) return;
    importFile(file);
  };

  const handleRemove = () => {
    setFile(null);
    setError('');
    setResult(null);
  };

  const importedCount = result?.imported?.length ?? 0;
  const updatedGames = result?.updated ?? [];
  const updatedCount = updatedGames.length;
  const importedTrophyCount = (result?.imported ?? []).reduce(
    (sum, game) => sum + (game.trophiesUnlocked ?? 0),
    0,
  );
  const updatedTrophyCount = updatedGames.reduce(
    (sum, game) => sum + (game.trophiesUnlocked ?? 0),
    0,
  );
  const hasSuccess = importedCount > 0 || updatedCount > 0;
  const summary =
    [
      importedCount > 0
        ? `Imported ${importedCount} game${importedCount === 1 ? '' : 's'} (${importedTrophyCount} trophies earned)`
        : null,
      updatedCount > 0
        ? `Updated ${updatedCount} game${updatedCount === 1 ? '' : 's'} (${updatedTrophyCount} trophies earned)`
        : null,
    ]
      .filter(Boolean)
      .join(' and ') || 'No new games were imported.';
  const skipped = result?.skipped ?? [];
  const alreadyTracked = skipped.filter(
    (s) => s.reason && s.reason !== 'no-unlocked-trophies',
  ).length;
  const emptyBackups = skipped.filter(
    (s) => s.reason === 'no-unlocked-trophies',
  ).length;
  const importErrors = result?.errors ?? [];
  const ignored = result?.ignored ?? [];
  const ignoredCount = ignored.length;

  return (
    <div className="space-y-6" data-testid="trophy-backup-section">
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
                  setResult(null);
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
              <div
                className="text-sm text-white truncate"
                data-testid="trophy-backup-selected-file"
              >
                {file.name}
              </div>
              <div className="text-xs text-gray-400">{formatFileSize(file.size)}</div>
            </div>
            {!busy && (
              <button
                onClick={handleRemove}
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

      {/* Result — feedback stays inline, no toast */}
      {result && !busy && (
        <div
          className={`rounded border px-4 py-3 text-sm ${
            hasSuccess
              ? 'bg-green-900/30 border-green-600 text-green-200'
              : 'bg-blue-900/30 border-blue-600 text-blue-200'
          }`}
          data-testid="trophy-backup-result"
        >
          <div className="font-semibold">{summary}</div>
          {(importedCount > 0 || updatedCount > 0) && (
            <ul className="mt-2 space-y-1 text-xs text-green-100/90">
              {result.imported.map((game) => (
                <li key={game.gameId} className="truncate">
                  {game.title} — {game.trophiesUnlocked}/{game.trophiesTotal} trophies
                </li>
              ))}
              {updatedGames.map((game) => (
                <li key={game.gameId} className="truncate">
                  {game.title} — {game.trophiesUnlocked}/{game.trophiesTotal} trophies
                  <span className="ml-1 text-green-300/70">(updated)</span>
                </li>
              ))}
            </ul>
          )}
          {ignoredCount > 0 && (
            <div className="mt-2 text-xs text-gray-300">
              Skipped {ignoredCount} backup file{ignoredCount === 1 ? '' : 's'} with no trophy progress in this backup.
              <ul className="mt-1 space-y-0.5 text-gray-400 max-h-40 overflow-auto">
                {ignored.map((item) => (
                  <li key={item.file} className="truncate" title={item.file}>
                    {item.file.split(/[\\/]/).pop()} — {item.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(alreadyTracked > 0 || emptyBackups > 0) && (
            <div className="mt-2 text-xs text-gray-300">
              Skipped {alreadyTracked} already tracked
              {emptyBackups > 0 ? ` and ${emptyBackups} with no unlocked trophies` : ''}.
            </div>
          )}
          {importErrors.length > 0 && (
            <div className="mt-2 text-xs text-yellow-200">
              {importErrors.length} file{importErrors.length === 1 ? '' : 's'} could not be imported:
              <ul className="mt-1 space-y-0.5 text-yellow-100/80 max-h-40 overflow-auto">
                {importErrors.map((err) => (
                  <li key={`${err.file}:${err.error}`} className="truncate" title={`${err.file}: ${err.error}`}>
                    {err.file.split(/[\\/]/).pop()} — {err.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        {result && !busy ? (
          <button
            onClick={handleRemove}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded font-medium text-sm transition text-gray-200"
          >
            Import Another Backup
          </button>
        ) : (
          <button
            onClick={handleConfirm}
            disabled={!file || !console_ || busy}
            className="px-4 py-2 bg-[var(--playstation-accent)] hover:opacity-90 disabled:bg-gray-600 disabled:cursor-not-allowed rounded font-medium text-sm transition text-white"
          >
            {busy ? 'Importing…' : 'Confirm Import'}
          </button>
        )}
      </div>
    </div>
  );
}
