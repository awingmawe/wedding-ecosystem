// Entity interfaces for Wedding Digital SaaS platform

import {
  AttendanceType,
  CheckInMethod,
  DeliveryStatus,
  EventStatus,
  GuestGroup,
  GuestType,
  PlanType,
  ScannerLane,
  SectionType,
  UserRole,
} from './enums';

/** Multi-tenant entity representing a business client */
export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan_type: PlanType;
  is_active: boolean;
  created_at: Date;
}

/** Platform user with role-based access */
export interface User {
  id: string;
  tenant_id: string;
  email: string;
  password_hash: string;
  role: UserRole;
  name: string;
  created_at: Date;
}

/** Wedding event owned by a tenant */
export interface Event {
  id: string;
  tenant_id: string;
  slug: string;
  bride_name: string;
  groom_name: string;
  event_date: Date;
  venue_name: string;
  venue_address: string;
  venue_maps_url: string;
  akad_start: string;
  akad_end: string;
  resepsi_start: string;
  resepsi_end: string;
  status: EventStatus;
  created_at: Date;
}

/** Event configuration including theme and section settings */
export interface EventConfig {
  id: string;
  event_id: string;
  theme_config: ThemeConfig;
  active_sections: SectionType[];
  invitation_music_url: string | null;
  calendar_link: string | null;
  max_scanner_devices: number;
  max_guests: number;
  updated_at: Date;
}

/** Theme configuration for dashboard and invitation */
export interface ThemeConfig {
  dashboard: DashboardTheme;
  invitation: InvitationTheme;
}

export interface DashboardTheme {
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  surface_color: string;
  text_color: string;
  font_family: string;
  font_heading: string;
}

export interface InvitationTheme {
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  background_color: string;
  text_color: string;
  font_family: string;
  font_heading: string;
  template_id: string;
}

/** Guest record within an event */
export interface Guest {
  id: string;
  event_id: string;
  name: string;
  slug: string;
  phone: string | null;
  email: string | null;
  group: GuestGroup;
  type: GuestType;
  plus_one_count: number;
  invitation_url: string | null;
  delivery_status: DeliveryStatus;
  created_at: Date;
}

/** QR code associated with a guest */
export interface QRCode {
  id: string;
  guest_id: string;
  qr_payload: string;
  qr_image_url: string | null;
  is_active: boolean;
  generated_at: Date;
}

/** RSVP submission from a guest */
export interface RSVP {
  id: string;
  guest_id: string;
  attendance: AttendanceType;
  guest_count: number;
  submitted_at: Date;
}

/** Check-in record for a guest at the venue */
export interface CheckIn {
  id: string;
  guest_id: string;
  scanner_device_id: string | null;
  method: CheckInMethod;
  checked_in_at: Date;
}

/** CMS section for an invitation */
export interface InvitationSection {
  id: string;
  event_id: string;
  section_type: SectionType;
  sort_order: number;
  is_active: boolean;
  content: Record<string, unknown>;
  updated_at: Date;
}

/** Scanner device registered for an event */
export interface ScannerDevice {
  id: string;
  event_id: string;
  device_name: string;
  lane: ScannerLane;
  is_active: boolean;
  last_active_at: Date;
}

/** Guest message/wish for the couple */
export interface Message {
  id: string;
  event_id: string;
  sender_name: string;
  message_text: string;
  created_at: Date;
  is_visible: boolean;
}
