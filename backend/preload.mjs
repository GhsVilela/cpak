// ESM preload: polyfill globalThis.crypto for Node.js < 19
// Used as: node --experimental-loader ./preload.mjs vitest.mjs run
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) {
  // @ts-ignore
  globalThis.crypto = webcrypto;
}
