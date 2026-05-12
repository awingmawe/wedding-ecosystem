import { randomUUID } from 'crypto';
import { ErrorCode, EventStatus, SectionType } from '@wedding/shared';
import type { CreateEventInput, ThemeConfig, DashboardTheme, InvitationTheme } from '@wedding/shared';

// --- Constants ---

/** All 14 section types in default sort order */
export const DEFAULT_SECTION_ORDER: SectionType[] = [
  SectionType.COVER,
  SectionType.BRIDE_GROOM,
  SectionType.STORY,
  SectionType.VERSE,
  SectionType.COUNTDOWN,
  SectionType.AKAD_RESEPSI,
  SectionType.RSVP,
  SectionType.ATTIRE,
  SectionType.GALLERY,
  SectionType.VIDEO,
  SectionType.GIFT,
  SectionType.MESSAGES,
  SectionType.CLOSING,
  SectionType.MUSIC,
];

/** Default dashboard theme (Req 11.7) */
export const DEFAULT_DASHBOARD_THEME: DashboardTheme = {
  primary_color: '#A8BBA3',
  secondary_color: '#F7F4EA',
  accent_color: '#B87C4C',
  surface_color: '#EBD9D1',
  text_color: '#2D3436',
  font_family: 'Poppins',
  font_heading: 'Playfair Display',
};

/** Default invitation theme (Req 11.7) */
export const DEFAULT_INVITATION_THEME: InvitationTheme = {
  primary_color: '#5F7161',
  secondary_color: '#A7C4A0',
  accent_color: '#C9A96E',
  background_color: '#FDFCF9',
  text_color: '#2D3436',
  font_family: 'Poppins',
  font_heading: 'Playfair Display',
  template_id: 'classic-sage-gold',
};

/** Default theme config combining dashboard and invitation */
export const DEFAULT_THEME_CONFIG: ThemeConfig = {
  dashboard: DEFAULT_DASHBOARD_THEME,
  invitation: DEFAULT_INVITATION_THEME,
};

// --- Types ---

export interface EventRecord {
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

export interface EventConfigRecord {
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

export interface SectionRecord {
  id: string;
  event_id: string;
  section_type: SectionType;
  sort_order: number;
  is_active: boolean;
  content: Record<string, unknown>;
  updated_at: Date;
}

export interface CreatedEventResult {
  event: EventRecord;
  config: EventConfigRecord | null;
  sections: SectionRecord[];
  theme_applied: boolean;
  sections_initialized: boolean;
}

export interface EventServiceError {
  code: ErrorCode;
  message: string;
}

// --- Repository interface (dependency injection) ---

export interface EventRepository {
  createEvent(data: {
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
  }): Promise<EventRecord>;

  createEventConfig(data: {
    id: string;
    event_id: string;
    theme_config: ThemeConfig;
    active_sections: SectionType[];
    invitation_music_url: string | null;
    calendar_link: string | null;
    max_scanner_devices: number;
    max_guests: number;
  }): Promise<EventConfigRecord>;

  createSection(data: {
    id: string;
    event_id: string;
    section_type: SectionType;
    sort_order: number;
    is_active: boolean;
    content: Record<string, unknown>;
  }): Promise<SectionRecord>;

  findEventBySlug(slug: string): Promise<EventRecord | null>;

  findEventById(eventId: string, tenantId: string): Promise<EventRecord | null>;

  countEventsByTenant(tenantId: string): Promise<number>;
}

// --- Event Service ---

export class EventService {
  private readonly repository: EventRepository;

  constructor(config: { repository: EventRepository }) {
    this.repository = config.repository;
  }

