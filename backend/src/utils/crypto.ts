import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Encryption prefix to identify encrypted values
 * Single source of truth for both Profile and Settings encryption
 */
export const ENCRYPTED_PREFIX = 'encrypted:';

/**
 * Check if a value is encrypted (has the prefix)
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith(ENCRYPTED_PREFIX);
}

/**
 * Get encryption key from environment
 * Returns null if ENCRYPTION_KEY is not set (plain text storage mode)
 */
function getEncryptionKey(): Buffer | null {
  const envKey = process.env.ENCRYPTION_KEY;
  
  if (envKey) {
    // Derive key from environment variable
    return crypto.scryptSync(envKey, 'cpak-salt', KEY_LENGTH);
  }
  
  // No encryption key set - use plain text storage
  return null;
}

/**
 * Encrypt sensitive data (e.g., API tokens)
 * If ENCRYPTION_KEY is set: Returns encrypted string with prefix (encrypted:base64Data)
 * If ENCRYPTION_KEY is not set: Returns plain text (no encryption)
 */
export function encrypt(plaintext: string): string {
  try {
    const key = getEncryptionKey();
    
    // No encryption key - store as plain text
    if (!key) {
      return plaintext;
    }
    
    const iv = crypto.randomBytes(IV_LENGTH);
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Combine iv:authTag:encrypted and encode as base64
    const combined = Buffer.concat([
      iv,
      authTag,
      Buffer.from(encrypted, 'hex')
    ]);
    
    return ENCRYPTED_PREFIX + combined.toString('base64');
  } catch (error) {
    throw new Error(`Encryption failed: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Decrypt sensitive data
 * If value has encrypted prefix: Attempts to decrypt (requires ENCRYPTION_KEY)
 * If value has no prefix: Returns as plain text
 */
export function decrypt(ciphertext: string): string {
  try {
    // If no encryption prefix, return as plain text
    if (!ciphertext.startsWith(ENCRYPTED_PREFIX)) {
      return ciphertext;
    }
    
    // Strip prefix
    const base64Data = ciphertext.substring(ENCRYPTED_PREFIX.length);
    
    const key = getEncryptionKey();
    
    // No encryption key but value is encrypted
    if (!key) {
      throw new Error('Cannot decrypt: ENCRYPTION_KEY not set but value is encrypted');
    }
    
    const combined = Buffer.from(base64Data, 'base64');
    
    // Extract iv, authTag, and encrypted data
    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted.toString('hex'), 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Hash data for comparison (e.g., API keys for validation)
 * Uses SHA-256 for one-way hashing
 */
export function hash(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Generate cryptographically secure random token
 */
export function generateToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}
