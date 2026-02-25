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
