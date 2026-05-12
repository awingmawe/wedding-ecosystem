'use client';

import { RsvpForm } from './rsvp-form';

interface RsvpSectionProps {
  guestId: string;
  plusOneCount: number;
}

/**
 * RSVP section wrapper that provides section heading and layout.
 * Renders the RSVP form within the invitation section context.
 */
export function RsvpSection({ guestId, plusOneCount }: RsvpSectionProps) {
  return (
    <div className="mx-auto max-w-lg px-6 py-12">
      <div className="mb-8 text-center">
        <h2 className="font-heading text-2xl font-bold text-[var(--color-primary)]">
          Konfirmasi Kehadiran
        </h2>
        <p className="mt-2 text-sm text-[var(--color-text)]/60">
          Mohon konfirmasi kehadiran Anda
        </p>
      </div>

      <div className="rounded-xl border border-[var(--color-text)]/5 bg-[var(--color-background)] p-6 shadow-sm">
        <RsvpForm guestId={guestId} plusOneCount={plusOneCount} />
      </div>
    </div>
  );
}
