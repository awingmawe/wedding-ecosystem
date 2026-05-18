import { randomUUID } from 'crypto';
import { ErrorCode } from '@wedding/shared';
import { SectionType } from '@wedding/shared';
import type { UpdateSectionInput } from '@wedding/shared';

// --- Types ---

export interface SectionRecord {
  id: string;
  event_id: string;
  section_type: SectionType;
  sort_order: number;
  is_active: boolean;
  content: Record<string, unknown>;
  updated_at: Date;
}

export interface CMSServiceError {
  code: ErrorCode;
  message: string;
}

// --- Repository interface (dependency injection) ---

export interface CMSRepository {
  createSection(data: {
    id: string;
    event_id: string;
    section_type: SectionType;
    sort_order: number;
    is_active: boolean;
    content: Record<string, unknown>;
  }): Promise<SectionRecord>;

  findSectionById(sectionId: string, eventId: string): Promise<SectionRecord | null>;

  findSectionByType(eventId: string, sectionType: SectionType): Promise<SectionRecord | null>;

  findSectionsByEvent(eventId: string): Promise<SectionRecord[]>;

  findActiveSectionsByEvent(eventId: string): Promise<SectionRecord[]>;

  updateSection(
    sectionId: string,
    eventId: string,
    data: Partial<{
      sort_order: number;
      is_active: boolean;
      content: Record<string, unknown>;
      updated_at: Date;
    }>
  ): Promise<SectionRecord | null>;

  updateManySortOrders(updates: { id: string; sort_order: number }[]): Promise<void>;

  deleteSection(sectionId: string, eventId: string): Promise<boolean>;

  findEventById(eventId: string, tenantId: string): Promise<{ id: string } | null>;

  getMaxSortOrder(eventId: string): Promise<number>;
}

// --- All valid section types ---

