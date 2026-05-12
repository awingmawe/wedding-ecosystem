// Enums for Wedding Digital SaaS platform

/** User roles within the platform (Req 2.5) */
export enum UserRole {
  ADMIN = 'admin',
  CLIENT = 'client',
  WO = 'wo',
  SCANNER = 'scanner',
}

/** Guest group classification (Req 3.1) */
export enum GuestGroup {
  FAMILY = 'family',
  FRIEND = 'friend',
  COLLEAGUE = 'colleague',
  VIP = 'vip',
}

/** Guest type: invited or walk-in (Req 8.5) */
export enum GuestType {
  INVITED = 'invited',
  GO_SHOW = 'go_show',
}

/** RSVP attendance choice (Req 4.2) */
export enum AttendanceType {
  AKAD = 'akad',
  RESEPSI = 'resepsi',
  BOTH = 'both',
  DECLINE = 'decline',
}

/** Check-in method used (Req 7.2, 8.5) */
export enum CheckInMethod {
  QR_SCAN = 'qr_scan',
  MANUAL = 'manual',
  GO_SHOW = 'go_show',
}

/** Invitation section types for CMS (Req 5.2) */
export enum SectionType {
  COVER = 'cover',
  BRIDE_GROOM = 'bride_groom',
  STORY = 'story',
  VERSE = 'verse',
  COUNTDOWN = 'countdown',
  AKAD_RESEPSI = 'akad_resepsi',
  RSVP = 'rsvp',
  ATTIRE = 'attire',
  GALLERY = 'gallery',
  VIDEO = 'video',
  GIFT = 'gift',
  MESSAGES = 'messages',
  CLOSING = 'closing',
  MUSIC = 'music',
}

/** Event lifecycle status */
export enum EventStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  COMPLETED = 'completed',
}

/** Scanner lane assignment (max 2 per event) */
export enum ScannerLane {
  LANE_1 = 'lane_1',
  LANE_2 = 'lane_2',
}

/** Scanner verification result status (Req 7.2) */
export enum VerificationStatus {
  GREEN = 'green',
  RED = 'red',
  YELLOW = 'yellow',
}

/** Tenant plan types */
export enum PlanType {
  BASIC = 'basic',
  PREMIUM = 'premium',
  ENTERPRISE = 'enterprise',
}

/** Invitation delivery status (Req 14.7) */
export enum DeliveryStatus {
  NOT_SENT = 'not_sent',
  SENT = 'sent',
  FAILED = 'failed',
}
