/** Shared adaptive-sync defaults — single source of truth for all platforms. */
export const SYNC_DEFAULTS = {
  /** Starting batch size for adaptive batch controller (auto-scales up/down). */
  BATCH_SIZE: Number(process.env.BATCH_SIZE ?? 150),
  /** Maximum batch size the controller can scale up to. */
  MAX_BATCH_SIZE: Number(process.env.MAX_BATCH_SIZE ?? 500),
  /** Minimum batch size — floor for adaptive scaling. */
  MIN_BATCH_SIZE: Number(process.env.MIN_BATCH_SIZE ?? 20),
  /** Starting concurrency limit for adaptive concurrency controller (auto-scales up/down). */
  CONCURRENCY: Number(process.env.CONCURRENCY ?? 25),
  /** Maximum concurrency the controller can scale up to. */
  MAX_CONCURRENCY: Number(process.env.MAX_CONCURRENCY ?? 75),
  /** Minimum concurrency — floor for adaptive scaling. */
  MIN_CONCURRENCY: Number(process.env.MIN_CONCURRENCY ?? 5),
  /** Initial throttle delay in ms between batches. */
  DELAY: Number(process.env.SYNC_DELAY ?? 250),
};
