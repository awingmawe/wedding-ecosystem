import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Recreate the schema logic for testing (same as in rsvp-form.tsx)
function createRsvpSchema(plusOneCount: number) {
  return z
    .object({
      attendance: z.enum(['akad', 'resepsi', 'both', 'decline'], {
        required_error: 'Pilih kehadiran Anda',
      }),
      guest_count: z.coerce
        .number()
        .min(1, 'Minimal 1 tamu')
        .max(plusOneCount + 1, `Maksimal ${plusOneCount + 1} tamu`)
        .optional(),
    })
    .transform((data) => {
      if (data.attendance === 'decline') {
        return { ...data, guest_count: 0 };
      }
      return data;
    });
}

describe('RSVP Form Validation', () => {
  describe('attendance field', () => {
    it('accepts valid attendance values', () => {
      const schema = createRsvpSchema(2);
      const validValues = ['akad', 'resepsi', 'both', 'decline'] as const;

      for (const value of validValues) {
        const result = schema.safeParse({ attendance: value, guest_count: 1 });
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid attendance values', () => {
      const schema = createRsvpSchema(2);
      const result = schema.safeParse({ attendance: 'invalid', guest_count: 1 });
      expect(result.success).toBe(false);
    });

    it('requires attendance field', () => {
      const schema = createRsvpSchema(2);
      const result = schema.safeParse({ guest_count: 1 });
      expect(result.success).toBe(false);
    });
  });

  describe('guest_count field', () => {
    it('accepts guest_count within valid range', () => {
      const schema = createRsvpSchema(3); // max = 3 + 1 = 4
      const result = schema.safeParse({ attendance: 'both', guest_count: 4 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.guest_count).toBe(4);
      }
    });

    it('rejects guest_count exceeding plus_one_count + 1', () => {
      const schema = createRsvpSchema(2); // max = 2 + 1 = 3
      const result = schema.safeParse({ attendance: 'both', guest_count: 4 });
      expect(result.success).toBe(false);
    });

    it('rejects guest_count less than 1', () => {
      const schema = createRsvpSchema(2);
      const result = schema.safeParse({ attendance: 'akad', guest_count: 0 });
      expect(result.success).toBe(false);
    });

    it('accepts guest_count of 1 (minimum)', () => {
      const schema = createRsvpSchema(0); // max = 0 + 1 = 1
      const result = schema.safeParse({ attendance: 'resepsi', guest_count: 1 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.guest_count).toBe(1);
      }
    });
  });

  describe('decline behavior', () => {
    it('sets guest_count to 0 when attendance is decline', () => {
      const schema = createRsvpSchema(3);
      const result = schema.safeParse({ attendance: 'decline', guest_count: 2 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.guest_count).toBe(0);
      }
    });

    it('sets guest_count to 0 when decline without guest_count', () => {
      const schema = createRsvpSchema(3);
      const result = schema.safeParse({ attendance: 'decline' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.guest_count).toBe(0);
      }
    });
  });

  describe('edge cases', () => {
    it('handles plus_one_count of 0 (only the guest themselves)', () => {
      const schema = createRsvpSchema(0); // max = 0 + 1 = 1
      const result = schema.safeParse({ attendance: 'both', guest_count: 2 });
      expect(result.success).toBe(false);
    });

    it('handles large plus_one_count', () => {
      const schema = createRsvpSchema(10); // max = 10 + 1 = 11
      const result = schema.safeParse({ attendance: 'akad', guest_count: 11 });
      expect(result.success).toBe(true);
    });
  });
});
