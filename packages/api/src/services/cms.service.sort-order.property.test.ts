import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { SectionType } from '@wedding/shared';
import {
  CMSService,
  CMSRepository,
  SectionRecord,
  ALL_SECTION_TYPES,
  isCMSError,
} from './cms.service';

// --- Arbitraries ---

/** Generates a UUID-like event ID */
const arbEventId = fc.uuid();

/** Generates a UUID-like tenant ID */
const arbTenantId = fc.uuid();

/** Generates a random subset of section types (1 to 14) for creating sections */
const arbSectionTypeSubset = fc
  .shuffledSubarray(ALL_SECTION_TYPES, { minLength: 1, maxLength: 14 })
  .map((types) => types as SectionType[]);

/** Generates a valid operation type for section manipulation */
type SectionOp =
  | { type: 'add'; sectionType: SectionType }
  | { type: 'remove'; index: number }
  | { type: 'reorder'; index: number; newPosition: number };

/**
 * Generates a sequence of section operations (add, remove, reorder)
 * constrained to valid operations given the current state.
 */
function arbSectionOps(maxOps: number): fc.Arbitrary<SectionOp[]> {
  return fc.array(
    fc.oneof(
      // Add a random section type
      fc.record({
        type: fc.constant('add' as const),
        sectionType: fc.constantFrom(...ALL_SECTION_TYPES),
      }),
      // Remove a section by index (will be clamped to valid range at runtime)
      fc.record({
        type: fc.constant('remove' as const),
        index: fc.nat({ max: 13 }),
      }),
      // Reorder a section (index and newPosition will be clamped at runtime)
      fc.record({
        type: fc.constant('reorder' as const),
        index: fc.nat({ max: 13 }),
        newPosition: fc.integer({ min: 1, max: 14 }),
      })
    ),
    { minLength: 1, maxLength: maxOps }
  );
}

// --- In-Memory Repository ---

/**
 * Creates an in-memory CMS repository that faithfully implements
 * the repository interface, allowing us to test the service logic
 * without mocks.
 */
function createInMemoryRepository(eventId: string, tenantId: string): CMSRepository {
  const sections: SectionRecord[] = [];

  return {
    createSection: async (data) => {
      const record: SectionRecord = {
        id: data.id,
        event_id: data.event_id,
        section_type: data.section_type,
        sort_order: data.sort_order,
        is_active: data.is_active,
        content: data.content,
        updated_at: new Date(),
      };
      sections.push(record);
      return record;
    },

    findSectionById: async (sectionId, evtId) => {
      return sections.find((s) => s.id === sectionId && s.event_id === evtId) ?? null;
    },

    findSectionByType: async (evtId, sectionType) => {
      return sections.find((s) => s.event_id === evtId && s.section_type === sectionType) ?? null;
    },

    findSectionsByEvent: async (evtId) => {
      return sections
        .filter((s) => s.event_id === evtId)
        .sort((a, b) => a.sort_order - b.sort_order);
    },

    findActiveSectionsByEvent: async (evtId) => {
      return sections
        .filter((s) => s.event_id === evtId && s.is_active)
        .sort((a, b) => a.sort_order - b.sort_order);
    },

    updateSection: async (sectionId, evtId, data) => {
      const idx = sections.findIndex((s) => s.id === sectionId && s.event_id === evtId);
      if (idx === -1) return null;
      if (data.sort_order !== undefined) sections[idx].sort_order = data.sort_order;
      if (data.is_active !== undefined) sections[idx].is_active = data.is_active;
      if (data.content !== undefined) sections[idx].content = data.content;
      if (data.updated_at !== undefined) sections[idx].updated_at = data.updated_at;
      return sections[idx];
    },

    updateManySortOrders: async (updates) => {
      for (const update of updates) {
        const section = sections.find((s) => s.id === update.id);
        if (section) {
          section.sort_order = update.sort_order;
        }
      }
    },

    deleteSection: async (sectionId, evtId) => {
      const idx = sections.findIndex((s) => s.id === sectionId && s.event_id === evtId);
      if (idx === -1) return false;
      sections.splice(idx, 1);
      return true;
    },

    findEventById: async (evtId, tId) => {
      if (evtId === eventId && tId === tenantId) {
        return { id: evtId };
      }
      return null;
    },

    getMaxSortOrder: async (evtId) => {
      const eventSections = sections.filter((s) => s.event_id === evtId);
      if (eventSections.length === 0) return 0;
      return Math.max(...eventSections.map((s) => s.sort_order));
    },
  };
}

// --- Assertion Helpers ---

/**
 * Asserts that sort_order values are unique and form a sequential ordering
 * starting from 1 without gaps or duplicates.
 */
function assertValidSortOrder(sections: SectionRecord[]): void {
  if (sections.length === 0) return;

  const sortOrders = sections.map((s) => s.sort_order).sort((a, b) => a - b);

  // All sort_order values must be unique
  const uniqueOrders = new Set(sortOrders);
  expect(uniqueOrders.size).toBe(sortOrders.length);

  // Must form sequential ordering starting from 1 without gaps
  for (let i = 0; i < sortOrders.length; i++) {
    expect(sortOrders[i]).toBe(i + 1);
  }
}

// --- Property Tests ---

