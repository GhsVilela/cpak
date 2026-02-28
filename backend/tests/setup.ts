import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

// ---------------------------------------------------------------------------
// Polyfills for Node.js < 18 (running in vitest worker threads)
// ---------------------------------------------------------------------------

if (typeof Array.prototype.findLastIndex !== 'function') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Array.prototype as any).findLastIndex = function(predicate: (value: unknown, index: number, array: unknown[]) => unknown, thisArg?: unknown): number {
    for (let i = this.length - 1; i >= 0; i--) {
      if (predicate.call(thisArg, this[i], i, this)) return i;
    }
    return -1;
  };
}

if (typeof Array.prototype.findLast !== 'function') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Array.prototype as any).findLast = function(predicate: (value: unknown, index: number, array: unknown[]) => unknown, thisArg?: unknown): unknown {
    for (let i = this.length - 1; i >= 0; i--) {
      if (predicate.call(thisArg, this[i], i, this)) return this[i];
    }
    return undefined;
  };
}

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  process.env.MONGO_URI = uri;
  await mongoose.connect(uri);
});

afterEach(async () => {
  // Wipe all documents between tests — leave indexes intact
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
