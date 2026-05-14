/**
 * AES-256 Encryption Key Configuration
 *
 * Loads the AES-256 encryption key from a SEPARATE secret store, isolated from
 * general application secrets. This key is used for:
 * - QR payload encryption (guest_id + event_id)
 * - PII encryption at rest (phone, email)
 *
 * SECURITY: The encryption key MUST be stored in a dedicated Railway service
 * variable group (or equivalent secret manager scope) that is:
 * - Separate from application secrets (DB credentials, JWT secret, API keys)
 * - Accessible ONLY by the API server service account
 * - Never exposed to frontend apps, CI runners, or other services
 *
 * Environment variable: ENCRYPTION_KEY_AES256
 * Source: Dedicated "encryption-keys" variable group in Railway (or equivalent)
 *
 * Requirements: 3.8
 */

import { z } from 'zod';

// --- Validation Schema ---

/**
 * Zod schema for validating the AES-256 encryption key.
 * Must be exactly 64 hex characters (32 bytes).
 */
const encryptionKeySchema = z
  .string({
    required_error:
      'ENCRYPTION_KEY_AES256 environment variable is required. ' +
      'This key must be provisioned in the dedicated encryption-keys secret group.',
  })
  .length(64, 'AES-256 key must be exactly 64 hex characters (32 bytes)')
  .regex(/^[0-9a-f]+$/i, 'AES-256 key must contain only hexadecimal characters');

// --- Types ---

export interface EncryptionKeyConfig {
  /** The AES-256 encryption key (64 hex characters / 32 bytes) */
  key: string;
  /** Source identifier for audit logging */
  source: 'dedicated-secret-store' | 'environment-variable';
}

// --- Configuration Loader ---

/**
 * Environment variable name for the AES-256 encryption key.
 * This variable MUST be sourced from a separate secret store/group,
 * not from the general application environment variables.
 */
export const ENCRYPTION_KEY_ENV_VAR = 'ENCRYPTION_KEY_AES256';

/**
 * Loads and validates the AES-256 encryption key from the dedicated secret store.
 *
 * The key is expected in the environment variable ENCRYPTION_KEY_AES256,
 * which Railway injects from the dedicated "encryption-keys" variable group
 * at runtime. This group is separate from the main application secrets.
 *
 * @throws {Error} If the key is missing or invalid
 * @returns Validated encryption key configuration
 */
export function loadEncryptionKey(): EncryptionKeyConfig {
  const rawKey = process.env[ENCRYPTION_KEY_ENV_VAR];

  const result = encryptionKeySchema.safeParse(rawKey);

  if (!result.success) {
    const errors = result.error.issues.map((i) => i.message).join('; ');
    throw new Error(
      `[SECURITY] Failed to load AES-256 encryption key: ${errors}. ` +
        `Ensure the key is provisioned in the dedicated encryption-keys secret group ` +
        `and the API server service account has access.`
    );
  }

  return {
    key: result.data,
    source: 'dedicated-secret-store',
  };
}

/**
 * Validates that the encryption key meets AES-256 requirements without loading it.
 * Useful for health checks and startup validation.
 *
 * @returns true if the key is present and valid, false otherwise
 */
export function validateEncryptionKeyAvailable(): boolean {
  const rawKey = process.env[ENCRYPTION_KEY_ENV_VAR];
  const result = encryptionKeySchema.safeParse(rawKey);
  return result.success;
}

/**
 * Returns a redacted representation of the encryption key for logging.
 * Shows only the first 4 and last 4 characters.
 *
 * @param key The full encryption key
 * @returns Redacted key string (e.g., "a1b2...f0a1")
 */
export function redactEncryptionKey(key: string): string {
  if (key.length < 8) return '****';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}
