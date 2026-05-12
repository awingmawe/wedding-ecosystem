'use client';

import Image from 'next/image';
import { SectionWrapper } from './section-wrapper';

interface GalleryPhoto {
  url?: string;
  caption?: string;
  order?: number;
}

interface GalleryContent {
  photos?: GalleryPhoto[];
}

interface GallerySectionProps {
  content: GalleryContent;
  sortOrder: number;
}

export function GallerySection({ content, sortOrder }: GallerySectionProps) {
  const photos = (content.photos || [])
    .filter((p) => p.url)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  if (photos.length === 0) return null;

  return (
    <SectionWrapper sectionType="gallery" sortOrder={sortOrder}>
      <h2 className="mb-8 text-center font-heading text-2xl font-bold text-[var(--color-primary)]">
        Galeri
      </h2>

      <div className="grid grid-cols-2 gap-2">
        {photos.map((photo, index) => (
          <div
            key={index}
            className="relative aspect-square overflow-hidden rounded-lg"
          >
            <Image
              src={photo.url!}
              alt={photo.caption || `Foto ${index + 1}`}
              fill
              className="object-cover"
              loading="lazy"
              sizes="(max-width: 512px) 50vw, 256px"
            />
            {photo.caption && (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                <p className="text-xs text-white">{photo.caption}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </SectionWrapper>
  );
}
