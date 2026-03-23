// Polyfill globals that happy-dom doesn't provide but MSW and other libs require.
// This file is listed first in vitest setupFiles so it runs before any imports.
import { BroadcastChannel } from 'node:worker_threads';

if (typeof globalThis.BroadcastChannel === 'undefined') {
  // @ts-ignore — BroadcastChannel from worker_threads satisfies the API MSW needs
  globalThis.BroadcastChannel = BroadcastChannel;
}
