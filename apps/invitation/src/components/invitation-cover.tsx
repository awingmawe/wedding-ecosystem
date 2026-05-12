'use client';

import { useState } from 'react';

interface InvitationCoverProps {
  brideName: string;
  groomName: string;
  guestName: string;
  eventDate: string;
  coverContent?: {
    title?: string;
    subtitle?: string;
    background_image?: string;
    opening_text?: string;
  };
}

/**
 * Cover section of the wedding invitation.
 * Displays personalized greeting with guest name and "Buka Undangan" button.
 */
export function InvitationCover({
  brideName,
  groomName,
  guestName,
  eventDate,
  coverContent,
}: InvitationCoverProps) {
  const [isOpened, setIsOpened] = useState(false);

  const formattedDate = new Date(eventDate).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  if (isOpened) {
    return null;
  }

  return (
    <section
      className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6 text-center"
      style={{
        backgroundImage: coverContent?.background_image
          ? `url(${coverContent.background_image})`
          : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Overlay for readability */}
      <div className="absolute inset-0 bg-[var(--color-background)]/90" />

      <div className="relative z-10 flex flex-col items-center gap-6">
        {/* Opening text */}
        <p className="text-sm tracking-widest uppercase text-[var(--color-text)]/70">
          {coverContent?.opening_text || 'Undangan Pernikahan'}
        </p>

        {/* Couple names */}
        <h1 className="font-heading text-4xl font-bold leading-tight text-[var(--color-primary)] sm:text-5xl">
          {coverContent?.title || `${brideName} & ${groomName}`}
        </h1>

        {/* Date */}
        <p className="text-base text-[var(--color-text)]/80">
          {formattedDate}
        </p>

        {/* Divider */}
        <div className="my-4 h-px w-16 bg-[var(--color-accent)]" />

        {/* Personalized guest greeting */}
        <div className="rounded-lg border border-[var(--color-accent)]/30 bg-[var(--color-background)] px-6 py-4 shadow-sm">
          <p className="text-sm text-[var(--color-text)]/70">Kepada Yth.</p>
          <p className="mt-1 font-heading text-xl font-semibold text-[var(--color-text)]">
            {guestName}
          </p>
        </div>

        {/* Open invitation button */}
        <button
          onClick={() => setIsOpened(true)}
          className="mt-6 rounded-full bg-[var(--color-primary)] px-8 py-3 text-sm font-medium text-white shadow-lg transition-all hover:opacity-90 active:scale-95"
        >
          Buka Undangan
        </button>
      </div>
    </section>
  );
}
