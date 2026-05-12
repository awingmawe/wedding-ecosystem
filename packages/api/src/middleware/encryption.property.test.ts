import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { randomBytes } from 'crypto';
import { PIIEncryption } from './encryption';

// --- Constants ---

const TEST_KEY = randomBytes(32).toString('hex');

// --- Arbitraries ---

/** Generates arbitrary phone numbers (Indonesian format) */
const arbPhone = fc
  .tuple(
    fc.constantFrom('+62', '08'),
    fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 8, maxLength: 13 })
  )
  .map(([prefix, digits]) => `${prefix}${digits.join('')}`);

/** Generates arbitrary email addresses */
const arbEmail = fc
  .tuple(
    fc.stringMatching(/^[a-z0-9]{1,20}$/),
    fc.constantFrom('gmail.com', 'yahoo.com', 'outlook.com', 'example.co.id', 'mail.com')
  )
  .map(([local, domain]) => `${local}@${domain}`);

/** Generates arbitrary non-empty PII strings (phone or email) */
const arbPIIValue = fc.oneof(arbPhone, arbEmail);

// --- Property Tests ---

describe('Property 17: PII Encryption at Rest', () => {
  /**
   * **Validates: Requirement 13.2**
   *
   * For any guest record stored in the database, the PII fields (phone, email)
   * SHALL be encrypted at rest such that the stored values are not equal to the
   * plaintext values, and decrypting the stored values SHALL return the original plaintext.
   */

  it('encrypted PII value is never equal to the plaintext value', () => {
    const pii = new PIIEncryption({ encryptionKey: TEST_KEY });

    fc.assert(
      fc.property(arbPIIValue, (plaintext) => {
        const encrypted = pii.encrypt(plaintext);

        // Encrypted value must exist
        expect(encrypted).not.toBeNull();
        // Encrypted value must differ from plaintext
        expect(encrypted).not.toBe(plaintext);
        // Encrypted value must not contain the plaintext as a substring
        expect(encrypted!.includes(plaintext)).toBe(false);
      }),
      { numRuns: 200 }
    );
  });

  it('decrypting an encrypted PII value returns the original plaintext (roundtrip)', () => {
    const pii = new PIIEncryption({ encryptionKey: TEST_KEY });

    fc.assert(
      fc.property(arbPIIValue, (plaintext) => {
        const encrypted = pii.encrypt(plaintext);
        const decrypted = pii.decrypt(encrypted);

        // Roundtrip: decrypt(encrypt(x)) === x
        expect(decrypted).toBe(plaintext);
      }),
      { numRuns: 200 }
    );
  });

  it('encrypted values at rest are not readable as plaintext (format is hex iv:data)', () => {
    const pii = new PIIEncryption({ encryptionKey: TEST_KEY });

    fc.assert(
      fc.property(arbPIIValue, (plaintext) => {
        const encrypted = pii.encrypt(plaintext);

        // Must be in iv:encrypted hex format
        expect(encrypted).toMatch(/^[0-9a-f]{32}:[0-9a-f]+$/);
        // The stored value is pure hex — not human-readable as the original PII
        const parts = encrypted!.split(':');
        expect(parts).toHaveLength(2);
        // IV is 16 bytes = 32 hex chars
        expect(parts[0]).toHaveLength(32);
        // Encrypted data portion is non-empty hex
        expect(parts[1].length).toBeGreaterThan(0);
      }),
      { numRuns: 200 }
    );
  });

  it('encryptGuestPII produces encrypted phone and email that differ from plaintext', () => {
    const pii = new PIIEncryption({ encryptionKey: TEST_KEY });

    fc.assert(
      fc.property(arbPhone, arbEmail, (phone, email) => {
        const guest = { id: 'guest-1', name: 'Test Guest', phone, email };
        const encrypted = pii.encryptGuestPII(guest);

        // Phone and email must be encrypted (different from plaintext)
        expect(encrypted.phone).not.toBe(phone);
        expect(encrypted.email).not.toBe(email);
        // Non-PII fields remain unchanged
        expect(encrypted.id).toBe(guest.id);
        expect(encrypted.name).toBe(guest.name);
      }),
      { numRuns: 200 }
    );
  });

  it('decryptGuestPII restores original phone and email from encrypted guest record', () => {
    const pii = new PIIEncryption({ encryptionKey: TEST_KEY });

    fc.assert(
      fc.property(arbPhone, arbEmail, (phone, email) => {
        const guest = { id: 'guest-1', name: 'Test Guest', phone, email };
        const encrypted = pii.encryptGuestPII(guest);
        const decrypted = pii.decryptGuestPII(encrypted);

        // Roundtrip on guest record: decrypt(encrypt(guest)).phone === guest.phone
        expect(decrypted.phone).toBe(phone);
        expect(decrypted.email).toBe(email);
        // Non-PII fields remain unchanged
        expect(decrypted.id).toBe(guest.id);
        expect(decrypted.name).toBe(guest.name);
      }),
      { numRuns: 200 }
    );
  });
});
