import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loadEncryptionKey,
  validateEncryptionKeyAvailable,
  redactEncryptionKey,
  ENCRYPTION_KEY_ENV_VAR,
} from './encryption-key';

describe('encryption-key config', () => {
  const VALID_KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env[ENCRYPTION_KEY_ENV_VAR];
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env[ENCRYPTION_KEY_ENV_VAR] = originalEnv;
    } else {
      delete process.env[ENCRYPTION_KEY_ENV_VAR];
    }
  });

  describe('loadEncryptionKey', () => {
    it('should load a valid 64-character hex key', () => {
      process.env[ENCRYPTION_KEY_ENV_VAR] = VALID_KEY;

      const config = loadEncryptionKey();

      expect(config.key).toBe(VALID_KEY);
      expect(config.source).toBe('dedicated-secret-store');
    });

    it('should throw if key is missing', () => {
      delete process.env[ENCRYPTION_KEY_ENV_VAR];

      expect(() => loadEncryptionKey()).toThrow('[SECURITY]');
      expect(() => loadEncryptionKey()).toThrow('encryption-keys secret group');
    });

    it('should throw if key is too short', () => {
      process.env[ENCRYPTION_KEY_ENV_VAR] = 'abcdef1234';

      expect(() => loadEncryptionKey()).toThrow('64 hex characters');
    });

    it('should throw if key is too long', () => {
      process.env[ENCRYPTION_KEY_ENV_VAR] = VALID_KEY + 'ff';

      expect(() => loadEncryptionKey()).toThrow('64 hex characters');
    });

    it('should throw if key contains non-hex characters', () => {
      process.env[ENCRYPTION_KEY_ENV_VAR] = 'g'.repeat(64);

      expect(() => loadEncryptionKey()).toThrow('hexadecimal');
    });

    it('should accept uppercase hex characters', () => {
      process.env[ENCRYPTION_KEY_ENV_VAR] = VALID_KEY.toUpperCase();

      const config = loadEncryptionKey();
      expect(config.key).toBe(VALID_KEY.toUpperCase());
    });
  });

  describe('validateEncryptionKeyAvailable', () => {
    it('should return true when key is valid', () => {
      process.env[ENCRYPTION_KEY_ENV_VAR] = VALID_KEY;

      expect(validateEncryptionKeyAvailable()).toBe(true);
    });

    it('should return false when key is missing', () => {
      delete process.env[ENCRYPTION_KEY_ENV_VAR];

      expect(validateEncryptionKeyAvailable()).toBe(false);
    });

    it('should return false when key is invalid', () => {
      process.env[ENCRYPTION_KEY_ENV_VAR] = 'invalid';

      expect(validateEncryptionKeyAvailable()).toBe(false);
    });
  });

  describe('redactEncryptionKey', () => {
    it('should show first 4 and last 4 characters', () => {
      const redacted = redactEncryptionKey(VALID_KEY);

      expect(redacted).toBe('a1b2...a1b2');
      expect(redacted).not.toContain(VALID_KEY);
    });

    it('should return **** for very short strings', () => {
      expect(redactEncryptionKey('abc')).toBe('****');
    });
  });

  describe('ENCRYPTION_KEY_ENV_VAR', () => {
    it('should be ENCRYPTION_KEY_AES256', () => {
      expect(ENCRYPTION_KEY_ENV_VAR).toBe('ENCRYPTION_KEY_AES256');
    });
  });
});
