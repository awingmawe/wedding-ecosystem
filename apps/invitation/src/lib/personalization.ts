import type { InvitationPageData } from './api';

/**
 * Personalized cover data extracted from invitation page data.
 * Used by InvitationCover component to display guest-specific greeting.
 */
export interface PersonalizedCoverData {
  guestName: string;
  brideName: string;
  groomName: string;
  eventDate: string;
}

/**
 * Extracts personalized cover data from the full invitation page data.
 * The guest name displayed on the cover always comes from the guest record.
 *
 * @param data - Full invitation page data including event and guest info
 * @returns Personalized cover data with the guest's name from their record
 */
export function getPersonalizedCoverData(data: InvitationPageData): PersonalizedCoverData {
  return {
    guestName: data.guest.name,
    brideName: data.event.bride_name,
    groomName: data.event.groom_name,
    eventDate: data.event.event_date,
  };
}

/**
 * Builds the invitation URL for a specific guest.
 * Format: /{event-slug}?to={guest-slug}
 *
 * @param eventSlug - The event's URL slug
 * @param guestSlug - The guest's URL slug
 * @returns The formatted invitation URL path
 */
export function buildInvitationUrl(eventSlug: string, guestSlug: string): string {
  return `/${eventSlug}?to=${guestSlug}`;
}

/**
 * Validates that personalization data is consistent:
 * - Guest name is present and non-empty
 * - Guest slug is present and non-empty
 * - Event slug is present and non-empty
 *
 * @param data - Full invitation page data
 * @returns true if personalization data is consistent
 */
export function validatePersonalization(data: InvitationPageData): boolean {
  return (
    data.guest.name.length > 0 &&
    data.guest.slug.length > 0 &&
    data.event.slug.length > 0
  );
}
