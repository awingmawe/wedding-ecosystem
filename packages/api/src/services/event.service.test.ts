import { describe, it, expect, vi } from 'vitest';
import {
  EventService,
  EventRepository,
  EventRecord,
  EventConfigRecord,
  SectionRecord,
  DEFAULT_THEME_CONFIG,
  DEFAULT_SECTION_ORDER,
  DEFAULT_DASHBOARD_THEME,
  DEFAULT_INVITATION_THEME,
  isEventError,
} from './event.service';
import { ErrorCode, EventStatus, SectionType } from '@wedding/shared';

// --- Test Helpers ---

function createMockRepository(overrides: Partial<EventRepository> = {}): EventRepository {
  return {
    createEvent: vi.fn(async (data) => ({
      ...data,
      event_date: new Date(data.event_date),
      created_at: new Date(),
    })) as any,
    createEventConfig: vi.fn(async (data) => ({
      ...data,
      updated_at: new Date(),
    })) as any,
    createSection: vi.fn(async (data) => ({
      ...data,
      updated_at: new Date(),
    })) as any,
    findEventBySlug: vi.fn(async () => null),
    findEventById: vi.fn(async () => null),
    countEventsByTenant: vi.fn(async () => 0),
    ...overrides,
  };
}

const VALID_EVENT_INPUT = {
  slug: 'andi-sari-wedding',
  bride_name: 'Sari',
  groom_name: 'Andi',
  event_date: '2026-06-15',
  venue_name: 'Hotel Grand Ballroom',
  venue_address: 'Jl. Sudirman No. 1, Jakarta',
  venue_maps_url: 'https://maps.google.com/test',
  akad_start: '08:00',
  akad_end: '10:00',
  resepsi_start: '11:00',
  resepsi_end: '14:00',
  status: EventStatus.DRAFT as const,
};

const TENANT_ID = 'tenant-123';

// --- Tests ---

