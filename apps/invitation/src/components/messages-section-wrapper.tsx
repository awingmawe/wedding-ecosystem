'use client';

import { MessagesSection } from './messages-section';

interface MessagesSectionWrapperProps {
  eventId: string;
}

/**
 * Messages section wrapper that provides section heading and layout.
 * Contains both the message submission form and the messages list.
 */
export function MessagesSectionWrapper({ eventId }: MessagesSectionWrapperProps) {
  return (
    <div className="mx-auto max-w-lg px-6 py-12">
      <div className="mb-8 text-center">
        <h2 className="font-heading text-2xl font-bold text-[var(--color-primary)]">
          Ucapan & Doa
        </h2>
        <p className="mt-2 text-sm text-[var(--color-text)]/60">
          Kirimkan ucapan dan doa untuk kedua mempelai
        </p>
      </div>

      <div className="rounded-xl border border-[var(--color-text)]/5 bg-[var(--color-background)] p-6 shadow-sm">
        <MessagesSection eventId={eventId} />
      </div>
    </div>
  );
}
