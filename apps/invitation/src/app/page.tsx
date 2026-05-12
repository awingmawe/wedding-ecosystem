import { InvitationError } from '@/components/invitation-error';

/**
 * Root page - shows error since a valid event-slug is required.
 * Users should access /{event-slug}?to={guest-slug} directly.
 */
export default function Home() {
  return <InvitationError type="event-not-found" />;
}