describe('Property 8: Section Sort Order Uniqueness', () => {
  /**
   * **Validates: Requirement 5.9**
   *
   * For any event with N active sections, all sort_order values SHALL be unique
   * and form a valid sequential ordering without gaps or duplicates.
   */

  it('sort_order values are unique and sequential after initializing default sections', async () => {
    await fc.assert(
      fc.asyncProperty(arbEventId, arbTenantId, async (eventId, tenantId) => {
        const repository = createInMemoryRepository(eventId, tenantId);
        const service = new CMSService({ repository });

        // Initialize all 14 default sections
        const result = await service.initializeDefaultSections(eventId, tenantId);
        expect(isCMSError(result)).toBe(false);

        if (!isCMSError(result)) {
          assertValidSortOrder(result);
        }
      }),
      { numRuns: 30 }
    );
  });

  it('sort_order values remain unique and sequential after adding sections one by one', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbEventId,
        arbTenantId,
        arbSectionTypeSubset,
        async (eventId, tenantId, sectionTypes) => {
          const repository = createInMemoryRepository(eventId, tenantId);
          const service = new CMSService({ repository });

          // Add sections one by one
          for (const sectionType of sectionTypes) {
            await service.createSection(eventId, tenantId, {
              section_type: sectionType,
              is_active: true,
            });
          }

          // Verify sort_order invariant
          const sections = await service.listSections(eventId, tenantId);
          expect(isCMSError(sections)).toBe(false);

          if (!isCMSError(sections)) {
            assertValidSortOrder(sections);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('sort_order values remain unique and sequential after deleting sections', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbEventId,
        arbTenantId,
        fc.integer({ min: 1, max: 13 }),
        async (eventId, tenantId, deleteCount) => {
          const repository = createInMemoryRepository(eventId, tenantId);
          const service = new CMSService({ repository });

          // Initialize all 14 sections
          const initResult = await service.initializeDefaultSections(eventId, tenantId);
          expect(isCMSError(initResult)).toBe(false);
          if (isCMSError(initResult)) return;

          // Delete some sections
          const toDelete = initResult.slice(0, Math.min(deleteCount, initResult.length - 1));
          for (const section of toDelete) {
            await service.deleteSection(section.id, eventId, tenantId);
          }

          // Verify sort_order invariant on remaining sections
          const remaining = await service.listSections(eventId, tenantId);
          expect(isCMSError(remaining)).toBe(false);

          if (!isCMSError(remaining)) {
            assertValidSortOrder(remaining);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('sort_order values remain unique and sequential after reordering sections', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbEventId,
        arbTenantId,
        fc.integer({ min: 0, max: 13 }),
        fc.integer({ min: 1, max: 14 }),
        async (eventId, tenantId, sectionIndex, newPosition) => {
          const repository = createInMemoryRepository(eventId, tenantId);
          const service = new CMSService({ repository });

          // Initialize all 14 sections
          const initResult = await service.initializeDefaultSections(eventId, tenantId);
          expect(isCMSError(initResult)).toBe(false);
          if (isCMSError(initResult)) return;

          // Clamp index and position to valid range
          const clampedIndex = sectionIndex % initResult.length;
          const clampedPosition = ((newPosition - 1) % initResult.length) + 1;

          // Reorder a section
          await service.updateSortOrder(
            initResult[clampedIndex].id,
            eventId,
            tenantId,
            clampedPosition
          );

          // Verify sort_order invariant
          const sections = await service.listSections(eventId, tenantId);
          expect(isCMSError(sections)).toBe(false);

          if (!isCMSError(sections)) {
            assertValidSortOrder(sections);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('sort_order values remain unique and sequential after a mixed sequence of operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbEventId,
        arbTenantId,
        arbSectionOps(10),
        async (eventId, tenantId, ops) => {
          const repository = createInMemoryRepository(eventId, tenantId);
          const service = new CMSService({ repository });

          // Start with a few initial sections
          const initialTypes = ALL_SECTION_TYPES.slice(0, 5);
          for (const sectionType of initialTypes) {
            await service.createSection(eventId, tenantId, {
              section_type: sectionType,
              is_active: true,
            });
          }

          // Apply operations
          for (const op of ops) {
            const currentSections = await service.listSections(eventId, tenantId);
            if (isCMSError(currentSections)) continue;

            switch (op.type) {
              case 'add': {
                // Try to add — may fail if type already exists (that's fine)
                await service.createSection(eventId, tenantId, {
                  section_type: op.sectionType,
                  is_active: true,
                });
                break;
              }
              case 'remove': {
                if (currentSections.length > 0) {
                  const idx = op.index % currentSections.length;
                  await service.deleteSection(currentSections[idx].id, eventId, tenantId);
                }
                break;
              }
              case 'reorder': {
                if (currentSections.length > 0) {
                  const idx = op.index % currentSections.length;
                  const pos = ((op.newPosition - 1) % currentSections.length) + 1;
                  await service.updateSortOrder(
                    currentSections[idx].id,
                    eventId,
                    tenantId,
                    pos
                  );
                }
                break;
              }
            }
          }

          // After all operations, verify the sort_order invariant
          const finalSections = await service.listSections(eventId, tenantId);
          expect(isCMSError(finalSections)).toBe(false);

          if (!isCMSError(finalSections)) {
            assertValidSortOrder(finalSections);
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});
