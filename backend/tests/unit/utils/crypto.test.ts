import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encrypt, decrypt, isEncrypted, hash, generateToken, ENCRYPTED_PREFIX } from '../../../src/utils/crypto.js';

describe('crypto utils', () => {
  const TEST_KEY = 'test-encryption-key-for-unit-tests-1234567890';

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = TEST_KEY;
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  describe('isEncrypted', () => {
    it('returns true for values with encrypted prefix', () => {
      expect(isEncrypted('encrypted:abc123')).toBe(true);
    });

    it('returns false for plain text values', () => {
      expect(isEncrypted('plain-text')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isEncrypted('')).toBe(false);
    });

    it('returns false for partial prefix match', () => {
      expect(isEncrypted('encrypt:abc')).toBe(false);
    });
  });

  describe('encrypt', () => {
    it('returns a string with encrypted prefix when ENCRYPTION_KEY is set', () => {
      const result = encrypt('my-secret-token');
      expect(result.startsWith(ENCRYPTED_PREFIX)).toBe(true);
    });

    it('returns plain text when ENCRYPTION_KEY is not set', () => {
      delete process.env.ENCRYPTION_KEY;
      const result = encrypt('plain-value');
      expect(result).toBe('plain-value');
    });

    it('produces different ciphertext each call (random IV)', () => {
      const a = encrypt('same-value');
      const b = encrypt('same-value');
      expect(a).not.toBe(b);
    });
  });

  describe('decrypt', () => {
    it('decrypts an encrypted value back to original plaintext', () => {
      const original = 'my-secret-api-key';
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(original);
    });

    it('returns plain text unchanged when no encrypted prefix', () => {
      expect(decrypt('plain-value')).toBe('plain-value');
    });

    it('decrypt round-trips with special characters', () => {
      const original = 'special!@#$%^&*()_+-=[]{}|;\':",.<>?/~`';
      const decrypted = decrypt(encrypt(original));
      expect(decrypted).toBe(original);
    });

    it('throws when ENCRYPTION_KEY is not set but value is encrypted', () => {
      const encrypted = encrypt('secret');
      delete process.env.ENCRYPTION_KEY;
      expect(() => decrypt(encrypted)).toThrow('Decryption failed');
    });
  });

  describe('hash', () => {
    it('returns a 64-character hex string (SHA-256)', () => {
      const result = hash('some-data');
      expect(result).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is deterministic for the same input', () => {
      expect(hash('data')).toBe(hash('data'));
    });

    it('produces different hashes for different inputs', () => {
      expect(hash('a')).not.toBe(hash('b'));
    });
  });

  describe('generateToken', () => {
    it('returns a hex string of default length (32 bytes = 64 chars)', () => {
      const token = generateToken();
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    it('respects custom length', () => {
      const token = generateToken(16);
      expect(token).toHaveLength(32);
    });

    it('generates unique tokens', () => {
      const a = generateToken();
      const b = generateToken();
      expect(a).not.toBe(b);
    });
  });
});
