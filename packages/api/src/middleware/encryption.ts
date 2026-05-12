import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// --- Constants ---

const AES_ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;
const ENCODING = 'hex';

// --- Types ---

export interface EncryptionConfig {
  /** AES-256 encryption key (32 bytes / 64 hex characters) */
  encryptionKey: string;
}

// --- PII Encryption Service ---

/**
 * PII Encryption utility for encrypting sensitive fields (phone, email) at rest.
 * Uses AES-256-CBC with random IV per encryption operation.
 * Format: iv:encrypted_data (both hex encoded)
 *
 * Validates: Requirement 13.2
 */
export class PIIEncryption {
  private readonly key: Buffer;

  constructor(config: EncryptionConfig) {
    this.key = Buffer.from(config.encryptionKey, 'hex');
    if (this.key.length !== 32) {
      throw new Error(
        'Encryption key must be 32 bytes (64 hex characters) for AES-256'
      );
    }
  }

  /**
   * Encrypt a plaintext PII value.
   * Returns null if input is null/undefined/empty.
   * Format: iv:encrypted (hex encoded)
   */
  encrypt(plaintext: string | null | undefined): string | null {
    if (!plaintext) {
      return null;
    }

    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(AES_ALGORITHM, this.key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', ENCODING);
    encrypted += cipher.final(ENCODING);

    return `${iv.toString(ENCODING)}:${encrypted}`;
  }

  /**
   * Decrypt an encrypted PII value.
   * Returns null if input is null/undefined/empty.
   * Expects format: iv:encrypted (hex encoded)
   */
  decrypt(ciphertext: string | null | undefined): string | null {
    if (!ciphertext) {
      return null;
    }

    const parts = ciphertext.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid ciphertext format. Expected iv:encrypted');
    }

    const [ivHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, ENCODING);
    const decipher = createDecipheriv(AES_ALGORITHM, this.key, iv);

    let decrypted = decipher.update(encryptedHex, ENCODING, 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Check if a value appears to be encrypted (has iv:data format).
   */
  isEncrypted(value: string | null | undefined): boolean {
    if (!value) return false;
    const parts = value.split(':');
    if (parts.length !== 2) return false;
    // IV should be 32 hex chars (16 bytes)
    return parts[0].length === 32 && /^[0-9a-f]+$/.test(parts[0]);
  }

  /**
   * Encrypt PII fields on a guest record (phone, email).
   * Returns a new object with encrypted fields.
   */
  encryptGuestPII<T extends { phone?: string | null; email?: string | null }>(
    record: T
  ): T {
    return {
      ...record,
      phone: this.encrypt(record.phone ?? null),
      email: this.encrypt(record.email ?? null),
    };
  }

  /**
   * Decrypt PII fields on a guest record (phone, email).
   * Returns a new object with decrypted fields.
   */
  decryptGuestPII<T extends { phone?: string | null; email?: string | null }>(
    record: T
  ): T {
    return {
      ...record,
      phone: this.decrypt(record.phone ?? null),
      email: this.decrypt(record.email ?? null),
    };
  }
}

// --- Exported constants for testing ---

export const ENCRYPTION_CONSTANTS = {
  AES_ALGORITHM,
  IV_LENGTH,
  ENCODING,
} as const;
