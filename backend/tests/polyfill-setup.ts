// Polyfill diagnostics_channel.tracingChannel for Node.js < 20.19
// Required by Fastify 5.x and Pino which call tracingChannel() at module load time
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const dc = require('node:diagnostics_channel');

if (typeof dc.tracingChannel !== 'function') {
  const noopChannel = { publish() {}, subscribe() {}, unsubscribe() {}, hasSubscribers: false };
  dc.tracingChannel = function tracingChannel(_name: string) {
    return {
      start: { ...noopChannel },
      end: { ...noopChannel },
      asyncStart: { ...noopChannel },
      asyncEnd: { ...noopChannel },
      error: { ...noopChannel },
      hasSubscribers: false,
      subscribe() {},
      unsubscribe() {},
      // TracingChannel methods (used by pino)
      traceSync(fn: (...args: unknown[]) => unknown, _store?: unknown, thisArg?: unknown, ...args: unknown[]) {
        return fn.call(thisArg, ...args);
      },
      tracePromise(fn: (...args: unknown[]) => unknown, _store?: unknown, thisArg?: unknown, ...args: unknown[]) {
        return fn.call(thisArg, ...args);
      },
      traceCallback(fn: (...args: unknown[]) => unknown, _position?: number, _store?: unknown, thisArg?: unknown, ...args: unknown[]) {
        return fn.call(thisArg, ...args);
      },
    };
  };
}
