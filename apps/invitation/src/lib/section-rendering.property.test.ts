import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { SectionData } from './api';
import { getActiveSectionsForRendering } from './section-rendering';

// --- Arbitraries ---

/** All valid section types (excluding cover which is handled separately) */
const SECTION_TYPES = [
  'bride_groom',
  'story',
  'verse',
  'countdown',
  'akad_resepsi',
  'rsvp',
  'attire',
  'gallery',
  'video',
  'gift',
  'messages',
  'closing',
  'music',
] as const;

/** All section types including cover */
const ALL_SECTION_TYPES = ['cover', ...SECTION_TYPES] as const;

/** Generates a valid section type */
const arbSectionType = fc.constantFrom(...ALL_SECTION_TYPES);

/** Generates a valid sort_order (positive integer) */
const arbSortOrder = fc.integer({ min: 1, max: 100 });

/** Generates a single SectionData object */
const arbSection: fc.Arbitrary<SectionData> = fc.record({
  id: fc.uuid(),
  event_id: fc.uuid(),
  section_type: arbSectionType as fc.Arbitrary<string>,
  sort_order: arbSortOrder,
  is_active: fc.boolean(),
  content: fc.constant({}),
});

/** Generates a list of sections with unique sort_orders */
const arbSectionsWithUniqueSortOrders: fc.Arbitrary<SectionData[]> = fc
  .uniqueArray(fc.integer({ min: 1, max: 100 }), { minLength: 0, maxLength: 14 })
  .chain((sortOrders) =>
    fc.tuple(
      ...sortOrders.map((sortOrder) =>
        fc.record({
          id: fc.uuid(),
          event_id: fc.uuid(),
          section_type: arbSectionType as fc.Arbitrary<string>,
          sort_order: fc.constant(sortOrder),
          is_active: fc.boolean(),
          content: fc.constant({}),
        })
      )
    )
  );

/** Generates a realistic event configuration with all 14 section types */
const arbEventSections: fc.Arbitrary<SectionData[]> = fc
  .shuffledSubarray([...ALL_SECTION_TYPES], { minLength: 1, maxLength: 14 })
  .chain((types) => {
    const sortOrders = types.map((_, i) => i + 1);
    return fc.tuple(
      ...types.map((type, i) =>
        fc.record({
          id: fc.uuid(),
          event_id: fc.uuid(),
          section_type: fc.constant(type as string),
          sort_order: fc.constant(sortOrders[i]),
          is_active: fc.boolean(),
          content: fc.constant({}),
        })
      )
    );
  });

// --- Property Tests ---

describe('Property 7: Active Section Rendering', () => {
  /**
   * **Validates: Requirements 5.3, 6.3**
   *
   * For any event configuration with a set of sections marked active/inactive,
   * the Invitation App SHALL render only the sections marked as active.
   * Inactive sections must never appear in the rendered output.
   */
  it('only active sections are included in rendered output', () => {
    fc.assert(
      fc.property(arbEventSections, (sections) => {
        const rendered = getActiveSectionsForRendering(sections);

        // Every rendered section must be active
        for (const section of rendered) {
          expect(section.is_active).toBe(true);
        }

        // No inactive section should appear in rendered output
        const inactiveSections = sections.filter((s) => !s.is_active);
        const renderedIds = new Set(rendered.map((s) => s.id));
        for (const inactive of inactiveSections) {
          expect(renderedIds.has(inactive.id)).toBe(false);
        }
      }),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 5.3, 6.3**
   *
   * For any event configuration, the rendered sections SHALL appear
   * in the order defined by sort_order (ascending).
   */
  it('rendered sections appear in sort_order sequence', () => {
    fc.assert(
      fc.property(arbEventSections, (sections) => {
        const rendered = getActiveSectionsForRendering(sections);

        // Verify sort_order is strictly non-decreasing
        for (let i = 1; i < rendered.length; i++) {
          expect(rendered[i].sort_order).toBeGreaterThanOrEqual(
            rendered[i - 1].sort_order
          );
        }
      }),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 5.3, 6.3**
   *
   * For any event configuration, all active non-cover sections must be
   * present in the rendered output. No active section should be dropped.
   */
  it('all active non-cover sections are rendered', () => {
    fc.assert(
      fc.property(arbEventSections, (sections) => {
        const rendered = getActiveSectionsForRendering(sections);

        // Count active non-cover sections in input
        const expectedActive = sections.filter(
          (s) => s.is_active && s.section_type !== 'cover'
        );

        expect(rendered.length).toBe(expectedActive.length);

        // Every active non-cover section from input must be in rendered
        const renderedIds = new Set(rendered.map((s) => s.id));
        for (const section of expectedActive) {
          expect(renderedIds.has(section.id)).toBe(true);
        }
      }),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 5.3, 6.3**
   *
   * The ordering is consistent regardless of the input order of sections.
   * Shuffling the input sections should produce the same rendered output order.
   */
  it('ordering is consistent regardless of input order', () => {
    fc.assert(
      fc.property(
        arbEventSections,
        fc.context(),
        (sections, ctx) => {
          // Render with original order
          const rendered1 = getActiveSectionsForRendering(sections);

          // Render with reversed input order
          const reversed = [...sections].reverse();
          const rendered2 = getActiveSectionsForRendering(reversed);

          // Both should produce the same output
          expect(rendered1.length).toBe(rendered2.length);
          for (let i = 0; i < rendered1.length; i++) {
            expect(rendered1[i].id).toBe(rendered2[i].id);
            expect(rendered1[i].sort_order).toBe(rendered2[i].sort_order);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 5.3, 6.3**
   *
   * Cover section is never included in the main section rendering flow,
   * even when it is marked as active (it is rendered separately).
   */
  it('cover section is excluded from main rendering flow', () => {
    fc.assert(
      fc.property(arbEventSections, (sections) => {
        const rendered = getActiveSectionsForRendering(sections);

        // No cover section should appear in rendered output
        for (const section of rendered) {
          expect(section.section_type).not.toBe('cover');
        }
      }),
      { numRuns: 200 }
    );
  });
});
