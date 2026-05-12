import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  createEventWithTheme,
  createDefaultThemeApplicator,
  createFailingThemeApplicator,
  type EventCreationInput,
  type EventRepository,
  type ThemeApplicator,
  type ThemeConfig,
} from './event-creation';
import { DEFAULT_THEME } from './theme';

// --- Arbitraries ---

/** Generates a valid event slug */
const arbSlug = fc
  .string({ minLength: 3, maxLength: 50 })
  .map((s) => s.replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'event-slug');

/** Generates a valid name */
const arbName = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0);

/** Generates a valid date string (YYYY-MM-DD) */
const arbDate = fc
  .record({
    year: fc.integer({ min: 2024, max: 2030 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }),
  })
  .map(({ year, month, day }) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);

/** Generates a valid tenant_id */
const arbTenantId = fc.uuid();

/** Generates a valid EventCreationInput */
const arbEventInput: fc.Arbitrary<EventCreationInput> = fc.record({
  slug: arbSlug,
  bride_name: arbName,
  groom_name: arbName,
  event_date: arbDate,
  tenant_id: arbTenantId,
});

/** Generates an arbitrary error message for theme failure */
const arbErrorMessage = fc.string({ minLength: 1, maxLength: 200 });

/** Generates an arbitrary Error object */
const arbError = arbErrorMessage.map((msg) => new Error(msg));

// --- Test Helpers ---

function createMockRepository(): EventRepository {
  return {
    createEvent(_input: EventCreationInput) {
      return {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
      };
    },
  };
}

// --- Property Tests ---

describe('Property 21: Theme Application Resilience', () => {
  /**
   * **Validates: Requirement 11.7**
   *
   * For any newly created event, when default theme application succeeds,
   * the event SHALL have the default theme applied with valid theme configuration.
   */
  it('event is created with default theme when theme application succeeds', () => {
    fc.assert(
      fc.property(arbEventInput, (input) => {
        const repository = createMockRepository();
        const themeApplicator = createDefaultThemeApplicator();

        const result = createEventWithTheme(input, repository, themeApplicator);

        // Event must be created successfully
        expect(result.id).toBeDefined();
        expect(result.id.length).toBeGreaterThan(0);
        expect(result.slug).toBe(input.slug);
        expect(result.bride_name).toBe(input.bride_name);
        expect(result.groom_name).toBe(input.groom_name);
        expect(result.event_date).toBe(input.event_date);
        expect(result.tenant_id).toBe(input.tenant_id);
        expect(result.status).toBe('draft');

        // Theme must be applied
        expect(result.theme_applied).toBe(true);
        expect(result.theme_config).not.toBeNull();
        expect(result.theme_config!.dashboard).toEqual(DEFAULT_THEME);
        expect(result.theme_config!.invitation).toBeDefined();
      }),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirement 11.7**
   *
   * For any newly created event, if default theme application fails due to system error,
   * the event SHALL still be created successfully without styling.
   */
  it('event is created without styling when theme application fails', () => {
    fc.assert(
      fc.property(arbEventInput, arbError, (input, error) => {
        const repository = createMockRepository();
        const themeApplicator = createFailingThemeApplicator(error);

        const result = createEventWithTheme(input, repository, themeApplicator);

        // Event must still be created successfully
        expect(result.id).toBeDefined();
        expect(result.id.length).toBeGreaterThan(0);
        expect(result.slug).toBe(input.slug);
        expect(result.bride_name).toBe(input.bride_name);
        expect(result.groom_name).toBe(input.groom_name);
        expect(result.event_date).toBe(input.event_date);
        expect(result.tenant_id).toBe(input.tenant_id);
        expect(result.status).toBe('draft');

        // Theme must NOT be applied, but event still exists
        expect(result.theme_applied).toBe(false);
        expect(result.theme_config).toBeNull();
      }),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirement 11.7**
   *
   * For any event creation, the event SHALL be created successfully regardless of
   * whether theme application succeeds or fails. The event creation itself never
   * throws due to theme errors.
   */
  it('event creation never fails due to theme application errors', () => {
    fc.assert(
      fc.property(
        arbEventInput,
        fc.boolean(),
        arbError,
        (input, shouldThemeFail, error) => {
          const repository = createMockRepository();
          const themeApplicator: ThemeApplicator = shouldThemeFail
            ? createFailingThemeApplicator(error)
            : createDefaultThemeApplicator();

          // This should NEVER throw, regardless of theme applicator behavior
          const result = createEventWithTheme(input, repository, themeApplicator);

          // Event is always created
          expect(result.id).toBeDefined();
          expect(result.id.length).toBeGreaterThan(0);
          expect(result.slug).toBe(input.slug);
          expect(result.bride_name).toBe(input.bride_name);
          expect(result.groom_name).toBe(input.groom_name);
          expect(result.tenant_id).toBe(input.tenant_id);
          expect(result.created_at).toBeDefined();

          // Theme state is consistent with success/failure
          if (shouldThemeFail) {
            expect(result.theme_applied).toBe(false);
            expect(result.theme_config).toBeNull();
          } else {
            expect(result.theme_applied).toBe(true);
            expect(result.theme_config).not.toBeNull();
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});
