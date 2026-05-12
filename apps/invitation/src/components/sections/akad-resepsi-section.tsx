'use client';

import { SectionWrapper } from './section-wrapper';

interface AkadResepsiContent {
  akad?: {
    date?: string;
    time_start?: string;
    time_end?: string;
  };
  resepsi?: {
    date?: string;
    time_start?: string;
    time_end?: string;
  };
  venue?: string;
  maps_url?: string;
}

interface AkadResepsiSectionProps {
  content: AkadResepsiContent;
  sortOrder: number;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function EventCard({
  title,
  date,
  timeStart,
  timeEnd,
}: {
  title: string;
  date?: string;
  timeStart?: string;
  timeEnd?: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-accent)]/20 bg-[var(--color-background)] p-5 text-center shadow-sm">
      <h3 className="mb-3 font-heading text-lg font-semibold text-[var(--color-primary)]">
        {title}
      </h3>
      {date && (
        <p className="text-sm text-[var(--color-text)]/80">{formatDate(date)}</p>
      )}
      {(timeStart || timeEnd) && (
        <p className="mt-1 text-sm font-medium text-[var(--color-text)]">
          {timeStart || ''}
          {timeStart && timeEnd ? ' - ' : ''}
          {timeEnd || ''} WIB
        </p>
      )}
    </div>
  );
}

export function AkadResepsiSection({ content, sortOrder }: AkadResepsiSectionProps) {
  return (
    <SectionWrapper sectionType="akad_resepsi" sortOrder={sortOrder}>
      <h2 className="mb-8 text-center font-heading text-2xl font-bold text-[var(--color-primary)]">
        Akad & Resepsi
      </h2>

      <div className="space-y-4">
        {content.akad && (
          <EventCard
            title="Akad Nikah"
            date={content.akad.date}
            timeStart={content.akad.time_start}
            timeEnd={content.akad.time_end}
          />
        )}
        {content.resepsi && (
          <EventCard
            title="Resepsi"
            date={content.resepsi.date}
            timeStart={content.resepsi.time_start}
            timeEnd={content.resepsi.time_end}
          />
        )}
      </div>

      {content.venue && (
        <div className="mt-6 text-center">
          <p className="text-sm text-[var(--color-text)]/70">Lokasi</p>
          <p className="mt-1 font-medium text-[var(--color-text)]">{content.venue}</p>
        </div>
      )}

      {content.maps_url && (
        <div className="mt-6 text-center">
          <a
            href={content.maps_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--color-primary)] px-6 py-2.5 text-sm font-medium text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)] hover:text-white"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            Lihat di Google Maps
          </a>
        </div>
      )}
    </SectionWrapper>
  );
}
