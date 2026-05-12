'use client';

import { SectionWrapper } from './section-wrapper';

interface RsvpContent {
  options?: string[];
  max_plus_one?: number;
}

interface RsvpSectionProps {
  content: RsvpContent;
  sortOrder: number;
}

/**
 * RSVP section placeholder.
 * The full RSVP form with validation will be implemented in task 14.3.
 * This component renders the section shell with appropriate heading.
 */
export function RsvpSection({ content, sortOrder }: RsvpSectionProps) {
  return (
    <SectionWrapper sectionType="rsvp" sortOrder={sortOrder}>
      <h2 className="mb-8 text-center font-heading text-2xl font-bold text-[var(--color-primary)]">
        Konfirmasi Kehadiran
      </h2>

      <p className="text-center text-sm text-[var(--color-text)]/60">
        Silakan konfirmasi kehadiran Anda
      </p>

      {/* Full RSVP form will be implemented in task 14.3 */}
    </SectionWrapper>
  );
}
