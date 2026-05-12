import type { Metadata } from 'next';
import { fetchInvitationData } from '@/lib/api';
import { InvitationError } from '@/components/invitation-error';
import { InvitationView } from './invitation-view';

interface PageProps {
  params: Promise<{ eventSlug: string }>;
  searchParams: Promise<{ to?: string }>;
}

/**
 * Dynamic invitation page.
 * URL format: /{event-slug}?to={guest-slug}
 * Fetches event config and guest data from API, renders personalized invitation.
 */
export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { eventSlug } = await params;
  const { to: guestSlug } = await searchParams;

  if (!guestSlug) {
    return {
      title: 'Undangan Pernikahan',
      description: 'Undangan pernikahan digital',
    };
  }

  const data = await fetchInvitationData(eventSlug, guestSlug);

  if (!data) {
    return {
      title: 'Undangan Tidak Ditemukan',
      description: 'Undangan yang Anda cari tidak tersedia.',
    };
  }

  return {
    title: `Undangan Pernikahan ${data.event.bride_name} & ${data.event.groom_name}`,
    description: `Anda diundang ke pernikahan ${data.event.bride_name} & ${data.event.groom_name}`,
    openGraph: {
      title: `Undangan Pernikahan ${data.event.bride_name} & ${data.event.groom_name}`,
      description: `Kepada ${data.guest.name} - Anda diundang ke pernikahan ${data.event.bride_name} & ${data.event.groom_name}`,
      type: 'website',
    },
  };
}

export default async function InvitationPage({ params, searchParams }: PageProps) {
  const { eventSlug } = await params;
  const { to: guestSlug } = await searchParams;

  // If no guest slug provided, show error
  if (!guestSlug) {
    return <InvitationError type="guest-not-found" />;
  }

  // Fetch invitation data from API
  const data = await fetchInvitationData(eventSlug, guestSlug);

  // If data not found, show appropriate error
  if (!data) {
    return <InvitationError type="event-not-found" />;
  }

  return <InvitationView data={data} />;
}