  /**
   * Create a new event with automatic default theme and section initialization.
   *
   * Implements:
   * - Req 11.7: Apply default theme on event creation. If theme application fails,
   *   still create the event without styling.
   * - Req 5.10: Initialize 14 sections with unique, sequential sort_order starting from 1.
   *
   * The creation flow:
   * 1. Validate input and check slug uniqueness
   * 2. Create the event record (must always succeed)
   * 3. Attempt to apply default theme (graceful failure)
   * 4. Initialize 14 default sections with sequential sort_order (graceful failure)
   */
  async createEvent(
    tenantId: string,
    input: CreateEventInput
  ): Promise<CreatedEventResult | EventServiceError> {
    // Check slug uniqueness
    const existingEvent = await this.repository.findEventBySlug(input.slug);
    if (existingEvent) {
      return {
        code: ErrorCode.ALREADY_EXISTS,
        message: 'Slug event sudah digunakan',
      };
    }

    // Check tenant event limit (max 50 per tenant per Req 1.4)
    const eventCount = await this.repository.countEventsByTenant(tenantId);
    if (eventCount >= 50) {
      return {
        code: ErrorCode.CONFLICT,
        message: 'Batas maksimal 50 event per tenant telah tercapai',
      };
    }

    // Step 1: Create the event record
    const eventId = randomUUID();
    const event = await this.repository.createEvent({
      id: eventId,
      tenant_id: tenantId,
      slug: input.slug,
      bride_name: input.bride_name,
      groom_name: input.groom_name,
      event_date: new Date(input.event_date),
      venue_name: input.venue_name,
      venue_address: input.venue_address,
      venue_maps_url: input.venue_maps_url || '',
      akad_start: input.akad_start,
      akad_end: input.akad_end,
      resepsi_start: input.resepsi_start,
      resepsi_end: input.resepsi_end,
      status: input.status ?? EventStatus.DRAFT,
    });

    // Step 2: Apply default theme (Req 11.7 - graceful failure)
    let config: EventConfigRecord | null = null;
    let themeApplied = false;

    try {
      config = await this.applyDefaultTheme(eventId);
      themeApplied = true;
    } catch {
      // Theme application failed - event is created without styling.
      // Client can configure theme manually later (Req 11.7).
      config = null;
      themeApplied = false;
    }

    // Step 3: Initialize 14 sections with default sort_order (Req 5.10)
    let sections: SectionRecord[] = [];
    let sectionsInitialized = false;

    try {
      sections = await this.initializeDefaultSections(eventId);
      sectionsInitialized = true;
    } catch {
      // Section initialization failed - event still usable.
      // Sections can be created manually later.
      sections = [];
      sectionsInitialized = false;
    }

    return {
      event,
      config,
      sections,
      theme_applied: themeApplied,
      sections_initialized: sectionsInitialized,
    };
  }

  /**
   * Apply default theme configuration to an event (Req 11.7).
   * Creates an EventConfig record with the default dashboard and invitation themes.
   */
  async applyDefaultTheme(eventId: string): Promise<EventConfigRecord> {
    return this.repository.createEventConfig({
      id: randomUUID(),
      event_id: eventId,
      theme_config: DEFAULT_THEME_CONFIG,
      active_sections: [...DEFAULT_SECTION_ORDER],
      invitation_music_url: null,
      calendar_link: null,
      max_scanner_devices: 2,
      max_guests: 2000,
    });
  }

  /**
   * Initialize all 14 sections with sequential sort_order (Req 5.10).
   * Sort order is unique and sequential: 1, 2, 3, ..., 14 (no gaps).
   * All sections start as active with empty content.
   */
  async initializeDefaultSections(eventId: string): Promise<SectionRecord[]> {
    const sections: SectionRecord[] = [];

    for (let i = 0; i < DEFAULT_SECTION_ORDER.length; i++) {
      const section = await this.repository.createSection({
        id: randomUUID(),
        event_id: eventId,
        section_type: DEFAULT_SECTION_ORDER[i],
        sort_order: i + 1, // Sequential starting from 1 (Req 5.10)
        is_active: true,
        content: {},
      });
      sections.push(section);
    }

    return sections;
  }
}

// --- Type guard ---

/**
 * Type guard to check if a result is an EventServiceError
 */
export function isEventError(
  result: CreatedEventResult | EventServiceError
): result is EventServiceError {
  return 'code' in result && 'message' in result && !('event' in result);
}
