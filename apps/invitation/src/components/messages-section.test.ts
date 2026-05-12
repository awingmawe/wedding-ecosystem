import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Recreate the schema logic for testing (same as in messages-section.tsx)
const messageSchema = z.object({
  sender_name: z
    .string()
    .min(1, 'Nama tidak boleh kosong')
    .max(100, 'Nama maksimal 100 karakter'),
  message_text: z
    .string()
    .min(1, 'Ucapan tidak boleh kosong')
    .max(500, 'Ucapan maksimal 500 karakter'),
});

describe('Messages Form Validation', () => {
  describe('sender_name field', () => {
    it('accepts valid sender name', () => {
      const result = messageSchema.safeParse({
        sender_name: 'Budi Santoso',
        message_text: 'Selamat menempuh hidup baru!',
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty sender name', () => {
      const result = messageSchema.safeParse({
        sender_name: '',
        message_text: 'Selamat!',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Nama tidak boleh kosong');
      }
    });

    it('rejects sender name exceeding 100 characters', () => {
      const result = messageSchema.safeParse({
        sender_name: 'A'.repeat(101),
        message_text: 'Selamat!',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Nama maksimal 100 karakter');
      }
    });

    it('accepts sender name at exactly 100 characters', () => {
      const result = messageSchema.safeParse({
        sender_name: 'A'.repeat(100),
        message_text: 'Selamat!',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('message_text field', () => {
    it('accepts valid message text', () => {
      const result = messageSchema.safeParse({
        sender_name: 'Budi',
        message_text: 'Semoga bahagia selalu!',
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty message text', () => {
      const result = messageSchema.safeParse({
        sender_name: 'Budi',
        message_text: '',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Ucapan tidak boleh kosong');
      }
    });

    it('rejects message text exceeding 500 characters', () => {
      const result = messageSchema.safeParse({
        sender_name: 'Budi',
        message_text: 'A'.repeat(501),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Ucapan maksimal 500 karakter');
      }
    });

    it('accepts message text at exactly 500 characters', () => {
      const result = messageSchema.safeParse({
        sender_name: 'Budi',
        message_text: 'A'.repeat(500),
      });
      expect(result.success).toBe(true);
    });
  });

  describe('combined validation', () => {
    it('rejects when both fields are empty', () => {
      const result = messageSchema.safeParse({
        sender_name: '',
        message_text: '',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBe(2);
      }
    });

    it('accepts valid complete message', () => {
      const result = messageSchema.safeParse({
        sender_name: 'Keluarga Besar Wijaya',
        message_text: 'Selamat menempuh hidup baru! Semoga menjadi keluarga yang sakinah, mawaddah, warahmah.',
      });
      expect(result.success).toBe(true);
    });
  });
});
