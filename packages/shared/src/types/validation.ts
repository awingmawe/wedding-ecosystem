// Zod validation schemas for server-side input validation (Req 13.5)

import { z } from 'zod';

import {
  AttendanceType,
  CheckInMethod,
  EventStatus,
  GuestGroup,
  GuestType,
  PlanType,
  ScannerLane,
  SectionType,
  UserRole,
} from './enums';

// --- Shared validation constants ---

/** Maximum string length for general text fields (Req 13.5) */
export const MAX_TEXT_LENGTH = 1000;

/** Maximum message text length (Req 6.11) */
export const MAX_MESSAGE_LENGTH = 500;

/** Maximum sender name length (Req 6.11) */
export const MAX_SENDER_NAME_LENGTH = 100;

/** Maximum guests per CSV import (Req 3.2) */
export const MAX_CSV_ROWS = 2000;

/** Maximum guests per page (Req 3.9) */
export const GUESTS_PER_PAGE = 50;

/** Maximum search results for manual check-in (Req 8.1) */
export const MAX_SEARCH_RESULTS = 10;

/** Minimum search characters for manual check-in (Req 8.1) */
export const MIN_SEARCH_CHARS = 3;

/** Maximum messages per page (Req 6.12) */
export const MESSAGES_PER_PAGE = 20;

/** Maximum bulk send per batch (Req 14.3) */
export const MAX_BULK_SEND = 500;

/** Rate limit: requests per minute per tenant (Req 13.3) */
export const RATE_LIMIT_PER_MINUTE = 100;

// --- Reusable field schemas ---

const emailSchema = z
  .string()
  .email({ message: 'Format email tidak valid' })
  .max(MAX_TEXT_LENGTH, { message: `Email maksimal ${MAX_TEXT_LENGTH} karakter` });

const phoneSchema = z
  .string()
  .regex(/^\+?[0-9\s\-()]{7,20}$/, {
    message: 'Format nomor telepon tidak valid',
  })
  .max(20, { message: 'Nomor telepon maksimal 20 karakter' });

const nameSchema = z
  .string()
  .min(1, { message: 'Nama tidak boleh kosong' })
  .max(MAX_TEXT_LENGTH, { message: `Nama maksimal ${MAX_TEXT_LENGTH} karakter` });

const slugSchema = z
  .string()
  .min(1, { message: 'Slug tidak boleh kosong' })
  .max(200, { message: 'Slug maksimal 200 karakter' })
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Slug hanya boleh berisi huruf kecil, angka, dan tanda hubung',
  });

const hexColorSchema = z.string().regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, {
  message: 'Format warna harus hex valid (contoh: #RRGGBB atau #RGB)',
});

const urlSchema = z
  .string()
  .url({ message: 'Format URL tidak valid' })
  .max(MAX_TEXT_LENGTH, { message: `URL maksimal ${MAX_TEXT_LENGTH} karakter` });

// --- Entity validation schemas ---

/** Tenant creation input */
export const createTenantSchema = z.object({
  name: nameSchema,
  slug: slugSchema,
  plan_type: z.nativeEnum(PlanType, {
    errorMap: () => ({ message: 'Tipe paket tidak valid' }),
  }),
});

/** User registration input */
export const createUserSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(8, { message: 'Password minimal 8 karakter' })
    .max(128, { message: 'Password maksimal 128 karakter' }),
  role: z.nativeEnum(UserRole, {
    errorMap: () => ({ message: 'Role tidak valid' }),
  }),
  name: nameSchema,
});

/** Login input */
export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(1, { message: 'Password tidak boleh kosong' })
    .max(128, { message: 'Password maksimal 128 karakter' }),
});

