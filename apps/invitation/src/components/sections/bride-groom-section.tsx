'use client';

import Image from 'next/image';
import { SectionWrapper } from './section-wrapper';

interface BrideGroomContent {
  bride?: {
    name?: string;
    parent_info?: string;
    photo?: string;
    instagram?: string;
  };
  groom?: {
    name?: string;
    parent_info?: string;
    photo?: string;
    instagram?: string;
  };
}

interface BrideGroomSectionProps {
  content: BrideGroomContent;
  sortOrder: number;
}

function PersonCard({
  person,
  label,
}: {
  person: BrideGroomContent['bride'];
  label: string;
}) {
  if (!person) return null;

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      {person.photo && (
        <div className="relative h-40 w-40 overflow-hidden rounded-full border-4 border-[var(--color-accent)]/30">
          <Image
            src={person.photo}
            alt={person.name || label}
            fill
            className="object-cover"
            loading="lazy"
            sizes="160px"
          />
        </div>
      )}
      <p className="text-xs uppercase tracking-widest text-[var(--color-text)]/60">
        {label}
      </p>
      <h3 className="font-heading text-2xl font-bold text-[var(--color-primary)]">
        {person.name}
      </h3>
      {person.parent_info && (
        <p className="text-sm text-[var(--color-text)]/70">{person.parent_info}</p>
      )}
      {person.instagram && (
        <a
          href={`https://instagram.com/${person.instagram.replace('@', '')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-[var(--color-accent)] hover:underline"
        >
          @{person.instagram.replace('@', '')}
        </a>
      )}
    </div>
  );
}

export function BrideGroomSection({ content, sortOrder }: BrideGroomSectionProps) {
  return (
    <SectionWrapper sectionType="bride_groom" sortOrder={sortOrder}>
      <h2 className="mb-8 text-center font-heading text-2xl font-bold text-[var(--color-primary)]">
        Mempelai
      </h2>
      <div className="flex flex-col items-center gap-8">
        <PersonCard person={content.bride} label="Mempelai Wanita" />
        <div className="flex items-center gap-4">
          <div className="h-px w-8 bg-[var(--color-accent)]" />
          <span className="font-heading text-2xl text-[var(--color-accent)]">&</span>
          <div className="h-px w-8 bg-[var(--color-accent)]" />
        </div>
        <PersonCard person={content.groom} label="Mempelai Pria" />
      </div>
    </SectionWrapper>
  );
}
