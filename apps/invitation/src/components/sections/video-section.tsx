'use client';

import Image from 'next/image';
import { SectionWrapper } from './section-wrapper';

interface VideoContent {
  video_url?: string;
  thumbnail_url?: string;
  type?: 'youtube' | 'upload';
}

interface VideoSectionProps {
  content: VideoContent;
  sortOrder: number;
}

/**
 * Extracts YouTube video ID from various URL formats.
 */
function getYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?/]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export function VideoSection({ content, sortOrder }: VideoSectionProps) {
  if (!content.video_url) return null;

  const isYouTube = content.type === 'youtube';
  const youtubeId = isYouTube ? getYouTubeId(content.video_url) : null;

  return (
    <SectionWrapper sectionType="video" sortOrder={sortOrder}>
      <h2 className="mb-8 text-center font-heading text-2xl font-bold text-[var(--color-primary)]">
        Video
      </h2>

      <div className="relative aspect-video w-full overflow-hidden rounded-lg">
        {isYouTube && youtubeId ? (
          <iframe
            src={`https://www.youtube.com/embed/${youtubeId}`}
            title="Video pernikahan"
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
          />
        ) : (
          <>
            {content.thumbnail_url && (
              <Image
                src={content.thumbnail_url}
                alt="Video thumbnail"
                fill
                className="object-cover"
                loading="lazy"
                sizes="(max-width: 512px) 100vw, 512px"
              />
            )}
            <video
              src={content.video_url}
              controls
              preload="none"
              poster={content.thumbnail_url}
              className="absolute inset-0 h-full w-full object-cover"
            >
              <track kind="captions" />
            </video>
          </>
        )}
      </div>
    </SectionWrapper>
  );
}
