import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 64;
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
 * Get encryption key from environment or generate one
 * In production, this should be stored securely (e.g., KMS, secrets manager)
 */
function getEncryptionKey(): Buffer {
  const envKey = process.env.ENCRYPTION_KEY;
  
  if (envKey) {
    // Derive key from environment variable
    return crypto.scryptSync(envKey, 'cpak-salt', KEY_LENGTH);
  }
  
  // Fallback: Generate deterministic key from system entropy
  // WARNING: In production, use a proper key management system
  const key = crypto.scryptSync('cpak-default-key', 'cpak-salt', KEY_LENGTH);
  console.warn('[Crypto] Using default encryption key. Set ENCRYPTION_KEY environment variable for production.');
  return key;
}

/**
 * Encrypt sensitive data (e.g., API tokens)
 * Returns encrypted string with prefix: encrypted:base64Data
 */
export function encrypt(plaintext: string): string {
  try {
    const key = getEncryptionKey();
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
 * Accepts encrypted string with or without prefix (for backward compatibility)
 * Format: encrypted:base64Data or base64Data
 */
export function decrypt(ciphertext: string): string {
  try {
    // Strip prefix if present
    const base64Data = ciphertext.startsWith(ENCRYPTED_PREFIX) 
      ? ciphertext.substring(ENCRYPTED_PREFIX.length)
      : ciphertext;
    
    const key = getEncryptionKey();
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
