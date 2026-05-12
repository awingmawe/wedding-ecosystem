'use client';

import { ThemeProvider } from '@/components/theme-provider';
import { InvitationCover } from '@/components/invitation-cover';
import {
  BrideGroomSection,
  StorySection,
  VerseSection,
  CountdownSection,
  AkadResepsiSection,
  RsvpSection,
  AttireSection,
  GallerySection,
  VideoSection,
  GiftSection,
  MessagesSection,
  ClosingSection,
  MusicPlayer,
} from '@/components/sections';
import type { InvitationPageData, SectionData } from '@/lib/api';
import { getActiveSectionsForRendering } from '@/lib/section-rendering';

interface InvitationViewProps {
  data: InvitationPageData;
}

/**
 * Client component that wraps the invitation with theme provider
 * and renders the personalized cover and all CMS-driven sections.
 * Sections are rendered in sort_order sequence, only active ones.
 */
export function InvitationView({ data }: InvitationViewProps) {
  const { event, guest, theme, sections } = data;

  // Find cover section content
  const coverSection = sections.find((s) => s.section_type === 'cover' && s.is_active);
  const coverContent = coverSection?.content as {
    title?: string;
    subtitle?: string;
    background_image?: string;
    opening_text?: string;
  } | undefined;

  // Filter active sections sorted by sort_order (excluding cover which is handled separately)
  const activeSections = getActiveSectionsForRendering(sections);

  // Check if music section is active
  const musicSection = sections.find(
    (s) => s.section_type === 'music' && s.is_active
  );
  const musicContent = musicSection?.content as {
    audio_url?: string;
    autoplay?: boolean;
    title?: string;
  } | undefined;

  return (
    <ThemeProvider theme={theme}>
      {/* Personalized cover with guest name */}
      <InvitationCover
        brideName={event.bride_name}
        groomName={event.groom_name}
        guestName={guest.name}
        eventDate={event.event_date}
        coverContent={coverContent}
      />

      {/* Main invitation content */}
      <main className="min-h-screen bg-[var(--color-background)]">
        {activeSections.map((section) => (
          <SectionRenderer key={section.id} section={section} />
        ))}
      </main>

      {/* Floating music player - only when music section is active */}
      {musicContent?.audio_url && (
        <MusicPlayer
          audioUrl={musicContent.audio_url}
          autoplay={musicContent.autoplay}
          title={musicContent.title}
        />
      )}
    </ThemeProvider>
  );
}

/**
 * Renders the appropriate component for each section type.
 */
function SectionRenderer({ section }: { section: SectionData }) {
  const content = section.content as Record<string, unknown>;

  switch (section.section_type) {
    case 'bride_groom':
      return (
        <BrideGroomSection
          content={content as Parameters<typeof BrideGroomSection>[0]['content']}
          sortOrder={section.sort_order}
        />
      );
    case 'story':
      return (
        <StorySection
          content={content as Parameters<typeof StorySection>[0]['content']}
          sortOrder={section.sort_order}
        />
      );
    case 'verse':
      return (
        <VerseSection
          content={content as Parameters<typeof VerseSection>[0]['content']}
          sortOrder={section.sort_order}
        />
      );
    case 'countdown':
      return (
        <CountdownSection
          content={content as Parameters<typeof CountdownSection>[0]['content']}
          sortOrder={section.sort_order}
        />
      );
    case 'akad_resepsi':
      return (
        <AkadResepsiSection
          content={content as Parameters<typeof AkadResepsiSection>[0]['content']}
          sortOrder={section.sort_order}
        />
      );
    case 'rsvp':
      return (
        <RsvpSection
          content={content as Parameters<typeof RsvpSection>[0]['content']}
          sortOrder={section.sort_order}
        />
      );
    case 'attire':
      return (
        <AttireSection
          content={content as Parameters<typeof AttireSection>[0]['content']}
          sortOrder={section.sort_order}
        />
      );
    case 'gallery':
      return (
        <GallerySection
          content={content as Parameters<typeof GallerySection>[0]['content']}
          sortOrder={section.sort_order}
        />
      );
    case 'video':
      return (
        <VideoSection
          content={content as Parameters<typeof VideoSection>[0]['content']}
          sortOrder={section.sort_order}
        />
      );
    case 'gift':
      return (
        <GiftSection
          content={content as Parameters<typeof GiftSection>[0]['content']}
          sortOrder={section.sort_order}
        />
      );
    case 'messages':
      return (
        <MessagesSection
          content={content as Parameters<typeof MessagesSection>[0]['content']}
          sortOrder={section.sort_order}
        />
      );
    case 'closing':
      return (
        <ClosingSection
          content={content as Parameters<typeof ClosingSection>[0]['content']}
          sortOrder={section.sort_order}
        />
      );
    case 'music':
      // Music is rendered as a floating player, not inline
      return null;
    default:
      return null;
  }
}