describe('EventService', () => {
  describe('createEvent', () => {
    it('should create event with default theme and 14 sections', async () => {
      const repo = createMockRepository();
      const service = new EventService({ repository: repo });

      const result = await service.createEvent(TENANT_ID, VALID_EVENT_INPUT);

      expect(isEventError(result)).toBe(false);
      if (isEventError(result)) return;

      // Event created
      expect(result.event.slug).toBe('andi-sari-wedding');
      expect(result.event.bride_name).toBe('Sari');
      expect(result.event.groom_name).toBe('Andi');
      expect(result.event.tenant_id).toBe(TENANT_ID);
      expect(result.event.status).toBe(EventStatus.DRAFT);

      // Theme applied
      expect(result.theme_applied).toBe(true);
      expect(result.config).not.toBeNull();
      expect(result.config!.theme_config).toEqual(DEFAULT_THEME_CONFIG);

      // Sections initialized
      expect(result.sections_initialized).toBe(true);
      expect(result.sections).toHaveLength(14);
    });

    it('should initialize 14 sections with sequential sort_order starting from 1', async () => {
      const repo = createMockRepository();
      const service = new EventService({ repository: repo });

      const result = await service.createEvent(TENANT_ID, VALID_EVENT_INPUT);

      expect(isEventError(result)).toBe(false);
      if (isEventError(result)) return;

      // Verify sort_order is sequential: 1, 2, 3, ..., 14
      for (let i = 0; i < result.sections.length; i++) {
        expect(result.sections[i].sort_order).toBe(i + 1);
      }

      // Verify all 14 section types are present
      const sectionTypes = result.sections.map((s) => s.section_type);
      expect(sectionTypes).toEqual(DEFAULT_SECTION_ORDER);
    });

    it('should have no gaps in sort_order', async () => {
      const repo = createMockRepository();
      const service = new EventService({ repository: repo });

      const result = await service.createEvent(TENANT_ID, VALID_EVENT_INPUT);

      expect(isEventError(result)).toBe(false);
      if (isEventError(result)) return;

      const sortOrders = result.sections.map((s) => s.sort_order);
      // Check sequential without gaps
      for (let i = 0; i < sortOrders.length; i++) {
        expect(sortOrders[i]).toBe(i + 1);
      }
      // First is 1, last is 14
      expect(sortOrders[0]).toBe(1);
      expect(sortOrders[sortOrders.length - 1]).toBe(14);
    });

    it('should apply default dashboard theme with correct colors', async () => {
      const repo = createMockRepository();
      const service = new EventService({ repository: repo });

      const result = await service.createEvent(TENANT_ID, VALID_EVENT_INPUT);

      expect(isEventError(result)).toBe(false);
      if (isEventError(result)) return;

      const dashboardTheme = result.config!.theme_config.dashboard;
      expect(dashboardTheme.primary_color).toBe('#A8BBA3');
      expect(dashboardTheme.secondary_color).toBe('#F7F4EA');
      expect(dashboardTheme.accent_color).toBe('#B87C4C');
      expect(dashboardTheme.surface_color).toBe('#EBD9D1');
      expect(dashboardTheme.text_color).toBe('#2D3436');
      expect(dashboardTheme.font_family).toBe('Poppins');
      expect(dashboardTheme.font_heading).toBe('Playfair Display');
    });

    it('should apply default invitation theme with correct colors', async () => {
      const repo = createMockRepository();
      const service = new EventService({ repository: repo });

      const result = await service.createEvent(TENANT_ID, VALID_EVENT_INPUT);

      expect(isEventError(result)).toBe(false);
      if (isEventError(result)) return;

      const invitationTheme = result.config!.theme_config.invitation;
      expect(invitationTheme.primary_color).toBe('#5F7161');
      expect(invitationTheme.secondary_color).toBe('#A7C4A0');
      expect(invitationTheme.accent_color).toBe('#C9A96E');
      expect(invitationTheme.background_color).toBe('#FDFCF9');
      expect(invitationTheme.text_color).toBe('#2D3436');
      expect(invitationTheme.font_family).toBe('Poppins');
      expect(invitationTheme.font_heading).toBe('Playfair Display');
      expect(invitationTheme.template_id).toBe('classic-sage-gold');
    });

    it('should still create event when theme application fails (Req 11.7)', async () => {
      const repo = createMockRepository({
        createEventConfig: vi.fn(async () => {
          throw new Error('Database connection failed');
        }),
      });
      const service = new EventService({ repository: repo });

      const result = await service.createEvent(TENANT_ID, VALID_EVENT_INPUT);

      expect(isEventError(result)).toBe(false);
      if (isEventError(result)) return;

      // Event still created
      expect(result.event.slug).toBe('andi-sari-wedding');
      expect(result.event.tenant_id).toBe(TENANT_ID);

      // Theme not applied
      expect(result.theme_applied).toBe(false);
      expect(result.config).toBeNull();

      // Sections still initialized (independent of theme)
      expect(result.sections_initialized).toBe(true);
      expect(result.sections).toHaveLength(14);
    });

    it('should still create event when section initialization fails', async () => {
      const repo = createMockRepository({
        createSection: vi.fn(async () => {
          throw new Error('Database constraint violation');
        }),
      });
      const service = new EventService({ repository: repo });

      const result = await service.createEvent(TENANT_ID, VALID_EVENT_INPUT);

      expect(isEventError(result)).toBe(false);
      if (isEventError(result)) return;

      // Event still created
      expect(result.event.slug).toBe('andi-sari-wedding');

      // Theme still applied
      expect(result.theme_applied).toBe(true);
      expect(result.config).not.toBeNull();

      // Sections not initialized
      expect(result.sections_initialized).toBe(false);
      expect(result.sections).toHaveLength(0);
    });

    it('should still create event when both theme and sections fail', async () => {
      const repo = createMockRepository({
        createEventConfig: vi.fn(async () => {
          throw new Error('Theme DB error');
        }),
        createSection: vi.fn(async () => {
          throw new Error('Section DB error');
        }),
      });
      const service = new EventService({ repository: repo });

      const result = await service.createEvent(TENANT_ID, VALID_EVENT_INPUT);

      expect(isEventError(result)).toBe(false);
      if (isEventError(result)) return;

      // Event created without styling
      expect(result.event.slug).toBe('andi-sari-wedding');
      expect(result.theme_applied).toBe(false);
      expect(result.config).toBeNull();
      expect(result.sections_initialized).toBe(false);
      expect(result.sections).toHaveLength(0);
    });

    it('should reject duplicate slug', async () => {
      const repo = createMockRepository({
        findEventBySlug: vi.fn(async () => ({
          id: 'existing-event',
          tenant_id: 'other-tenant',
          slug: 'andi-sari-wedding',
        })) as any,
      });
      const service = new EventService({ repository: repo });

      const result = await service.createEvent(TENANT_ID, VALID_EVENT_INPUT);

      expect(isEventError(result)).toBe(true);
      if (!isEventError(result)) return;

      expect(result.code).toBe(ErrorCode.ALREADY_EXISTS);
      expect(result.message).toContain('Slug');
    });

    it('should reject when tenant has reached 50 events limit', async () => {
      const repo = createMockRepository({
        countEventsByTenant: vi.fn(async () => 50),
      });
      const service = new EventService({ repository: repo });

      const result = await service.createEvent(TENANT_ID, VALID_EVENT_INPUT);

      expect(isEventError(result)).toBe(true);
      if (!isEventError(result)) return;

      expect(result.code).toBe(ErrorCode.CONFLICT);
      expect(result.message).toContain('50');
    });

    it('should set all sections as active by default', async () => {
      const repo = createMockRepository();
      const service = new EventService({ repository: repo });

      const result = await service.createEvent(TENANT_ID, VALID_EVENT_INPUT);

      expect(isEventError(result)).toBe(false);
      if (isEventError(result)) return;

      for (const section of result.sections) {
        expect(section.is_active).toBe(true);
      }
    });

    it('should set all sections with empty content by default', async () => {
      const repo = createMockRepository();
      const service = new EventService({ repository: repo });

      const result = await service.createEvent(TENANT_ID, VALID_EVENT_INPUT);

      expect(isEventError(result)).toBe(false);
      if (isEventError(result)) return;

      for (const section of result.sections) {
        expect(section.content).toEqual({});
      }
    });

    it('should set active_sections in config to all 14 section types', async () => {
      const repo = createMockRepository();
      const service = new EventService({ repository: repo });

      const result = await service.createEvent(TENANT_ID, VALID_EVENT_INPUT);

      expect(isEventError(result)).toBe(false);
      if (isEventError(result)) return;

      expect(result.config!.active_sections).toEqual(DEFAULT_SECTION_ORDER);
      expect(result.config!.active_sections).toHaveLength(14);
    });

    it('should set max_scanner_devices to 2 and max_guests to 2000', async () => {
      const repo = createMockRepository();
      const service = new EventService({ repository: repo });

      const result = await service.createEvent(TENANT_ID, VALID_EVENT_INPUT);

      expect(isEventError(result)).toBe(false);
      if (isEventError(result)) return;

      expect(result.config!.max_scanner_devices).toBe(2);
      expect(result.config!.max_guests).toBe(2000);
    });
  });

  describe('DEFAULT_SECTION_ORDER', () => {
    it('should contain exactly 14 section types', () => {
      expect(DEFAULT_SECTION_ORDER).toHaveLength(14);
    });

    it('should contain all SectionType enum values', () => {
      const allSectionTypes = Object.values(SectionType);
      expect(DEFAULT_SECTION_ORDER).toHaveLength(allSectionTypes.length);
      for (const type of allSectionTypes) {
        expect(DEFAULT_SECTION_ORDER).toContain(type);
      }
    });

    it('should have correct order matching design spec', () => {
      expect(DEFAULT_SECTION_ORDER[0]).toBe(SectionType.COVER);
      expect(DEFAULT_SECTION_ORDER[1]).toBe(SectionType.BRIDE_GROOM);
      expect(DEFAULT_SECTION_ORDER[2]).toBe(SectionType.STORY);
      expect(DEFAULT_SECTION_ORDER[3]).toBe(SectionType.VERSE);
      expect(DEFAULT_SECTION_ORDER[4]).toBe(SectionType.COUNTDOWN);
      expect(DEFAULT_SECTION_ORDER[5]).toBe(SectionType.AKAD_RESEPSI);
      expect(DEFAULT_SECTION_ORDER[6]).toBe(SectionType.RSVP);
      expect(DEFAULT_SECTION_ORDER[7]).toBe(SectionType.ATTIRE);
      expect(DEFAULT_SECTION_ORDER[8]).toBe(SectionType.GALLERY);
      expect(DEFAULT_SECTION_ORDER[9]).toBe(SectionType.VIDEO);
      expect(DEFAULT_SECTION_ORDER[10]).toBe(SectionType.GIFT);
      expect(DEFAULT_SECTION_ORDER[11]).toBe(SectionType.MESSAGES);
      expect(DEFAULT_SECTION_ORDER[12]).toBe(SectionType.CLOSING);
      expect(DEFAULT_SECTION_ORDER[13]).toBe(SectionType.MUSIC);
    });
  });

  describe('DEFAULT_THEME_CONFIG', () => {
    it('should have dashboard and invitation themes', () => {
      expect(DEFAULT_THEME_CONFIG.dashboard).toBeDefined();
      expect(DEFAULT_THEME_CONFIG.invitation).toBeDefined();
    });

    it('should match design spec dashboard colors', () => {
      expect(DEFAULT_DASHBOARD_THEME).toEqual({
        primary_color: '#A8BBA3',
        secondary_color: '#F7F4EA',
        accent_color: '#B87C4C',
        surface_color: '#EBD9D1',
        text_color: '#2D3436',
        font_family: 'Poppins',
        font_heading: 'Playfair Display',
      });
    });

    it('should match design spec invitation colors', () => {
      expect(DEFAULT_INVITATION_THEME).toEqual({
        primary_color: '#5F7161',
        secondary_color: '#A7C4A0',
        accent_color: '#C9A96E',
        background_color: '#FDFCF9',
        text_color: '#2D3436',
        font_family: 'Poppins',
        font_heading: 'Playfair Display',
        template_id: 'classic-sage-gold',
      });
    });
  });

  describe('isEventError', () => {
    it('should return true for error objects', () => {
      expect(isEventError({ code: ErrorCode.NOT_FOUND, message: 'Not found' })).toBe(true);
    });

    it('should return false for success results', () => {
      const result = {
        event: { id: '1', slug: 'test' } as any,
        config: null,
        sections: [],
        theme_applied: false,
        sections_initialized: false,
      };
      expect(isEventError(result)).toBe(false);
    });
  });
});
