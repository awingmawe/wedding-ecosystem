'use client';

import Image from 'next/image';
import { SectionWrapper } from './section-wrapper';

interface AttireContent {
  description?: string;
  outfit_image?: string;
  color_palette?: string[];
}

interface AttireSectionProps {
  content: AttireContent;
  sortOrder: number;
}

export function AttireSection({ content, sortOrder }: AttireSectionProps) {
  return (
    <SectionWrapper sectionType="attire" sortOrder={sortOrder}>
      <h2 className="mb-8 text-center font-heading text-2xl font-bold text-[var(--color-primary)]">
        Dress Code
      </h2>

      {content.description && (
        <p className="mb-6 text-center text-sm leading-relaxed text-[var(--color-text)]/80">
          {content.description}
        </p>
      )}

      {content.outfit_image && (
        <div className="relative mx-auto mb-6 aspect-[3/4] w-full max-w-xs overflow-hidden rounded-lg">
          <Image
            src={content.outfit_image}
            alt="Dress code"
            fill
            className="object-cover"
            loading="lazy"
            sizes="(max-width: 320px) 100vw, 320px"
          />
        </div>
      )}

      {content.color_palette && content.color_palette.length > 0 && (
        <div className="text-center">
          <p className="mb-3 text-xs uppercase tracking-widest text-[var(--color-text)]/60">
            Palet Warna
          </p>
          <div className="flex justify-center gap-3">
            {content.color_palette.map((color, index) => (
              <div
                key={index}
                className="h-10 w-10 rounded-full border border-[var(--color-text)]/10 shadow-sm"
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
        </div>
      )}
    </SectionWrapper>
  );
}
