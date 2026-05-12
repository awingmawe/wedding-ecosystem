import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CMSService,
  CMSRepository,
  SectionRecord,
  isCMSError,
  ALL_SECTION_TYPES,
} from './cms.service';
import { SectionType, ErrorCode } from '@wedding/shared';

// --- Test Helpers ---

function createMockRepository(): CMSRepository {
  return {
    createSection: vi.fn(),
    findSectionById: vi.fn(),
    findSectionByType: vi.fn(),
    findSectionsByEvent: vi.fn(),
    findActiveSectionsByEvent: vi.fn(),
    updateSection: vi.fn(),
    updateManySortOrders: vi.fn(),
    deleteSection: vi.fn(),
    findEventById: vi.fn(),
    getMaxSortOrder: vi.fn(),
  };
}

function createMockSection(overrides: Partial<SectionRecord> = {}): SectionRecord {
  return {
    id: 'section-001',
    event_id: 'event-001',
    section_type: SectionType.COVER,
    sort_order: 1,
    is_active: true,
    content: {},
    updated_at: new Date('2024-01-01'),
    ...overrides,
  };
}

// --- Tests ---

describe('CMSService', () => {
  let service: CMSService;
  let repository: CMSRepository;

  beforeEach(() => {
    repository = createMockRepository();
    service = new CMSService({ repository });
  });

  describe('createSection', () => {
    it('should create a section with auto sort_order at end', async () => {
      const mockSection = createMockSection({ sort_order: 3 });

      vi.mocked(repository.findEventById).mockResolvedValue({ id: 'event-001' });
      vi.mocked(repository.findSectionByType).mockResolvedValue(null);
      vi.mocked(repository.getMaxSortOrder).mockResolvedValue(2);
      vi.mocked(repository.createSection).mockResolvedValue(mockSection);

      const result = await service.createSection('event-001', 'tenant-001', {
        section_type: SectionType.COVER,
        content: { title: 'Our Wedding' },
      });

      expect(isCMSError(result)).toBe(false);
      if (!isCMSError(result)) {
        expect(result.section_type).toBe(SectionType.COVER);
      }

      expect(repository.createSection).toHaveBeenCalledWith(
        expect.objectContaining({
          event_id: 'event-001',
          section_type: SectionType.COVER,
          sort_order: 3,
          is_active: true,
          content: { title: 'Our Wedding' },
        })
      );
    });

    it('should return error if event not found', async () => {
      vi.mocked(repository.findEventById).mockResolvedValue(null);

      const result = await service.createSection('nonexistent', 'tenant-001', {
        section_type: SectionType.COVER,
      });

      expect(isCMSError(result)).toBe(true);
      if (isCMSError(result)) {
        expect(result.code).toBe(ErrorCode.NOT_FOUND);
      }
    });

    it('should return error if section type already exists for event', async () => {
      vi.mocked(repository.findEventById).mockResolvedValue({ id: 'event-001' });
      vi.mocked(repository.findSectionByType).mockResolvedValue(createMockSection());

      const result = await service.createSection('event-001', 'tenant-001', {
        section_type: SectionType.COVER,
      });

      expect(isCMSError(result)).toBe(true);
      if (isCMSError(result)) {
        expect(result.code).toBe(ErrorCode.ALREADY_EXISTS);
      }
    });

    it('should default is_active to true and content to empty object', async () => {
      vi.mocked(repository.findEventById).mockResolvedValue({ id: 'event-001' });
      vi.mocked(repository.findSectionByType).mockResolvedValue(null);
      vi.mocked(repository.getMaxSortOrder).mockResolvedValue(0);
      vi.mocked(repository.createSection).mockResolvedValue(createMockSection());

      await service.createSection('event-001', 'tenant-001', {
        section_type: SectionType.GALLERY,
      });

      expect(repository.createSection).toHaveBeenCalledWith(
        expect.objectContaining({
          is_active: true,
          content: {},
          sort_order: 1,
        })
      );
    });

    it('should support all 14 section types (Req 5.2)', () => {
      expect(ALL_SECTION_TYPES).toHaveLength(14);
      expect(ALL_SECTION_TYPES).toContain(SectionType.COVER);
      expect(ALL_SECTION_TYPES).toContain(SectionType.BRIDE_GROOM);
      expect(ALL_SECTION_TYPES).toContain(SectionType.STORY);
      expect(ALL_SECTION_TYPES).toContain(SectionType.VERSE);
      expect(ALL_SECTION_TYPES).toContain(SectionType.COUNTDOWN);
      expect(ALL_SECTION_TYPES).toContain(SectionType.AKAD_RESEPSI);
      expect(ALL_SECTION_TYPES).toContain(SectionType.RSVP);
      expect(ALL_SECTION_TYPES).toContain(SectionType.ATTIRE);
      expect(ALL_SECTION_TYPES).toContain(SectionType.GALLERY);
      expect(ALL_SECTION_TYPES).toContain(SectionType.VIDEO);
      expect(ALL_SECTION_TYPES).toContain(SectionType.GIFT);
      expect(ALL_SECTION_TYPES).toContain(SectionType.MESSAGES);
      expect(ALL_SECTION_TYPES).toContain(SectionType.CLOSING);
      expect(ALL_SECTION_TYPES).toContain(SectionType.MUSIC);
    });
  });

  describe('getSection', () => {
    it('should return section by ID', async () => {
      const mockSection = createMockSection();

      vi.mocked(repository.findEventById).mockResolvedValue({ id: 'event-001' });
      vi.mocked(repository.findSectionById).mockResolvedValue(mockSection);

      const result = await service.getSection('section-001', 'event-001', 'tenant-001');

      expect(isCMSError(result)).toBe(false);
      if (!isCMSError(result)) {
        expect(result.id).toBe('section-001');
        expect(result.section_type).toBe(SectionType.COVER);
      }
    });

    it('should return error if section not found', async () => {
      vi.mocked(repository.findEventById).mockResolvedValue({ id: 'event-001' });
      vi.mocked(repository.findSectionById).mockResolvedValue(null);

      const result = await service.getSection('nonexistent', 'event-001', 'tenant-001');

      expect(isCMSError(result)).toBe(true);
      if (isCMSError(result)) {
        expect(result.code).toBe(ErrorCode.SECTION_NOT_FOUND);
      }
    });

    it('should return error if event not found', async () => {
      vi.mocked(repository.findEventById).mockResolvedValue(null);

      const result = await service.getSection('section-001', 'nonexistent', 'tenant-001');

      expect(isCMSError(result)).toBe(true);
      if (isCMSError(result)) {
        expect(result.code).toBe(ErrorCode.NOT_FOUND);
      }
    });
  });

  describe('listSections', () => {
    it('should return all sections for an event', async () => {
      const mockSections = [
        createMockSection({ id: 'section-001', sort_order: 1, section_type: SectionType.COVER }),
        createMockSection({ id: 'section-002', sort_order: 2, section_type: SectionType.BRIDE_GROOM }),
      ];

      vi.mocked(repository.findEventById).mockResolvedValue({ id: 'event-001' });
      vi.mocked(repository.findSectionsByEvent).mockResolvedValue(mockSections);

      const result = await service.listSections('event-001', 'tenant-001');

      expect(isCMSError(result)).toBe(false);
      if (!isCMSError(result)) {
        expect(result).toHaveLength(2);
      }
    });

    it('should return error if event not found', async () => {
      vi.mocked(repository.findEventById).mockResolvedValue(null);

      const result = await service.listSections('nonexistent', 'tenant-001');

      expect(isCMSError(result)).toBe(true);
      if (isCMSError(result)) {
        expect(result.code).toBe(ErrorCode.NOT_FOUND);
      }
    });
  });

  describe('listActiveSections', () => {
    it('should return only active sections (Req 5.3)', async () => {
      const mockSections = [
        createMockSection({ id: 'section-001', sort_order: 1, is_active: true }),
        createMockSection({ id: 'section-003', sort_order: 2, is_active: true }),
      ];

      vi.mocked(repository.findEventById).mockResolvedValue({ id: 'event-001' });
      vi.mocked(repository.findActiveSectionsByEvent).mockResolvedValue(mockSections);

      const result = await service.listActiveSections('event-001', 'tenant-001');

      expect(isCMSError(result)).toBe(false);
      if (!isCMSError(result)) {
        expect(result).toHaveLength(2);
        expect(result.every((s) => s.is_active)).toBe(true);
      }
    });
  });

  describe('updateSectionContent', () => {
    it('should update section content as JSON (Req 5.1)', async () => {
      const mockSection = createMockSection();
      const updatedSection = createMockSection({
        content: { title: 'Updated Title', subtitle: 'New Subtitle' },
      });

      vi.mocked(repository.findEventById).mockResolvedValue({ id: 'event-001' });
      vi.mocked(repository.findSectionById).mockResolvedValue(mockSection);
      vi.mocked(repository.updateSection).mockResolvedValue(updatedSection);

      const result = await service.updateSectionContent(
        'section-001',
        'event-001',
        'tenant-001',
        { title: 'Updated Title', subtitle: 'New Subtitle' }
      );

      expect(isCMSError(result)).toBe(false);
      if (!isCMSError(result)) {
        expect(result.content).toEqual({ title: 'Updated Title', subtitle: 'New Subtitle' });
      }

      expect(repository.updateSection).toHaveBeenCalledWith(
        'section-001',
        'event-001',
        expect.objectContaining({
          content: { title: 'Updated Title', subtitle: 'New Subtitle' },
        })
      );
    });

    it('should return error if section not found', async () => {
      vi.mocked(repository.findEventById).mockResolvedValue({ id: 'event-001' });
      vi.mocked(repository.findSectionById).mockResolvedValue(null);

      const result = await service.updateSectionContent(
        'nonexistent',
        'event-001',
        'tenant-001',
        { title: 'Test' }
      );

      expect(isCMSError(result)).toBe(true);
      if (isCMSError(result)) {
        expect(result.code).toBe(ErrorCode.SECTION_NOT_FOUND);
      }
    });

    it('should store section-specific content per section type', async () => {
      const coverContent = { title: 'Wedding', subtitle: 'Andi & Sari', background_image: 'url', opening_text: 'Bismillah' };
      const mockSection = createMockSection({ section_type: SectionType.COVER });
      const updatedSection = createMockSection({ content: coverContent });

      vi.mocked(repository.findEventById).mockResolvedValue({ id: 'event-001' });
      vi.mocked(repository.findSectionById).mockResolvedValue(mockSection);
      vi.mocked(repository.updateSection).mockResolvedValue(updatedSection);

      const result = await service.updateSectionContent(
        'section-001',
        'event-001',
        'tenant-001',
        coverContent
      );

      expect(isCMSError(result)).toBe(false);
      if (!isCMSError(result)) {
        expect(result.content).toEqual(coverContent);
      }
    });
  });

  describe('toggleSectionActive', () => {
    it('should activate a section (Req 5.3)', async () => {
      const mockSection = createMockSection({ is_active: false });
      const updatedSection = createMockSection({ is_active: true });

      vi.mocked(repository.findEventById).mockResolvedValue({ id: 'event-001' });
      vi.mocked(repository.findSectionById).mockResolvedValue(mockSection)
        .mockResolvedValueOnce(mockSection) // first call for existence check
        .mockResolvedValueOnce(updatedSection); // second call after resequence
      vi.mocked(repository.updateSection).mockResolvedValue(updatedSection);
      vi.mocked(repository.findSectionsByEvent).mockResolvedValue([updatedSection]);
      vi.mocked(repository.updateManySortOrders).mockResolvedValue(undefined);

      const result = await service.toggleSectionActive(
        'section-001',
        'event-001',
        'tenant-001',
        true
      );

      expect(isCMSError(result)).toBe(false);
      if (!isCMSError(result)) {
        expect(result.is_active).toBe(true);
      }

      expect(repository.updateSection).toHaveBeenCalledWith(
        'section-001',
        'event-001',
        expect.objectContaining({ is_active: true })
      );
    });

    it('should deactivate a section (Req 5.3)', async () => {
      const mockSection = createMockSection({ is_active: true });
      const updatedSection = createMockSection({ is_active: false });

      vi.mocked(repository.findEventById).mockResolvedValue({ id: 'event-001' });
      vi.mocked(repository.findSectionById)
        .mockResolvedValueOnce(mockSection)
        .mockResolvedValueOnce(updatedSection);
      vi.mocked(repository.updateSection).mockResolvedValue(updatedSection);
      vi.mocked(repository.findSectionsByEvent).mockResolvedValue([updatedSection]);
      vi.mocked(repository.updateManySortOrders).mockResolvedValue(undefined);

      const result = await service.toggleSectionActive(
        'section-001',
        'event-001',
        'tenant-001',
        false
      );

      expect(isCMSError(result)).toBe(false);
      if (!isCMSError(result)) {
        expect(result.is_active).toBe(false);
      }
    });

    it('should resequence sections after toggling (Req 5.10, 5.11)', async () => {
      const sections = [
        createMockSection({ id: 'section-001', sort_order: 1 }),
        createMockSection({ id: 'section-002', sort_order: 3 }), // gap
      ];
      const updatedSection = createMockSection({ id: 'section-001', is_active: false });

      vi.mocked(repository.findEventById).mockResolvedValue({ id: 'event-001' });
      vi.mocked(repository.findSectionById)
        .mockResolvedValueOnce(sections[0])
        .mockResolvedValueOnce(updatedSection);
      vi.mocked(repository.updateSection).mockResolvedValue(updatedSection);
      vi.mocked(repository.findSectionsByEvent).mockResolvedValue(sections);
      vi.mocked(repository.updateManySortOrders).mockResolvedValue(undefined);

      await service.toggleSectionActive('section-001', 'event-001', 'tenant-001', false);

      // Should resequence: section-001 -> 1, section-002 -> 2 (closing gap)
      expect(repository.updateManySortOrders).toHaveBeenCalledWith([
        { id: 'section-001', sort_order: 1 },
        { id: 'section-002', sort_order: 2 },
      ]);
    });

    it('should return error if section not found', async () => {
      vi.mocked(repository.findEventById).mockResolvedValue({ id: 'event-001' });
      vi.mocked(repository.findSectionById).mockResolvedValue(null);

      const result = await service.toggleSectionActive(
        'nonexistent',
        'event-001',
        'tenant-001',
        true
      );

      expect(isCMSError(result)).toBe(true);
      if (isCMSError(result)) {
        expect(result.code).toBe(ErrorCode.SECTION_NOT_FOUND);
      }
    });
  });

  describe('updateSortOrder', () => {
    it('should move section to new position and resequence (Req 5.9, 5.11)', async () => {
      const sections = [
        createMockSection({ id: 'section-001', sort_order: 1, section_type: SectionType.COVER }),
        createMockSection({ id: 'section-002', sort_order: 2, section_type: SectionType.BRIDE_GROOM }),
        createMockSection({ id: 'section-003', sort_order: 3, section_type: SectionType.STORY }),
      ];

      vi.mocked(repository.findEventById).mockResolvedValue({ id: 'event-001' });
      vi.mocked(repository.findSectionById)
        .mockResolvedValueOnce(sections[2]) // existing check
        .mockResolvedValueOnce(createMockSection({ id: 'section-003', sort_order: 1 })); // after resequence
      vi.mocked(repository.findSectionsByEvent).mockResolvedValue(sections);
      vi.mocked(repository.updateManySortOrders).mockResolvedValue(undefined);

      // Move section-003 (position 3) to position 1
      const result = await service.updateSortOrder(
        'section-003',
        'event-001',
        'tenant-001',
        1
      );

      expect(isCMSError(result)).toBe(false);

      // Should resequence: section-003 -> 1, section-001 -> 2, section-002 -> 3
      expect(repository.updateManySortOrders).toHaveBeenCalledWith([
        { id: 'section-003', sort_order: 1 },
        { id: 'section-001', sort_order: 2 },
        { id: 'section-002', sort_order: 3 },
      ]);
    });

    it('should ensure sort_order is sequential without gaps starting from 1 (Req 5.10)', async () => {
      const sections = [
        createMockSection({ id: 'section-001', sort_order: 1 }),
        createMockSection({ id: 'section-002', sort_order: 2 }),
        createMockSection({ id: 'section-003', sort_order: 3 }),
      ];

      vi.mocked(repository.findEventById).mockResolvedValue({ id: 'event-001' });
      vi.mocked(repository.findSectionById)
        .mockResolvedValueOnce(sections[0])
        .mockResolvedValueOnce(createMockSection({ id: 'section-001', sort_order: 3 }));
      vi.mocked(repository.findSectionsByEvent).mockResolvedValue(sections);
      vi.mocked(repository.updateManySortOrders).mockResolvedValue(undefined);

      // Move section-001 to position 3
      await service.updateSortOrder('section-001', 'event-001', 'tenant-001', 3);

      const updateCall = vi.mocked(repository.updateManySortOrders).mock.calls[0][0];
      // Verify sequential order starting from 1
      const sortOrders = updateCall.map((u) => u.sort_order);
      expect(sortOrders).toEqual([1, 2, 3]);
      // No gaps
      for (let i = 0; i < sortOrders.length; i++) {
        expect(sortOrders[i]).toBe(i + 1);
      }
    });

    it('should return error if new position is out of range', async () => {
      const sections = [
        createMockSection({ id: 'section-001', sort_order: 1 }),
        createMockSection({ id: 'section-002', sort_order: 2 }),
      ];

      vi.mocked(repository.findEventById).mockResolvedValue({ id: 'event-001' });
      vi.mocked(repository.findSectionById).mockResolvedValue(sections[0]);
      vi.mocked(repository.findSectionsByEvent).mockResolvedValue(sections);

      const result = await service.updateSortOrder(
        'section-001',
        'event-001',
        'tenant-001',
        5 // out of range
      );

      expect(isCMSError(result)).toBe(true);
      if (isCMSError(result)) {
        expect(result.code).toBe(ErrorCode.SORT_ORDER_CONFLICT);
      }
    });

    it('should return error if new position is less than 1', async () => {
      const sections = [
        createMockSection({ id: 'section-001', sort_order: 1 }),
      ];

      vi.mocked(repository.findEventById).mockResolvedValue({ id: 'event-001' });
      vi.mocked(repository.findSectionById).mockResolvedValue(sections[0]);
      vi.mocked(repository.findSectionsByEvent).mockResolvedValue(sections);

      const result = await service.updateSortOrder(
        'section-001',
        'event-001',
        'tenant-001',
        0
      );

      expect(isCMSError(result)).toBe(true);
      if (isCMSError(result)) {
        expect(result.code).toBe(ErrorCode.SORT_ORDER_CONFLICT);
      }
    });

    it('should return error if section not found', async () => {
      vi.mocked(repository.findEventById).mockResolvedValue({ id: 'event-001' });
      vi.mocked(repository.findSectionById).mockResolvedValue(null);

      const result = await service.updateSortOrder(
        'nonexistent',
        'event-001',
        'tenant-001',
        1
      );

      expect(isCMSError(result)).toBe(true);
      if (isCMSError(result)) {
        expect(result.code).toBe(ErrorCode.SECTION_NOT_FOUND);
      }
    });
  });

  describe('deleteSection', () => {
    it('should delete section and resequence remaining (Req 5.10)', async () => {
      const sections = [
        createMockSection({ id: 'section-001', sort_order: 1 }),
        createMockSection({ id: 'section-002', sort_order: 2 }),
        createMockSection({ id: 'section-003', sort_order: 3 }),
      ];

      vi.mocked(repository.findEventById).mockResolvedValue({ id: 'event-001' });
      vi.mocked(repository.findSectionById).mockResolvedValue(sections[1]); // deleting section-002
      vi.mocked(repository.deleteSection).mockResolvedValue(true);
      // After deletion, only section-001 and section-003 remain
      vi.mocked(repository.findSectionsByEvent).mockResolvedValue([
        sections[0],
        sections[2],
      ]);
      vi.mocked(repository.updateManySortOrders).mockResolvedValue(undefined);

      const result = await service.deleteSection('section-002', 'event-001', 'tenant-001');

      expect(isCMSError(result)).toBe(false);
      if (!isCMSError(result)) {
        expect(result.success).toBe(true);
      }

      // Should resequence remaining: section-001 -> 1, section-003 -> 2
      expect(repository.updateManySortOrders).toHaveBeenCalledWith([
        { id: 'section-001', sort_order: 1 },
        { id: 'section-003', sort_order: 2 },
      ]);
    });

    it('should return error if section not found', async () => {
      vi.mocked(repository.findEventById).mockResolvedValue({ id: 'event-001' });
      vi.mocked(repository.findSectionById).mockResolvedValue(null);

      const result = await service.deleteSection('nonexistent', 'event-001', 'tenant-001');

      expect(isCMSError(result)).toBe(true);
      if (isCMSError(result)) {
        expect(result.code).toBe(ErrorCode.SECTION_NOT_FOUND);
      }
    });

    it('should return error if event not found', async () => {
      vi.mocked(repository.findEventById).mockResolvedValue(null);

      const result = await service.deleteSection('section-001', 'nonexistent', 'tenant-001');

      expect(isCMSError(result)).toBe(true);
      if (isCMSError(result)) {
        expect(result.code).toBe(ErrorCode.NOT_FOUND);
      }
    });
  });

  describe('initializeDefaultSections', () => {
    it('should create all 14 sections with sequential sort_order (Req 5.2, 5.10)', async () => {
      vi.mocked(repository.findEventById).mockResolvedValue({ id: 'event-001' });
      vi.mocked(repository.createSection).mockImplementation(async (data) => ({
        ...data,
        updated_at: new Date(),
      }));

      const result = await service.initializeDefaultSections('event-001', 'tenant-001');

      expect(isCMSError(result)).toBe(false);
      if (!isCMSError(result)) {
        expect(result).toHaveLength(14);

        // Verify sequential sort_order starting from 1
        for (let i = 0; i < result.length; i++) {
          expect(result[i].sort_order).toBe(i + 1);
        }

        // Verify all 14 section types are created
        const types = result.map((s) => s.section_type);
        expect(types).toEqual(ALL_SECTION_TYPES);
      }
    });

    it('should create sections as active with empty content', async () => {
      vi.mocked(repository.findEventById).mockResolvedValue({ id: 'event-001' });
      vi.mocked(repository.createSection).mockImplementation(async (data) => ({
        ...data,
        updated_at: new Date(),
      }));

      const result = await service.initializeDefaultSections('event-001', 'tenant-001');

      if (!isCMSError(result)) {
        for (const section of result) {
          expect(section.is_active).toBe(true);
          expect(section.content).toEqual({});
        }
      }
    });

    it('should return error if event not found', async () => {
      vi.mocked(repository.findEventById).mockResolvedValue(null);

      const result = await service.initializeDefaultSections('nonexistent', 'tenant-001');

      expect(isCMSError(result)).toBe(true);
      if (isCMSError(result)) {
        expect(result.code).toBe(ErrorCode.NOT_FOUND);
      }
    });
  });

  describe('isCMSError type guard', () => {
    it('should return true for error objects', () => {
      expect(
        isCMSError({ code: ErrorCode.SECTION_NOT_FOUND, message: 'Not found' })
      ).toBe(true);
    });

    it('should return false for section records', () => {
      expect(isCMSError(createMockSection())).toBe(false);
    });

    it('should return false for section arrays', () => {
      expect(isCMSError([createMockSection()])).toBe(false);
    });

    it('should return false for success results', () => {
      expect(isCMSError({ success: true })).toBe(false);
    });
  });
});
