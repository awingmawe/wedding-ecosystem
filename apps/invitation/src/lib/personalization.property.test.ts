import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { InvitationPageData, GuestData, EventData } from './api';
import {
  getPersonalizedCoverData,
  buildInvitationUrl,
  validatePersonalization,
} from './personalization';

// --- Arbitraries ---

/** Generates a non-empty string suitable for names (1-100 chars, printable) */
const arbName = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0);

/** Generates a valid slug (lowercase alphanumeric with hyphens) */
const arbSlug = fc
  .array(
    fc.oneof(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
      fc.constant('-')
    ),
    { minLength: 1, maxLength: 50 }
  )
  .map((chars) => chars.join(''))
  .filter((s) => /^[a-z0-9]/.test(s) && /[a-z0-9]$/.test(s));

/** Generates a valid guest group */
const arbGroup = fc.constantFrom('family', 'friend', 'colleague', 'vip', 'other');

/** Generates a valid GuestData */
const arbGuest: fc.Arbitrary<GuestData> = fc.record({
  id: fc.uuid(),
  name: arbName,
  slug: arbSlug,
  group: arbGroup,
  plus_one_count: fc.integer({ min: 0, max: 5 }),
});

/** Generates a valid EventData */
const arbEvent: fc.Arbitrary<EventData> = fc.record({
  id: fc.uuid(),
  slug: arbSlug,
  bride_name: arbName,
  groom_name: arbName,
  event_date: fc
    .integer({ min: 2024, max: 2030 })
    .chain((year) =>
      fc.integer({ min: 1, max: 12 }).chain((month) =>
        fc.integer({ min: 1, max: 28 }).map((day) => {
          const m = String(month).padStart(2, '0');
          const d = String(day).padStart(2, '0');
          return `${year}-${m}-${d}`;
        })
      )
    ),
  venue_name: arbName,
  venue_address: fc.string({ minLength: 1, maxLength: 200 }),
  venue_maps_url: fc.webUrl(),
  akad_start: fc.constant('08:00'),
  akad_end: fc.constant('10:00'),
  resepsi_start: fc.constant('11:00'),
  resepsi_end: fc.constant('14:00'),
  status: fc.constantFrom('draft', 'published', 'archived'),
});

/** Generates a valid InvitationPageData */
const arbInvitationPageData: fc.Arbitrary<InvitationPageData> = fc.record({
  event: arbEvent,
  guest: arbGuest,
  theme: fc.record({
    primary_color: fc.array(fc.constantFrom(...'0123456789abcdef'.split('')), { minLength: 6, maxLength: 6 }).map((chars) => `#${chars.join('')}`),
    secondary_color: fc.array(fc.constantFrom(...'0123456789abcdef'.split('')), { minLength: 6, maxLength: 6 }).map((chars) => `#${chars.join('')}`),
    accent_color: fc.array(fc.constantFrom(...'0123456789abcdef'.split('')), { minLength: 6, maxLength: 6 }).map((chars) => `#${chars.join('')}`),
    background_color: fc.array(fc.constantFrom(...'0123456789abcdef'.split('')), { minLength: 6, maxLength: 6 }).map((chars) => `#${chars.join('')}`),
    text_color: fc.array(fc.constantFrom(...'0123456789abcdef'.split('')), { minLength: 6, maxLength: 6 }).map((chars) => `#${chars.join('')}`),
    font_family: fc.constant('Poppins'),
    font_heading: fc.constant('Playfair Display'),
    template_id: fc.uuid(),
  }),
  sections: fc.constant([]),
});

// --- Property Tests ---

describe('Property 9: Invitation Personalization', () => {
  /**
   * **Validates: Requirements 6.1, 14.2**
   *
   * For any valid guest data, the personalized cover always contains
   * the guest's exact name from the guest record.
   */
  it('personalized cover always contains the guest exact name', () => {
    fc.assert(
      fc.property(arbInvitationPageData, (data) => {
        const coverData = getPersonalizedCoverData(data);

        // The guest name on the cover must exactly match the guest record
        expect(coverData.guestName).toBe(data.guest.name);
      }),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 6.1, 14.2**
   *
   * For any valid event-slug and guest-slug, the URL format is always
   * /{event-slug}?to={guest-slug}.
   */
  it('invitation URL always follows /{event-slug}?to={guest-slug} format', () => {
    fc.assert(
      fc.property(arbSlug, arbSlug, (eventSlug, guestSlug) => {
        const url = buildInvitationUrl(eventSlug, guestSlug);

        // URL must start with /
        expect(url.startsWith('/')).toBe(true);

        // URL must contain the event slug at the beginning
        expect(url).toBe(`/${eventSlug}?to=${guestSlug}`);

        // URL must contain ?to= query parameter
        expect(url).toContain('?to=');

        // Parsing the URL should yield back the original slugs
        const [path, query] = url.split('?');
        expect(path).toBe(`/${eventSlug}`);
        expect(query).toBe(`to=${guestSlug}`);
      }),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 6.1, 14.2**
   *
   * The guest name in personalization output always matches the guest
   * record name — no mutation occurs during extraction.
   */
  it('guest name in personalization output is never mutated from guest record', () => {
    fc.assert(
      fc.property(arbInvitationPageData, (data) => {
        const coverData = getPersonalizedCoverData(data);

        // Name must be referentially equal (same string value)
        expect(coverData.guestName).toStrictEqual(data.guest.name);

        // Length must be preserved
        expect(coverData.guestName.length).toBe(data.guest.name.length);
      }),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 6.1, 14.2**
   *
   * Different guests always get different personalized content —
   * if two guests have different names, their cover data differs.
   */
  it('different guests produce different personalized cover content', () => {
    fc.assert(
      fc.property(arbInvitationPageData, arbGuest, (data, otherGuest) => {
        fc.pre(data.guest.name !== otherGuest.name);

        const coverData1 = getPersonalizedCoverData(data);
        const coverData2 = getPersonalizedCoverData({
          ...data,
          guest: otherGuest,
        });

        // Different guest names must produce different guestName in cover
        expect(coverData1.guestName).not.toBe(coverData2.guestName);
      }),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 6.1, 14.2**
   *
   * The personalization is deterministic — same input always produces
   * the same output.
   */
  it('personalization is deterministic for the same input', () => {
    fc.assert(
      fc.property(arbInvitationPageData, (data) => {
        const result1 = getPersonalizedCoverData(data);
        const result2 = getPersonalizedCoverData(data);

        // Same input must always produce identical output
        expect(result1).toStrictEqual(result2);
      }),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 6.1, 14.2**
   *
   * Validation passes for any well-formed invitation data with
   * non-empty guest name, guest slug, and event slug.
   */
  it('validation passes for all well-formed invitation data', () => {
    fc.assert(
      fc.property(arbInvitationPageData, (data) => {
        // Our arbitraries always generate valid data (non-empty names/slugs)
        expect(validatePersonalization(data)).toBe(true);
      }),
      { numRuns: 200 }
    );
  });
});
