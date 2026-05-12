import { describe, expect, it } from 'vitest';

import { AttendanceType, GuestGroup, GuestType, UserRole } from './enums';
import {
  createGuestSchema,
  createMessageSchema,
  createRsvpSchema,
  createUserSchema,
  goShowSchema,
  guestSearchSchema,
  loginSchema,
  updateDashboardThemeSchema,
} from './validation';

describe('loginSchema', () => {
  it('accepts valid login input', () => {
    const result = loginSchema.safeParse({
      email: 'user@example.com',
      password: 'password123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email format', () => {
    const result = loginSchema.safeParse({
      email: 'not-an-email',
      password: 'password123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty password', () => {
    const result = loginSchema.safeParse({
      email: 'user@example.com',
      password: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('createUserSchema', () => {
  it('accepts valid user input', () => {
    const result = createUserSchema.safeParse({
      email: 'admin@wedding.com',
      password: 'securepass',
      role: UserRole.CLIENT,
      name: 'John Doe',
    });
    expect(result.success).toBe(true);
  });

  it('rejects password shorter than 8 characters', () => {
    const result = createUserSchema.safeParse({
      email: 'admin@wedding.com',
      password: 'short',
      role: UserRole.CLIENT,
      name: 'John Doe',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid role', () => {
    const result = createUserSchema.safeParse({
      email: 'admin@wedding.com',
      password: 'securepass',
      role: 'superadmin',
      name: 'John Doe',
    });
    expect(result.success).toBe(false);
  });
});

describe('createGuestSchema', () => {
  it('accepts valid guest with required fields only', () => {
    const result = createGuestSchema.safeParse({
      name: 'Budi Santoso',
      group: GuestGroup.FAMILY,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.plus_one_count).toBe(0);
      expect(result.data.type).toBe(GuestType.INVITED);
    }
  });

  it('accepts valid guest with all optional fields', () => {
    const result = createGuestSchema.safeParse({
      name: 'Siti Rahayu',
      group: GuestGroup.VIP,
      phone: '+6281234567890',
      email: 'siti@example.com',
      plus_one_count: 3,
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = createGuestSchema.safeParse({
      name: '',
      group: GuestGroup.FRIEND,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid group', () => {
    const result = createGuestSchema.safeParse({
      name: 'Test Guest',
      group: 'unknown',
    });
    expect(result.success).toBe(false);
  });

  it('rejects name exceeding 1000 characters', () => {
    const result = createGuestSchema.safeParse({
      name: 'A'.repeat(1001),
      group: GuestGroup.FRIEND,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative plus_one_count', () => {
    const result = createGuestSchema.safeParse({
      name: 'Test',
      group: GuestGroup.FRIEND,
      plus_one_count: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe('createRsvpSchema', () => {
  it('accepts valid RSVP with attendance both', () => {
    const result = createRsvpSchema.safeParse({
      attendance: AttendanceType.BOTH,
      guest_count: 2,
    });
    expect(result.success).toBe(true);
  });

  it('accepts decline with guest_count 0', () => {
    const result = createRsvpSchema.safeParse({
      attendance: AttendanceType.DECLINE,
      guest_count: 0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects decline with guest_count > 0', () => {
    const result = createRsvpSchema.safeParse({
      attendance: AttendanceType.DECLINE,
      guest_count: 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-decline with guest_count 0', () => {
    const result = createRsvpSchema.safeParse({
      attendance: AttendanceType.AKAD,
      guest_count: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid attendance type', () => {
    const result = createRsvpSchema.safeParse({
      attendance: 'maybe',
      guest_count: 1,
    });
    expect(result.success).toBe(false);
  });
});

describe('createMessageSchema', () => {
  it('accepts valid message', () => {
    const result = createMessageSchema.safeParse({
      sender_name: 'Budi',
      message_text: 'Selamat menempuh hidup baru!',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty sender name', () => {
    const result = createMessageSchema.safeParse({
      sender_name: '',
      message_text: 'Congrats!',
    });
    expect(result.success).toBe(false);
  });

  it('rejects message exceeding 500 characters', () => {
    const result = createMessageSchema.safeParse({
      sender_name: 'Budi',
      message_text: 'A'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('rejects sender name exceeding 100 characters', () => {
    const result = createMessageSchema.safeParse({
      sender_name: 'A'.repeat(101),
      message_text: 'Hello',
    });
    expect(result.success).toBe(false);
  });
});

describe('goShowSchema', () => {
  it('accepts valid go-show input', () => {
    const result = goShowSchema.safeParse({
      name: 'Walk-in Guest',
      event_id: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid UUID for event_id', () => {
    const result = goShowSchema.safeParse({
      name: 'Walk-in Guest',
      event_id: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty name', () => {
    const result = goShowSchema.safeParse({
      name: '',
      event_id: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(false);
  });
});

describe('guestSearchSchema', () => {
  it('accepts valid search with 3+ characters', () => {
    const result = guestSearchSchema.safeParse({
      q: 'Bud',
      event_id: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  it('rejects search with fewer than 3 characters', () => {
    const result = guestSearchSchema.safeParse({
      q: 'Bu',
      event_id: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateDashboardThemeSchema', () => {
  it('accepts valid hex colors', () => {
    const result = updateDashboardThemeSchema.safeParse({
      primary_color: '#A8BBA3',
      secondary_color: '#F7F4EA',
      accent_color: '#B87C4C',
      surface_color: '#EBD9D1',
      text_color: '#2D3436',
    });
    expect(result.success).toBe(true);
  });

  it('accepts 3-digit hex colors', () => {
    const result = updateDashboardThemeSchema.safeParse({
      primary_color: '#ABC',
      secondary_color: '#DEF',
      accent_color: '#123',
      surface_color: '#456',
      text_color: '#789',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid hex color format', () => {
    const result = updateDashboardThemeSchema.safeParse({
      primary_color: 'red',
      secondary_color: '#F7F4EA',
      accent_color: '#B87C4C',
      surface_color: '#EBD9D1',
      text_color: '#2D3436',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty color value', () => {
    const result = updateDashboardThemeSchema.safeParse({
      primary_color: '',
      secondary_color: '#F7F4EA',
      accent_color: '#B87C4C',
      surface_color: '#EBD9D1',
      text_color: '#2D3436',
    });
    expect(result.success).toBe(false);
  });

  it('rejects partial hex (e.g. #AB)', () => {
    const result = updateDashboardThemeSchema.safeParse({
      primary_color: '#AB',
      secondary_color: '#F7F4EA',
      accent_color: '#B87C4C',
      surface_color: '#EBD9D1',
      text_color: '#2D3436',
    });
    expect(result.success).toBe(false);
  });
});
