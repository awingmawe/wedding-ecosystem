import { randomUUID, createCipheriv, randomBytes } from 'crypto';
import { ErrorCode } from '@wedding/shared';
import type {
  CreateGuestInput,
  UpdateGuestInput,
  PaginationInput,
} from '@wedding/shared';
import { GuestGroup, GuestType, DeliveryStatus } from '@wedding/shared';

// --- Constants ---

const GUESTS_PER_PAGE = 50;
const AES_ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;
/** Minimum characters for guest name search */
const MIN_SEARCH_CHARS = 3;
/** Maximum search results returned */
const MAX_SEARCH_RESULTS = 10;

// --- Types ---

export interface GuestRecord {
  id: string;
  event_id: string;
  tenant_id: string;
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

export interface QRCodeRecord {
  id: string;
  guest_id: string;
  qr_payload: string;
  qr_image_url: string | null;
  is_active: boolean;
  generated_at: Date;
}

export interface GuestWithQR extends GuestRecord {
  qr_code: QRCodeRecord | null;
}

export interface GuestListItem {
  id: string;
  name: string;
  slug: string;
  group: GuestGroup;
  type: GuestType;
  plus_one_count: number;
  phone: string | null;
  email: string | null;
  invitation_url: string | null;
  delivery_status: DeliveryStatus;
  rsvp_status: string | null;
  check_in_status: boolean;
  qr_active: boolean;
}

export interface PaginatedGuestList {
  data: GuestListItem[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

export interface GuestFilterOptions {
  group?: GuestGroup;
  status?: 'belum_rsvp' | 'confirmed' | 'declined' | 'checked_in';
}

export interface GuestServiceError {
  code: ErrorCode;
  message: string;
}

// --- Repository interface (dependency injection) ---

export interface GuestRepository {
  createGuest(data: {
    id: string;
    event_id: string;
    tenant_id: string;
    name: string;
    slug: string;
    phone: string | null;
    email: string | null;
    group: GuestGroup;
    type: GuestType;
    plus_one_count: number;
    invitation_url: string | null;
    delivery_status: DeliveryStatus;
  }): Promise<GuestRecord>;

  createQRCode(data: {
    id: string;
    guest_id: string;
    qr_payload: string;
    is_active: boolean;
  }): Promise<QRCodeRecord>;

  findGuestById(guestId: string, tenantId: string): Promise<GuestRecord | null>;

  findGuestBySlug(
    eventId: string,
    slug: string
  ): Promise<GuestRecord | null>;

  findGuestsByEvent(
    eventId: string,
    tenantId: string,
    pagination: PaginationInput,
    filters?: GuestFilterOptions
  ): Promise<PaginatedGuestList>;

  updateGuest(
    guestId: string,
    tenantId: string,
    data: Partial<{
      name: string;
      slug: string;
      phone: string | null;
      email: string | null;
      group: GuestGroup;
      plus_one_count: number;
      invitation_url: string | null;
    }>
  ): Promise<GuestRecord | null>;

  deleteGuest(guestId: string, tenantId: string): Promise<boolean>;

  deactivateQRCode(guestId: string): Promise<boolean>;

  findQRCodeByGuestId(guestId: string): Promise<QRCodeRecord | null>;

  checkSlugExists(eventId: string, slug: string): Promise<boolean>;

  checkQRPayloadExists(payload: string): Promise<boolean>;

  findEventById(eventId: string, tenantId: string): Promise<{ id: string; slug: string } | null>;

  /**
   * Fetch all guest names for an event, used to pre-seed the duplicate-detection
   * set before a bulk import so existing names are excluded from the batch.
   */
  findGuestNamesByEvent(eventId: string, tenantId: string): Promise<string[]>;

  /**
   * Case-insensitive partial name search within a specific event.
   * Returns at most `limit` records.
   */
  searchGuestsByName(
    query: string,
    eventId: string,
    tenantId: string,
    limit: number
  ): Promise<GuestRecord[]>;
}

// --- Guest Service ---

export class GuestService {
  private readonly repository: GuestRepository;
  private readonly encryptionKey: Buffer;

  constructor(config: { repository: GuestRepository; encryptionKey: string }) {
    this.repository = config.repository;
    // AES-256 requires a 32-byte key
    this.encryptionKey = Buffer.from(config.encryptionKey, 'hex');
    if (this.encryptionKey.length !== 32) {
      throw new Error(
        'Encryption key must be 32 bytes (64 hex characters) for AES-256'
      );
    }
  }

  // --- Create Guest ---

  /**
   * Add a new guest with auto QR code generation (Req 3.1)
   * - Generates unique slug for invitation URL
   * - Generates AES-256 encrypted QR payload (Req 3.6)
   * - QR payload is unique across the platform (Req 3.7)
   */
  async addGuest(
    eventId: string,
    tenantId: string,
    input: CreateGuestInput
  ): Promise<GuestWithQR | GuestServiceError> {
    // Verify event exists and belongs to tenant
    const event = await this.repository.findEventById(eventId, tenantId);
    if (!event) {
      return {
        code: ErrorCode.NOT_FOUND,
        message: 'Event tidak ditemukan',
      };
    }

    // Generate unique slug for the guest
    const slug = await this.generateUniqueSlug(eventId, input.name);

    // Create guest record
    const guestId = randomUUID();
    const invitationUrl = `/${event.slug}?to=${slug}`;

    const guest = await this.repository.createGuest({
      id: guestId,
      event_id: eventId,
      tenant_id: tenantId,
      name: input.name,
      slug,
      phone: input.phone || null,
      email: input.email || null,
      group: input.group,
      type: input.type ?? GuestType.INVITED,
      plus_one_count: input.plus_one_count ?? 0,
      invitation_url: invitationUrl,
      delivery_status: DeliveryStatus.NOT_SENT,
    });

    // Generate QR code with encrypted payload (Req 3.6, 3.7)
    const qrCode = await this.generateQRCode(guestId, eventId);

    return {
      ...guest,
      qr_code: qrCode,
    };
  }

  // --- Read Guest ---

  /**
   * Get a single guest by ID (Req 3.5)
   */
  async getGuest(
    guestId: string,
    tenantId: string
  ): Promise<GuestWithQR | GuestServiceError> {
    const guest = await this.repository.findGuestById(guestId, tenantId);
    if (!guest) {
      return {
        code: ErrorCode.GUEST_NOT_FOUND,
        message: 'Tamu tidak ditemukan',
      };
    }

    const qrCode = await this.repository.findQRCodeByGuestId(guestId);

    return {
      ...guest,
      qr_code: qrCode,
    };
  }

  // --- Update Guest ---

  /**
   * Update guest data (Req 3.5)
   */
  async updateGuest(
    guestId: string,
    tenantId: string,
    input: UpdateGuestInput
  ): Promise<GuestRecord | GuestServiceError> {
    // Check guest exists
    const existing = await this.repository.findGuestById(guestId, tenantId);
    if (!existing) {
      return {
        code: ErrorCode.GUEST_NOT_FOUND,
        message: 'Tamu tidak ditemukan',
      };
    }

    // Build update data
    const updateData: Partial<{
      name: string;
      slug: string;
      phone: string | null;
      email: string | null;
      group: GuestGroup;
      plus_one_count: number;
      invitation_url: string | null;
    }> = {};

    if (input.name !== undefined) {
      updateData.name = input.name;
      // Regenerate slug if name changes
      const newSlug = await this.generateUniqueSlug(
        existing.event_id,
        input.name,
        existing.slug
      );
      updateData.slug = newSlug;

      // Update invitation URL with new slug
      const event = await this.repository.findEventById(
        existing.event_id,
        tenantId
      );
      if (event) {
        updateData.invitation_url = `/${event.slug}?to=${newSlug}`;
      }
    }

    if (input.phone !== undefined) {
      updateData.phone = input.phone || null;
    }

    if (input.email !== undefined) {
      updateData.email = input.email || null;
    }

    if (input.group !== undefined) {
      updateData.group = input.group;
    }

    if (input.plus_one_count !== undefined) {
      updateData.plus_one_count = input.plus_one_count;
    }

    const updated = await this.repository.updateGuest(
      guestId,
      tenantId,
      updateData
    );

    if (!updated) {
      return {
        code: ErrorCode.GUEST_NOT_FOUND,
        message: 'Tamu tidak ditemukan',
      };
    }

    return updated;
  }

  // --- Delete Guest ---

  /**
   * Delete guest and deactivate their QR code (Req 3.8)
   */
  async deleteGuest(
    guestId: string,
    tenantId: string
  ): Promise<{ success: boolean } | GuestServiceError> {
    // Check guest exists
    const existing = await this.repository.findGuestById(guestId, tenantId);
    if (!existing) {
      return {
        code: ErrorCode.GUEST_NOT_FOUND,
        message: 'Tamu tidak ditemukan',
      };
    }

    // Deactivate QR code first (Req 3.8)
    await this.repository.deactivateQRCode(guestId);

    // Delete guest record
    const deleted = await this.repository.deleteGuest(guestId, tenantId);

    return { success: deleted };
  }

  // --- List Guests ---

  /**
   * List guests with pagination and filtering (Req 3.9, 3.10)
   * - Max 50 per page
   * - Filter by group and status
   */
  async listGuests(
    eventId: string,
    tenantId: string,
    pagination: PaginationInput,
    filters?: GuestFilterOptions
  ): Promise<PaginatedGuestList | GuestServiceError> {
    // Verify event exists and belongs to tenant
    const event = await this.repository.findEventById(eventId, tenantId);
    if (!event) {
      return {
        code: ErrorCode.NOT_FOUND,
        message: 'Event tidak ditemukan',
      };
    }

    // Enforce max 50 per page (Req 3.9)
    const sanitizedPagination: PaginationInput = {
      page: pagination.page ?? 1,
      per_page: Math.min(pagination.per_page ?? GUESTS_PER_PAGE, GUESTS_PER_PAGE),
    };

    return this.repository.findGuestsByEvent(
      eventId,
      tenantId,
      sanitizedPagination,
      filters
    );
  }

  // --- Search Guests ---

  /**
   * Search guests by name within an event (Req 8.1 — guest-management variant)
   * - Minimum 3 characters
   * - Maximum 10 results
   */
  async searchGuests(
    eventId: string,
    tenantId: string,
    query: string
  ): Promise<GuestRecord[] | GuestServiceError> {
    if (query.length < MIN_SEARCH_CHARS) {
      return {
        code: ErrorCode.VALIDATION_FAILED,
        message: `Kata kunci pencarian minimal ${MIN_SEARCH_CHARS} karakter`,
      };
    }

    const event = await this.repository.findEventById(eventId, tenantId);
    if (!event) {
      return {
        code: ErrorCode.NOT_FOUND,
        message: 'Event tidak ditemukan',
      };
    }

    return this.repository.searchGuestsByName(query, eventId, tenantId, MAX_SEARCH_RESULTS);
  }

  // --- QR Code Generation ---

  /**
   * Generate encrypted QR code payload (Req 3.6, 3.7)
   * Payload contains guest_id + event_id encrypted with AES-256
   */
  async generateQRCode(
    guestId: string,
    eventId: string
  ): Promise<QRCodeRecord> {
    const payload = await this.createEncryptedPayload(guestId, eventId);

    const qrCode = await this.repository.createQRCode({
      id: randomUUID(),
      guest_id: guestId,
      qr_payload: payload,
      is_active: true,
    });

    return qrCode;
  }

  /**
   * Create AES-256 encrypted payload (Req 3.6)
   * Format: iv:encrypted_data (hex encoded)
   * Plaintext: guest_id|event_id|timestamp|random_nonce
   */
  async createEncryptedPayload(
    guestId: string,
    eventId: string
  ): Promise<string> {
    // Include timestamp and random nonce to ensure uniqueness (Req 3.7)
    const nonce = randomBytes(16).toString('hex');
    const plaintext = `${guestId}|${eventId}|${Date.now()}|${nonce}`;

    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(AES_ALGORITHM, this.encryptionKey, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Format: iv:encrypted (both hex encoded)
    const payload = `${iv.toString('hex')}:${encrypted}`;

    // Verify uniqueness across platform (Req 3.7)
    const exists = await this.repository.checkQRPayloadExists(payload);
    if (exists) {
      // Extremely unlikely but handle by regenerating
      return this.createEncryptedPayload(guestId, eventId);
    }

    return payload;
  }

  // --- Slug Generation ---

  /**
   * Generate a unique slug for the guest within the event
   * Format: kebab-case name with optional numeric suffix
   */
  async generateUniqueSlug(
    eventId: string,
    name: string,
    currentSlug?: string
  ): Promise<string> {
    const baseSlug = this.nameToSlug(name);

    // If the slug hasn't changed, keep it
    if (currentSlug && currentSlug === baseSlug) {
      return currentSlug;
    }

    // Check if base slug is available
    const exists = await this.repository.checkSlugExists(eventId, baseSlug);
    if (!exists) {
      return baseSlug;
    }

    // If it's the same as current slug, it's fine (updating same guest)
    if (currentSlug === baseSlug) {
      return baseSlug;
    }

    // Add numeric suffix until unique
    let suffix = 2;
    let candidateSlug = `${baseSlug}-${suffix}`;
    while (await this.repository.checkSlugExists(eventId, candidateSlug)) {
      suffix++;
      candidateSlug = `${baseSlug}-${suffix}`;
    }

    return candidateSlug;
  }

  /**
   * Convert a name to a URL-friendly slug
   */
  nameToSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Collapse multiple hyphens
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  }
}

// --- Type guard ---

/**
 * Type guard to check if a result is a GuestServiceError
 */
export function isGuestError(
  result:
    | GuestWithQR
    | GuestRecord
    | PaginatedGuestList
    | { success: boolean }
    | GuestServiceError
): result is GuestServiceError {
  return 'code' in result && 'message' in result && !('id' in result) && !('data' in result) && !('success' in result);
}

// --- Exported constants for testing ---

export const GUEST_CONSTANTS = {
  GUESTS_PER_PAGE,
  AES_ALGORITHM,
  IV_LENGTH,
  MIN_SEARCH_CHARS,
  MAX_SEARCH_RESULTS,
} as const;
