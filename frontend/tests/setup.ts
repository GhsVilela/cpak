import '@testing-library/jest-dom';
import { server } from './mocks/handlers';

// ---------------------------------------------------------------------------
// Polyfills for Node.js < 18 running in vitest worker threads
// ---------------------------------------------------------------------------

if (typeof Array.prototype.findLastIndex !== 'function') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Array.prototype as any).findLastIndex = function(
    predicate: (value: unknown, index: number, array: unknown[]) => unknown,
    thisArg?: unknown,
  ): number {
    for (let i = this.length - 1; i >= 0; i--) {
      if (predicate.call(thisArg, this[i], i, this)) return i;
    }
    return -1;
  };
}

if (typeof Array.prototype.findLast !== 'function') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Array.prototype as any).findLast = function(
    predicate: (value: unknown, index: number, array: unknown[]) => unknown,
    thisArg?: unknown,
  ): unknown {
    for (let i = this.length - 1; i >= 0; i--) {
      if (predicate.call(thisArg, this[i], i, this)) return this[i];
    }
    return undefined;
  };
}

// Inject the config before each test so config.ts's getConfig() reads from
// window.__CONFIG__ instead of fetching /config.json (which happy-dom would
// attempt as http://localhost:3000/config.json, bypassing MSW entirely).
beforeEach(() => {
  (globalThis as any).__CONFIG__ = { API_BASE_URL: 'http://localhost/api' };
  if (typeof window !== 'undefined') {
    (window as any).__CONFIG__ = { API_BASE_URL: 'http://localhost/api' };
  }
});

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
