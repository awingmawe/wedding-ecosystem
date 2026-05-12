import { describe, it, expect } from 'vitest';
import { randomBytes } from 'crypto';
import { PIIEncryption } from './encryption';

// Generate a valid 32-byte key for testing
const TEST_KEY = randomBytes(32).toString('hex');

describe('PIIEncryption', () => {
  describe('constructor', () => {
    it('should create instance with valid 32-byte hex key', () => {
      expect(() => new PIIEncryption({ encryptionKey: TEST_KEY })).not.toThrow();
    });

    it('should throw error for invalid key length', () => {
      expect(
        () => new PIIEncryption({ encryptionKey: 'short' })
      ).toThrow('Encryption key must be 32 bytes (64 hex characters) for AES-256');
    });

    it('should throw error for 16-byte key', () => {
      const shortKey = randomBytes(16).toString('hex');
      expect(
        () => new PIIEncryption({ encryptionKey: shortKey })
      ).toThrow('Encryption key must be 32 bytes (64 hex characters) for AES-256');
    });
  });

  describe('encrypt', () => {
    const pii = new PIIEncryption({ encryptionKey: TEST_KEY });

    it('should encrypt a phone number', () => {
      const encrypted = pii.encrypt('+6281234567890');
      expect(encrypted).not.toBeNull();
      expect(encrypted).not.toBe('+6281234567890');
      expect(encrypted!.split(':').length).toBe(2);
    });

    it('should encrypt an email address', () => {
      const encrypted = pii.encrypt('user@example.com');
      expect(encrypted).not.toBeNull();
      expect(encrypted).not.toBe('user@example.com');
    });

    it('should return null for null input', () => {
      expect(pii.encrypt(null)).toBeNull();
    });

    it('should return null for undefined input', () => {
      expect(pii.encrypt(undefined)).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(pii.encrypt('')).toBeNull();
    });

    it('should produce different ciphertexts for same plaintext (random IV)', () => {
      const encrypted1 = pii.encrypt('test@example.com');
      const encrypted2 = pii.encrypt('test@example.com');
      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should produce output in iv:encrypted hex format', () => {
      const encrypted = pii.encrypt('hello');
      expect(encrypted).toMatch(/^[0-9a-f]{32}:[0-9a-f]+$/);
    });
  });

  describe('decrypt', () => {
    const pii = new PIIEncryption({ encryptionKey: TEST_KEY });

    it('should decrypt an encrypted phone number', () => {
      const original = '+6281234567890';
      const encrypted = pii.encrypt(original);
      const decrypted = pii.decrypt(encrypted);
      expect(decrypted).toBe(original);
    });

    it('should decrypt an encrypted email', () => {
      const original = 'user@example.com';
      const encrypted = pii.encrypt(original);
      const decrypted = pii.decrypt(encrypted);
      expect(decrypted).toBe(original);
    });

    it('should return null for null input', () => {
      expect(pii.decrypt(null)).toBeNull();
    });

    it('should return null for undefined input', () => {
      expect(pii.decrypt(undefined)).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(pii.decrypt('')).toBeNull();
    });

    it('should throw for invalid ciphertext format', () => {
      expect(() => pii.decrypt('invalid')).toThrow(
        'Invalid ciphertext format'
      );
    });

    it('should not decrypt with a different key', () => {
      const otherKey = randomBytes(32).toString('hex');
      const otherPii = new PIIEncryption({ encryptionKey: otherKey });

      const encrypted = pii.encrypt('secret@email.com');
      expect(() => otherPii.decrypt(encrypted)).toThrow();
    });
  });

  describe('isEncrypted', () => {
    const pii = new PIIEncryption({ encryptionKey: TEST_KEY });

    it('should return true for encrypted values', () => {
      const encrypted = pii.encrypt('test@example.com');
      expect(pii.isEncrypted(encrypted)).toBe(true);
    });

    it('should return false for plain text', () => {
      expect(pii.isEncrypted('test@example.com')).toBe(false);
    });

    it('should return false for null', () => {
      expect(pii.isEncrypted(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(pii.isEncrypted(undefined)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(pii.isEncrypted('')).toBe(false);
    });
  });

  describe('encryptGuestPII / decryptGuestPII', () => {
    const pii = new PIIEncryption({ encryptionKey: TEST_KEY });

    it('should encrypt and decrypt guest PII fields', () => {
      const guest = {
        id: '123',
        name: 'John Doe',
        phone: '+6281234567890',
        email: 'john@example.com',
      };

      const encrypted = pii.encryptGuestPII(guest);
      expect(encrypted.phone).not.toBe(guest.phone);
      expect(encrypted.email).not.toBe(guest.email);
      expect(encrypted.name).toBe(guest.name); // Non-PII unchanged
      expect(encrypted.id).toBe(guest.id); // Non-PII unchanged

      const decrypted = pii.decryptGuestPII(encrypted);
      expect(decrypted.phone).toBe(guest.phone);
      expect(decrypted.email).toBe(guest.email);
    });

    it('should handle null PII fields', () => {
      const guest = {
        id: '123',
        name: 'Jane Doe',
        phone: null,
        email: null,
      };

      const encrypted = pii.encryptGuestPII(guest);
      expect(encrypted.phone).toBeNull();
      expect(encrypted.email).toBeNull();

      const decrypted = pii.decryptGuestPII(encrypted);
      expect(decrypted.phone).toBeNull();
      expect(decrypted.email).toBeNull();
    });
  });
});
