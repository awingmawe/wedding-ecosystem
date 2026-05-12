'use client';

import Image from 'next/image';
import { SectionWrapper } from './section-wrapper';

interface ClosingContent {
  text?: string;
  image?: string;
  thank_you_message?: string;
}

interface ClosingSectionProps {
  content: ClosingContent;
  sortOrder: number;
}

export function ClosingSection({ content, sortOrder }: ClosingSectionProps) {
  return (
    <SectionWrapper sectionType="closing" sortOrder={sortOrder}>
      {content.image && (
        <div className="relative mx-auto mb-6 aspect-square w-48 overflow-hidden rounded-full border-4 border-[var(--color-accent)]/30">
          <Image
            src={content.image}
            alt="Penutup"
            fill
            className="object-cover"
            loading="lazy"
            sizes="192px"
          />
        </div>
      )}

      {content.text && (
        <p className="mb-4 text-center text-sm leading-relaxed text-[var(--color-text)]/80">
          {content.text}
        </p>
      )}

      {content.thank_you_message && (
        <p className="text-center font-heading text-lg font-semibold text-[var(--color-primary)]">
          {content.thank_you_message}
        </p>
      )}

      {!content.thank_you_message && (
        <p className="text-center font-heading text-lg font-semibold text-[var(--color-primary)]">
          Terima Kasih
        </p>
      )}
    </SectionWrapper>
  );
}
