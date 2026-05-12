'use client';

import Image from 'next/image';
import { SectionWrapper } from './section-wrapper';

interface StoryChapter {
  title?: string;
  description?: string;
  image?: string;
  date?: string;
}

interface StoryContent {
  chapters?: StoryChapter[];
}

interface StorySectionProps {
  content: StoryContent;
  sortOrder: number;
}

export function StorySection({ content, sortOrder }: StorySectionProps) {
  const chapters = content.chapters || [];

  return (
    <SectionWrapper sectionType="story" sortOrder={sortOrder}>
      <h2 className="mb-8 text-center font-heading text-2xl font-bold text-[var(--color-primary)]">
        Cerita Kami
      </h2>
      <div className="relative space-y-8">
        {/* Timeline line */}
        <div className="absolute left-4 top-0 h-full w-px bg-[var(--color-accent)]/30" />

        {chapters.map((chapter, index) => (
          <div key={index} className="relative pl-10">
            {/* Timeline dot */}
            <div className="absolute left-2.5 top-1 h-3 w-3 rounded-full bg-[var(--color-accent)]" />

            {chapter.date && (
              <p className="mb-1 text-xs font-medium text-[var(--color-accent)]">
                {chapter.date}
              </p>
            )}
            {chapter.title && (
              <h3 className="mb-2 font-heading text-lg font-semibold text-[var(--color-text)]">
                {chapter.title}
              </h3>
            )}
            {chapter.image && (
              <div className="relative mb-3 aspect-video w-full overflow-hidden rounded-lg">
                <Image
                  src={chapter.image}
                  alt={chapter.title || `Cerita ${index + 1}`}
                  fill
                  className="object-cover"
                  loading="lazy"
                  sizes="(max-width: 512px) 100vw, 512px"
                />
              </div>
            )}
            {chapter.description && (
              <p className="text-sm leading-relaxed text-[var(--color-text)]/80">
                {chapter.description}
              </p>
            )}
          </div>
        ))}
      </div>
    </SectionWrapper>
  );
}
