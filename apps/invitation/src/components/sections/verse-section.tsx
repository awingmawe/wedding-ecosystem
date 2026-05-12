'use client';

import Image from 'next/image';
import { SectionWrapper } from './section-wrapper';

interface VerseContent {
  text?: string;
  source?: string;
  background_image?: string;
}

interface VerseSectionProps {
  content: VerseContent;
  sortOrder: number;
}

export function VerseSection({ content, sortOrder }: VerseSectionProps) {
  return (
    <SectionWrapper
      sectionType="verse"
      sortOrder={sortOrder}
      className="relative overflow-hidden"
    >
      {content.background_image && (
        <div className="absolute inset-0 -z-10">
          <Image
            src={content.background_image}
            alt=""
            fill
            className="object-cover opacity-20"
            loading="lazy"
            sizes="100vw"
          />
        </div>
      )}
      <div className="text-center">
        <div className="mb-4 inline-block h-px w-12 bg-[var(--color-accent)]" />
        {content.text && (
          <blockquote className="font-heading text-lg italic leading-relaxed text-[var(--color-text)]">
            &ldquo;{content.text}&rdquo;
          </blockquote>
        )}
        {content.source && (
          <p className="mt-4 text-sm font-medium text-[var(--color-accent)]">
            — {content.source}
          </p>
        )}
        <div className="mt-4 inline-block h-px w-12 bg-[var(--color-accent)]" />
      </div>
    </SectionWrapper>
  );
}
