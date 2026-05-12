// API response types for the platform

import { VerificationStatus } from './enums';
import { ApiError } from './errors';
import {
  CheckIn,
  Event,
  EventConfig,
  Guest,
  InvitationSection,
  Message,
  QRCode,
  RSVP,
  ScannerDevice,
  Tenant,
  User,
} from './interfaces';

// --- Generic response wrappers ---

/** Successful API response with data */
export interface ApiSuccess<T> {
  success: true;
  data: T;
}

/** Paginated response */
export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

/** Union type for all API responses */
export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// --- Auth responses ---

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface LoginResponse {
  user: Omit<User, 'password_hash'>;
  tokens: AuthTokens;
}

// --- Guest responses ---

/** Guest with related data for list views */
export interface GuestWithStatus extends Omit<Guest, 'event_id'> {
  rsvp: RSVP | null;
  check_in: CheckIn | null;
  qr_code: Pick<QRCode, 'qr_image_url' | 'is_active'> | null;
}

/** CSV import result report (Req 3.3) */
export interface CsvImportReport {
  total_rows: number;
  success_count: number;
  failed_count: number;
  failed_rows: CsvImportError[];
}

export interface CsvImportError {
  row_number: number;
  data: Record<string, string>;
  errors: string[];
}

// --- Scanner/Check-in responses ---

/** QR scan verification result (Req 7.2) */
export interface ScanVerificationResult {
  status: VerificationStatus;
  guest_name: string | null;
  guest_group: string | null;
  message: string;
  checked_in_at: Date | null;
}

// --- Real-time/Stats responses ---

/** Dashboard statistics (Req 9.6) */
export interface EventStats {
  total_guests: number;
  total_rsvp: number;
  total_checked_in: number;
  total_go_show: number;
  rsvp_breakdown: {
    akad: number;
    resepsi: number;
    both: number;
    decline: number;
  };
}

// --- Invitation responses ---

/** Full invitation data for rendering */
export interface InvitationData {
  event: Pick<
    Event,
    | 'slug'
    | 'bride_name'
    | 'groom_name'
    | 'event_date'
    | 'venue_name'
    | 'venue_address'
    | 'venue_maps_url'
    | 'akad_start'
    | 'akad_end'
    | 'resepsi_start'
    | 'resepsi_end'
  >;
  guest: Pick<Guest, 'name' | 'slug' | 'plus_one_count'>;
  config: Pick<EventConfig, 'theme_config' | 'invitation_music_url' | 'calendar_link'>;
  sections: Pick<InvitationSection, 'section_type' | 'sort_order' | 'content'>[];
}

// --- WebSocket event payloads ---

export interface WsCheckInEvent {
  event_type: 'guest_checked_in';
  event_id: string;
  guest_id: string;
  guest_name: string;
  method: string;
  checked_in_at: Date;
}

export interface WsRsvpEvent {
  event_type: 'rsvp_updated';
  event_id: string;
  guest_id: string;
  guest_name: string;
  attendance: string;
  guest_count: number;
}

export interface WsGoShowEvent {
  event_type: 'go_show_added';
  event_id: string;
  guest_id: string;
  guest_name: string;
}

export interface WsGuestAddedEvent {
  event_type: 'guest_added';
  event_id: string;
  guest_id: string;
  guest_name: string;
}

export type WsEvent = WsCheckInEvent | WsRsvpEvent | WsGoShowEvent | WsGuestAddedEvent;

// --- Notification responses ---

export interface NotificationResult {
  guest_id: string;
  status: 'sent' | 'failed';
  error?: string;
}

export interface BulkNotificationReport {
  total: number;
  sent: number;
  failed: number;
  results: NotificationResult[];
}

// --- Re-export entity types for convenience ---

export type {
  Tenant,
  User,
  Event,
  EventConfig,
  Guest,
  QRCode,
  RSVP,
  CheckIn,
  InvitationSection,
  ScannerDevice,
  Message,
};
