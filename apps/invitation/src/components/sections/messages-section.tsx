'use client';

import { SectionWrapper } from './section-wrapper';

interface MessagesContent {
  is_enabled?: boolean;
  placeholder_text?: string;
}

interface MessagesSectionProps {
  content: MessagesContent;
  sortOrder: number;
}

/**
 * Messages section placeholder.
 * The full RSVP form and messages list will be implemented in task 14.3.
 * This component renders the section shell with appropriate heading.
 */
export function MessagesSection({ content, sortOrder }: MessagesSectionProps) {
  if (!content.is_enabled) return null;

  return (
    <SectionWrapper sectionType="messages" sortOrder={sortOrder}>
      <h2 className="mb-8 text-center font-heading text-2xl font-bold text-[var(--color-primary)]">
        Ucapan & Doa
      </h2>

      <p className="text-center text-sm text-[var(--color-text)]/60">
        {content.placeholder_text || 'Kirimkan ucapan dan doa untuk kedua mempelai'}
      </p>

      {/* Full messages form and list will be implemented in task 14.3 */}
    </SectionWrapper>
  );
}
