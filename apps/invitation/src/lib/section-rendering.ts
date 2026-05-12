import type { SectionData } from './api';

/**
 * Filters and sorts sections for rendering in the invitation view.
 * Only active sections are included, sorted by sort_order ascending.
 * The cover section is excluded from the main content flow (rendered separately).
 *
 * This is the core rendering logic used by InvitationView to determine
 * which sections to display and in what order.
 */
export function getActiveSectionsForRendering(sections: SectionData[]): SectionData[] {
  return sections
    .filter((s) => s.is_active && s.section_type !== 'cover')
    .sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Determines whether a section should be rendered based on its active status.
 * Used for validation: inactive sections must never appear in the rendered output.
 */
export function isSectionRenderable(section: SectionData): boolean {
  return section.is_active;
}
