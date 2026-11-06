import { Types } from 'mongoose';
import { SyncOperation } from '../models/syncOperation.js';
import type { Platform, SyncPhase } from '../models/syncOperation.js';
import { logger } from '../utils/logger.js';

/**
 * Ordered phases for each platform.
 *
 * Steam fetches achievement data before game images, while Xbox/PlayStation
 * download game images first. Keeping the order per platform lets the tracker
 * derive the base percentage for a phase from the weights of all prior phases.
 */
const PHASE_SEQUENCE: Record<Platform, SyncPhase[]> = {
  steam: ['preparing', 'discovering', 'achievements', 'game-images', 'icons', 'saving', 'finalizing'],
  xbox: ['preparing', 'discovering', 'game-images', 'achievements', 'icons', 'saving', 'finalizing'],
  playstation: ['preparing', 'discovering', 'game-images', 'achievements', 'icons', 'saving', 'finalizing'],
};

/**
 * Fixed phase weights (must add up to 100 for every platform).
 *
 * Icons receive the largest share because downloading every achievement icon is
 * usually the longest part of a sync. Game/achievement discovery and fetching
 * receive the next largest shares. Phases with no work simply complete and
 * hand their entire weight to the overall progress without ever moving
 * backwards.
 */
const PHASE_WEIGHTS: Record<Platform, Record<SyncPhase, number>> = {
  steam: {
    preparing: 1,
    discovering: 6,
    achievements: 38,
    'game-images': 10,
    icons: 40,
    saving: 4,
    finalizing: 1,
  },
  xbox: {
    preparing: 1,
    discovering: 9,
    'game-images': 10,
    achievements: 25,
    icons: 50,
    saving: 4,
    finalizing: 1,
  },
  playstation: {
    preparing: 1,
    discovering: 6,
    'game-images': 9,
    achievements: 29,
    icons: 50,
    saving: 4,
    finalizing: 1,
  },
};

/** Extra SyncOperation fields that may be updated together with progress. */
export interface SyncProgressExtra {
  totalGames?: number;
  gamesProcessed?: number;
  imagesCompleted?: number;
  gamesFailed?: number;
  totalAchievements?: number;
  achievementsSynced?: number;
  iconDownloadsPending?: number;
  iconDownloadsCompleted?: number;
  iconDownloadsFailed?: number;
}

interface ProgressOperation {
  _id: Types.ObjectId;
  platform?: Platform;
  progress?: number;
  phase?: SyncPhase;
  message?: string;
}

/**
 * Tracks a sync operation through a fixed, pre-planned set of phases.
 *
 * Progress is computed from the completed work in the current phase and is
 * clamped so it can never decrease. Phase totals must be set before reporting
 * progress in that phase; callers are expected to discover all work items first
 * (games, images to download, icons to fetch) and then pass the final total.
 */
export class SyncProgressTracker {
  private readonly operationId: Types.ObjectId;
  private readonly platform: Platform;
  private readonly sequence: SyncPhase[];
  private readonly weights: Record<SyncPhase, number>;

  private phase: SyncPhase;
  private phaseTotal = 0;
  private phaseCompleted = 0;
  private progress: number;
  private message: string;

  constructor(operation: ProgressOperation, platform?: Platform) {
    this.operationId = operation._id;
    this.platform = platform ?? operation.platform ?? 'steam';
    this.sequence = PHASE_SEQUENCE[this.platform];
    this.weights = PHASE_WEIGHTS[this.platform];

    this.phase = operation.phase && this.sequence.includes(operation.phase)
      ? operation.phase
      : 'preparing';
    this.progress = typeof operation.progress === 'number' ? operation.progress : 0;
    this.message = operation.message || 'Preparing sync...';
  }

  /** Base percentage contributed by all phases before `phase`. */
  private baseFor(phase: SyncPhase): number {
    let base = 0;
    for (const candidate of this.sequence) {
      if (candidate === phase) break;
      base += this.weights[candidate];
    }
    return base;
  }

  private computeProgress(): number {
    if (this.phaseTotal <= 0) {
      // A total of 0 means the phase has no work; a negative total means the
      // total is still unknown and the phase should stay at its base.
      return this.phaseTotal === 0
        ? this.baseFor(this.phase) + this.weights[this.phase]
        : this.baseFor(this.phase);
    }

    const fraction = Math.min(1, Math.max(0, this.phaseCompleted / this.phaseTotal));
    return this.baseFor(this.phase) + this.weights[this.phase] * fraction;
  }

  private clamp(value: number): number {
    // Keep 100% exclusively for the finish() call so the UI never shows
    // "100% / finalizing" while work is still running.
    return Math.max(this.progress, Math.min(99, value));
  }

  private async persist(extra: SyncProgressExtra = {}): Promise<void> {
    logger.debug({
      syncOperationId: this.operationId,
      phase: this.phase,
      progress: Math.round(this.progress),
      message: this.message,
    }, 'Sync progress update');

    try {
      await SyncOperation.findByIdAndUpdate(this.operationId, {
        $set: {
          phase: this.phase,
          phaseTotal: Math.max(0, this.phaseTotal),
          phaseCompleted: Math.max(0, this.phaseCompleted),
          progress: Math.round(this.progress * 100) / 100,
          message: this.message,
          ...extra,
        },
      });
    } catch (error) {
      // Progress reporting must never fail a sync. The next checkpoint will
      // try again, and the sync itself can still finish and be marked complete.
      logger.warn({ error, syncOperationId: this.operationId }, 'Failed to persist sync progress');
    }
  }

  /**
   * Start a phase. Pass `null` when the total number of work items is not known
   * yet (call `setTotal` once it is). Pass `0` when the phase has no work.
   */
  async begin(
    phase: SyncPhase,
    total: number | null,
    message: string,
    extra: SyncProgressExtra = {},
  ): Promise<void> {
    this.phase = phase;
    this.phaseTotal = total === null ? -1 : Math.max(0, Math.floor(total));
    this.phaseCompleted = 0;
    this.message = message;
    this.progress = this.clamp(this.computeProgress());
    await this.persist(extra);
  }

  /** Provide the total for a phase started with an unknown total. */
  async setTotal(total: number, message?: string, extra: SyncProgressExtra = {}): Promise<void> {
    this.phaseTotal = Math.max(0, Math.floor(total));
    if (message) this.message = message;
    this.progress = this.clamp(this.computeProgress());
    await this.persist(extra);
  }

  /** Report completed work in the current phase. Never decreases progress. */
  async update(
    completed: number,
    message?: string,
    extra: SyncProgressExtra = {},
  ): Promise<void> {
    this.phaseCompleted = Math.max(this.phaseCompleted, Math.floor(completed));
    if (message) this.message = message;
    this.progress = this.clamp(this.computeProgress());
    await this.persist(extra);
  }

  /** Mark the current phase complete, regardless of how many items were seen. */
  async complete(message?: string, extra: SyncProgressExtra = {}): Promise<void> {
    if (this.phaseTotal > 0) {
      this.phaseCompleted = this.phaseTotal;
    }
    if (message) this.message = message;
    this.progress = this.clamp(this.baseFor(this.phase) + this.weights[this.phase]);
    await this.persist(extra);
  }

  /** Finish the sync at exactly 100%. */
  async finish(message = 'Sync complete'): Promise<void> {
    this.phase = 'finalizing';
    this.phaseTotal = 1;
    this.phaseCompleted = 1;
    this.progress = 100;
    this.message = message;
    await this.persist();
  }
}