/** Event creation input */
export const createEventSchema = z.object({
  slug: slugSchema,
  bride_name: nameSchema,
  groom_name: nameSchema,
  event_date: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Format tanggal tidak valid',
  }),
  venue_name: z
    .string()
    .min(1, { message: 'Nama venue tidak boleh kosong' })
    .max(MAX_TEXT_LENGTH, { message: `Nama venue maksimal ${MAX_TEXT_LENGTH} karakter` }),
  venue_address: z
    .string()
    .min(1, { message: 'Alamat venue tidak boleh kosong' })
    .max(MAX_TEXT_LENGTH, { message: `Alamat venue maksimal ${MAX_TEXT_LENGTH} karakter` }),
  venue_maps_url: urlSchema.optional().or(z.literal('')),
  akad_start: z.string().max(10, { message: 'Format waktu tidak valid' }),
  akad_end: z.string().max(10, { message: 'Format waktu tidak valid' }),
  resepsi_start: z.string().max(10, { message: 'Format waktu tidak valid' }),
  resepsi_end: z.string().max(10, { message: 'Format waktu tidak valid' }),
  status: z.nativeEnum(EventStatus).optional().default(EventStatus.DRAFT),
});

/** Guest creation input (Req 3.1) */
export const createGuestSchema = z.object({
  name: nameSchema,
  group: z.nativeEnum(GuestGroup, {
    errorMap: () => ({ message: 'Grup tamu tidak valid (family, friend, colleague, vip)' }),
  }),
  phone: phoneSchema.optional().or(z.literal('')),
  email: emailSchema.optional().or(z.literal('')),
  plus_one_count: z
    .number()
    .int({ message: 'Jumlah plus one harus bilangan bulat' })
    .min(0, { message: 'Jumlah plus one minimal 0' })
    .max(10, { message: 'Jumlah plus one maksimal 10' })
    .optional()
    .default(0),
  type: z.nativeEnum(GuestType).optional().default(GuestType.INVITED),
});

/** Guest update input */
export const updateGuestSchema = createGuestSchema.partial();

/** RSVP submission input (Req 4.1, 4.3) */
export const createRsvpSchema = z
  .object({
    attendance: z.nativeEnum(AttendanceType, {
      errorMap: () => ({ message: 'Pilihan kehadiran tidak valid' }),
    }),
    guest_count: z
      .number()
      .int({ message: 'Jumlah tamu harus bilangan bulat' })
      .min(0, { message: 'Jumlah tamu minimal 0' })
      .max(11, { message: 'Jumlah tamu melebihi batas' }),
  })
  .refine(
    (data) => {
      if (data.attendance === AttendanceType.DECLINE) {
        return data.guest_count === 0;
      }
      return data.guest_count >= 1;
    },
    {
      message: 'Jumlah tamu harus 0 jika menolak, atau minimal 1 jika hadir',
      path: ['guest_count'],
    }
  );

/** Check-in via QR scan input */
export const qrCheckInSchema = z.object({
  qr_payload: z
    .string()
    .min(1, { message: 'QR payload tidak boleh kosong' })
    .max(MAX_TEXT_LENGTH, { message: `QR payload maksimal ${MAX_TEXT_LENGTH} karakter` }),
  event_id: z.string().uuid({ message: 'ID event tidak valid' }),
  scanner_device_id: z.string().uuid({ message: 'ID device tidak valid' }).optional(),
});

/** Manual check-in input */
export const manualCheckInSchema = z.object({
  guest_id: z.string().uuid({ message: 'ID tamu tidak valid' }),
  event_id: z.string().uuid({ message: 'ID event tidak valid' }),
  scanner_device_id: z.string().uuid({ message: 'ID device tidak valid' }).optional(),
});

/** Go-Show guest registration input (Req 8.5) */
export const goShowSchema = z.object({
  name: nameSchema,
  event_id: z.string().uuid({ message: 'ID event tidak valid' }),
  scanner_device_id: z.string().uuid({ message: 'ID device tidak valid' }).optional(),
});

