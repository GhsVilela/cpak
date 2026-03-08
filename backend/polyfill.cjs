// Polyfill for Node.js < 18: add Web Crypto API methods to node:crypto module.
// Vite 6 does `import crypto from "node:crypto"` and calls `crypto.getRandomValues()`,
// which only exists in Node 18+. In Node 16, getRandomValues lives on crypto.webcrypto.
const nodeCrypto = require('node:crypto');

if (typeof nodeCrypto.getRandomValues !== 'function' && nodeCrypto.webcrypto) {
  nodeCrypto.getRandomValues = (buffer) => nodeCrypto.webcrypto.getRandomValues(buffer);
}

// Also ensure globalThis.crypto is set for any browser-style code
if (!globalThis.crypto && nodeCrypto.webcrypto) {
  globalThis.crypto = nodeCrypto.webcrypto;
}

// Polyfill Array.prototype.findLastIndex for Node.js < 18
if (typeof Array.prototype.findLastIndex !== 'function') {
  Array.prototype.findLastIndex = function(predicate, thisArg) {
    for (let i = this.length - 1; i >= 0; i--) {
      if (predicate.call(thisArg, this[i], i, this)) return i;
    }
    return -1;
  };
}

// Polyfill Array.prototype.findLast for Node.js < 18
if (typeof Array.prototype.findLast !== 'function') {
  Array.prototype.findLast = function(predicate, thisArg) {
    for (let i = this.length - 1; i >= 0; i--) {
      if (predicate.call(thisArg, this[i], i, this)) return this[i];
    }
    return undefined;
  };
}

// Polyfill Object.hasOwn for Node.js < 16.9
if (typeof Object.hasOwn !== 'function') {
  Object.hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
}

// Polyfill diagnostics_channel.tracingChannel for Node.js < 20.19
// Required by Fastify 5.x and Pino which call tracingChannel() at module load time
const dc = require('node:diagnostics_channel');
if (typeof dc.tracingChannel !== 'function') {
  dc.tracingChannel = function tracingChannel(name) {
    const noop = { publish() {}, subscribe() {}, unsubscribe() {}, hasSubscribers: false };
    return {
      start: noop,
      end: noop,
      asyncStart: noop,
      asyncEnd: noop,
      error: noop,
      hasSubscribers: false,
      subscribe() {},
      unsubscribe() {},
      traceSync(fn, _store, thisArg, ...args) {
        return fn.call(thisArg, ...args);
      },
      tracePromise(fn, _store, thisArg, ...args) {
        return fn.call(thisArg, ...args);
      },
      traceCallback(fn, _position, _store, thisArg, ...args) {
        return fn.call(thisArg, ...args);
      },
    };
  };
}
