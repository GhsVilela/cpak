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