export const ALL_SECTION_TYPES: SectionType[] = [
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

// --- CMS Service ---

export class CMSService {
  private readonly repository: CMSRepository;

  constructor(config: { repository: CMSRepository }) {
    this.repository = config.repository;
  }

  // --- Create Section ---

  /**
   * Create a new invitation section for an event (Req 5.1, 5.2)
   * - Validates section type is one of the 14 supported types
   * - Assigns sort_order at the end (max + 1)
   * - Ensures sort_order is sequential (Req 5.10)
   */
  async createSection(
    eventId: string,
    tenantId: string,
    input: { section_type: SectionType; content?: Record<string, unknown>; is_active?: boolean }
  ): Promise<SectionRecord | CMSServiceError> {
    // Verify event exists and belongs to tenant
    const event = await this.repository.findEventById(eventId, tenantId);
    if (!event) {
      return {
        code: ErrorCode.NOT_FOUND,
        message: 'Event tidak ditemukan',
      };
    }

    // Validate section type
    if (!ALL_SECTION_TYPES.includes(input.section_type)) {
      return {
        code: ErrorCode.INVALID_SECTION_TYPE,
        message: 'Tipe section tidak valid',
      };
    }

    // Check if section type already exists for this event
    const existing = await this.repository.findSectionByType(eventId, input.section_type);
    if (existing) {
      return {
        code: ErrorCode.ALREADY_EXISTS,
        message: `Section ${input.section_type} sudah ada untuk event ini`,
      };
    }

    // Get next sort_order (append at end)
    const maxOrder = await this.repository.getMaxSortOrder(eventId);
    const sortOrder = maxOrder + 1;

    const section = await this.repository.createSection({
      id: randomUUID(),
      event_id: eventId,
      section_type: input.section_type,
      sort_order: sortOrder,
      is_active: input.is_active ?? true,
      content: input.content ?? {},
    });

    return section;
  }

  // --- Get Section ---

  /**
   * Get a single section by ID
   */
  async getSection(
    sectionId: string,
    eventId: string,
    tenantId: string
  ): Promise<SectionRecord | CMSServiceError> {
    // Verify event exists and belongs to tenant
    const event = await this.repository.findEventById(eventId, tenantId);
    if (!event) {
      return {
        code: ErrorCode.NOT_FOUND,
        message: 'Event tidak ditemukan',
      };
    }

    const section = await this.repository.findSectionById(sectionId, eventId);
    if (!section) {
      return {
        code: ErrorCode.SECTION_NOT_FOUND,
        message: 'Section tidak ditemukan',
      };
    }

    return section;
  }

  // --- List Sections ---

  /**
   * List all sections for an event, ordered by sort_order
   */
  async listSections(
    eventId: string,
    tenantId: string
  ): Promise<SectionRecord[] | CMSServiceError> {
    // Verify event exists and belongs to tenant
    const event = await this.repository.findEventById(eventId, tenantId);
    if (!event) {
      return {
        code: ErrorCode.NOT_FOUND,
        message: 'Event tidak ditemukan',
      };
    }

    const sections = await this.repository.findSectionsByEvent(eventId);
    return sections;
  }

  // --- List Active Sections ---

  /**
   * List only active sections for an event, ordered by sort_order (Req 5.3)
   * Used by Invitation App to render only active sections
   */
  async listActiveSections(
    eventId: string,
    tenantId: string
  ): Promise<SectionRecord[] | CMSServiceError> {
    // Verify event exists and belongs to tenant
    const event = await this.repository.findEventById(eventId, tenantId);
    if (!event) {
      return {
        code: ErrorCode.NOT_FOUND,
        message: 'Event tidak ditemukan',
      };
    }

    const sections = await this.repository.findActiveSectionsByEvent(eventId);
    return sections;
  }

  // --- Update Section Content ---

  /**
   * Update section content (Req 5.1)
   * Stores section-specific content as JSON
   */
  async updateSectionContent(
    sectionId: string,
    eventId: string,
    tenantId: string,
    content: Record<string, unknown>
  ): Promise<SectionRecord | CMSServiceError> {
    // Verify event exists and belongs to tenant
    const event = await this.repository.findEventById(eventId, tenantId);
    if (!event) {
      return {
        code: ErrorCode.NOT_FOUND,
        message: 'Event tidak ditemukan',
      };
    }

    // Check section exists
    const existing = await this.repository.findSectionById(sectionId, eventId);
    if (!existing) {
      return {
        code: ErrorCode.SECTION_NOT_FOUND,
        message: 'Section tidak ditemukan',
      };
    }

    const updated = await this.repository.updateSection(sectionId, eventId, {
      content,
      updated_at: new Date(),
    });

    if (!updated) {
      return {
        code: ErrorCode.SECTION_NOT_FOUND,
        message: 'Section tidak ditemukan',
      };
    }

    return updated;
  }

  // --- Activate/Deactivate Section ---

  /**
   * Activate or deactivate a section (Req 5.3)
   * After toggling, resequences sort_order for all sections (Req 5.10, 5.11)
   */
  async toggleSectionActive(
    sectionId: string,
    eventId: string,
    tenantId: string,
    isActive: boolean
  ): Promise<SectionRecord | CMSServiceError> {
    // Verify event exists and belongs to tenant
    const event = await this.repository.findEventById(eventId, tenantId);
    if (!event) {
      return {
        code: ErrorCode.NOT_FOUND,
        message: 'Event tidak ditemukan',
      };
    }

    // Check section exists
    const existing = await this.repository.findSectionById(sectionId, eventId);
    if (!existing) {
      return {
        code: ErrorCode.SECTION_NOT_FOUND,
        message: 'Section tidak ditemukan',
      };
    }

    // Update the section's active status
    const updated = await this.repository.updateSection(sectionId, eventId, {
      is_active: isActive,
      updated_at: new Date(),
    });

    if (!updated) {
      return {
        code: ErrorCode.SECTION_NOT_FOUND,
        message: 'Section tidak ditemukan',
      };
    }

    // Resequence all sections to maintain sequential order (Req 5.10, 5.11)
    await this.resequenceSections(eventId);

    // Return the updated section with its new sort_order
    const refreshed = await this.repository.findSectionById(sectionId, eventId);
    return refreshed ?? updated;
  }

  // --- Update Sort Order ---

  /**
   * Move a section to a new position (Req 5.9, 5.11)
   * Auto-resequences all sections to maintain sequential order without gaps (Req 5.10)
   */
  async updateSortOrder(
    sectionId: string,
    eventId: string,
    tenantId: string,
    newPosition: number
  ): Promise<SectionRecord | CMSServiceError> {
    // Verify event exists and belongs to tenant
    const event = await this.repository.findEventById(eventId, tenantId);
    if (!event) {
      return {
        code: ErrorCode.NOT_FOUND,
        message: 'Event tidak ditemukan',
      };
    }

    // Check section exists
    const existing = await this.repository.findSectionById(sectionId, eventId);
    if (!existing) {
      return {
        code: ErrorCode.SECTION_NOT_FOUND,
        message: 'Section tidak ditemukan',
      };
    }

    // Get all sections ordered by current sort_order
    const allSections = await this.repository.findSectionsByEvent(eventId);

    // Validate new position
    if (newPosition < 1 || newPosition > allSections.length) {
      return {
        code: ErrorCode.SORT_ORDER_CONFLICT,
        message: `Urutan harus antara 1 dan ${allSections.length}`,
      };
    }

    // Remove the section from its current position and insert at new position
    const reordered = allSections.filter((s) => s.id !== sectionId);
    reordered.splice(newPosition - 1, 0, existing);

    // Assign sequential sort_order starting from 1 (Req 5.10)
    const updates = reordered.map((section, index) => ({
      id: section.id,
      sort_order: index + 1,
    }));

    await this.repository.updateManySortOrders(updates);

    // Return the updated section
    const refreshed = await this.repository.findSectionById(sectionId, eventId);
    if (!refreshed) {
      return {
        code: ErrorCode.SECTION_NOT_FOUND,
        message: 'Section tidak ditemukan',
      };
    }

    return refreshed;
  }

  // --- Delete Section ---

  /**
   * Delete a section and resequence remaining sections (Req 5.10)
   */
  async deleteSection(
    sectionId: string,
    eventId: string,
    tenantId: string
  ): Promise<{ success: boolean } | CMSServiceError> {
    // Verify event exists and belongs to tenant
    const event = await this.repository.findEventById(eventId, tenantId);
    if (!event) {
      return {
        code: ErrorCode.NOT_FOUND,
        message: 'Event tidak ditemukan',
      };
    }

    // Check section exists
    const existing = await this.repository.findSectionById(sectionId, eventId);
    if (!existing) {
      return {
        code: ErrorCode.SECTION_NOT_FOUND,
        message: 'Section tidak ditemukan',
      };
    }

    const deleted = await this.repository.deleteSection(sectionId, eventId);
    if (!deleted) {
      return {
        code: ErrorCode.SECTION_NOT_FOUND,
        message: 'Section tidak ditemukan',
      };
    }

    // Resequence remaining sections (Req 5.10)
    await this.resequenceSections(eventId);

    return { success: true };
  }

  // --- Initialize Default Sections ---

  /**
   * Initialize all 14 sections for a new event with default sort_order (Req 5.2)
   * Each section starts as active with empty content
   */
  async initializeDefaultSections(
    eventId: string,
    tenantId: string
  ): Promise<SectionRecord[] | CMSServiceError> {
    // Verify event exists and belongs to tenant
    const event = await this.repository.findEventById(eventId, tenantId);
    if (!event) {
      return {
        code: ErrorCode.NOT_FOUND,
        message: 'Event tidak ditemukan',
      };
    }

    const sections: SectionRecord[] = [];

    for (let i = 0; i < ALL_SECTION_TYPES.length; i++) {
      const section = await this.repository.createSection({
        id: randomUUID(),
        event_id: eventId,
        section_type: ALL_SECTION_TYPES[i],
        sort_order: i + 1,
        is_active: true,
        content: {},
      });
      sections.push(section);
    }

    return sections;
  }

  // --- Upload Media ---

  /**
   * Placeholder for media upload functionality
   */
  async uploadMedia(
    eventId: string,
    tenantId: string
  ): Promise<{ url: string } | CMSServiceError> {
    // Verify event exists and belongs to tenant
    const event = await this.repository.findEventById(eventId, tenantId);
    if (!event) {
      return {
        code: ErrorCode.NOT_FOUND,
        message: 'Event tidak ditemukan',
      };
    }

    // TODO: Implement real file upload via StorageService (presigned URL flow)
    // For now, return a proper error in production or a placeholder in development
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) {
      return {
        code: ErrorCode.UPLOAD_FAILED,
        message: 'Upload belum diimplementasikan. Gunakan endpoint /cms/media/presigned-url.',
      };
    }

    return { url: `/uploads/mock-${Date.now()}.jpg` };
  }

  // --- Private Helpers ---

  /**
   * Resequence all sections for an event to ensure sequential order without gaps (Req 5.10)
   * Maintains relative order, assigns 1, 2, 3, ... sequentially
   */
  private async resequenceSections(eventId: string): Promise<void> {
    const allSections = await this.repository.findSectionsByEvent(eventId);

    // Sort by current sort_order to maintain relative order
    const sorted = [...allSections].sort((a, b) => a.sort_order - b.sort_order);

    // Assign sequential sort_order starting from 1
    const updates = sorted.map((section, index) => ({
      id: section.id,
      sort_order: index + 1,
    }));

    // Only update if there are changes needed
    const needsUpdate = updates.some(
      (update, index) => sorted[index].sort_order !== update.sort_order
    );

    if (needsUpdate) {
      await this.repository.updateManySortOrders(updates);
    }
  }
}

// --- Type guard ---

/**
 * Type guard to check if a result is a CMSServiceError
 */
export function isCMSError(
  result: SectionRecord | SectionRecord[] | { success: boolean } | { url: string } | CMSServiceError
): result is CMSServiceError {
  return (
    'code' in result &&
    'message' in result &&
    !('id' in result) &&
    !('success' in result) &&
    !Array.isArray(result)
  );
}