/** Guest search input (Req 8.1) */
export const guestSearchSchema = z.object({
  q: z
    .string()
    .min(MIN_SEARCH_CHARS, {
      message: `Kata kunci pencarian minimal ${MIN_SEARCH_CHARS} karakter`,
    })
    .max(MAX_TEXT_LENGTH, { message: `Kata kunci maksimal ${MAX_TEXT_LENGTH} karakter` }),
  event_id: z.string().uuid({ message: 'ID event tidak valid' }),
});

/** Message/wish submission input (Req 6.11) */
export const createMessageSchema = z.object({
  sender_name: z
    .string()
    .min(1, { message: 'Nama pengirim tidak boleh kosong' })
    .max(MAX_SENDER_NAME_LENGTH, {
      message: `Nama pengirim maksimal ${MAX_SENDER_NAME_LENGTH} karakter`,
    }),
  message_text: z
    .string()
    .min(1, { message: 'Pesan tidak boleh kosong' })
    .max(MAX_MESSAGE_LENGTH, {
      message: `Pesan maksimal ${MAX_MESSAGE_LENGTH} karakter`,
    }),
});

/** Invitation section content update input */
export const updateSectionSchema = z.object({
  section_type: z.nativeEnum(SectionType, {
    errorMap: () => ({ message: 'Tipe section tidak valid' }),
  }),
  sort_order: z
    .number()
    .int({ message: 'Urutan harus bilangan bulat' })
    .min(1, { message: 'Urutan minimal 1' })
    .optional(),
  is_active: z.boolean().optional(),
  content: z.record(z.unknown()).optional(),
});

/** Scanner device registration input */
export const registerScannerSchema = z.object({
  device_name: z
    .string()
    .min(1, { message: 'Nama device tidak boleh kosong' })
    .max(MAX_TEXT_LENGTH, { message: `Nama device maksimal ${MAX_TEXT_LENGTH} karakter` }),
  lane: z.nativeEnum(ScannerLane, {
    errorMap: () => ({ message: 'Lane tidak valid (lane_1 atau lane_2)' }),
  }),
  event_id: z.string().uuid({ message: 'ID event tidak valid' }),
});

/** Theme update input (Req 11.1, 11.6) */
export const updateDashboardThemeSchema = z.object({
  primary_color: hexColorSchema,
  secondary_color: hexColorSchema,
  accent_color: hexColorSchema,
  surface_color: hexColorSchema,
  text_color: hexColorSchema,
});

export const updateInvitationThemeSchema = z.object({
  primary_color: hexColorSchema,
  secondary_color: hexColorSchema,
  accent_color: hexColorSchema,
  background_color: hexColorSchema,
  text_color: hexColorSchema,
});

/** Pagination input */
export const paginationSchema = z.object({
  page: z.number().int().min(1, { message: 'Halaman minimal 1' }).optional().default(1),
  per_page: z
    .number()
    .int()
    .min(1, { message: 'Item per halaman minimal 1' })
    .max(100, { message: 'Item per halaman maksimal 100' })
    .optional()
    .default(GUESTS_PER_PAGE),
});

// --- Type inference helpers ---

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateEventInput = z.infer<typeof createEventSchema>;
export type CreateGuestInput = z.infer<typeof createGuestSchema>;
export type UpdateGuestInput = z.infer<typeof updateGuestSchema>;
export type CreateRsvpInput = z.infer<typeof createRsvpSchema>;
export type QrCheckInInput = z.infer<typeof qrCheckInSchema>;
export type ManualCheckInInput = z.infer<typeof manualCheckInSchema>;
export type GoShowInput = z.infer<typeof goShowSchema>;
export type GuestSearchInput = z.infer<typeof guestSearchSchema>;
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
export type UpdateSectionInput = z.infer<typeof updateSectionSchema>;
export type RegisterScannerInput = z.infer<typeof registerScannerSchema>;
export type UpdateDashboardThemeInput = z.infer<typeof updateDashboardThemeSchema>;
export type UpdateInvitationThemeInput = z.infer<typeof updateInvitationThemeSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
