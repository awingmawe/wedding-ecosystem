/**
 * API client for fetching invitation data from the backend.
 * Used by the invitation app to load event config and guest data.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export interface InvitationThemeData {
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  background_color: string;
  text_color: string;
  font_family: string;
  font_heading: string;
  template_id: string;
}

export interface EventData {
  id: string;
  slug: string;
  bride_name: string;
  groom_name: string;
  event_date: string;
  venue_name: string;
  venue_address: string;
  venue_maps_url: string;
  akad_start: string;
  akad_end: string;
  resepsi_start: string;
  resepsi_end: string;
  status: string;
}

export interface GuestData {
  id: string;
  name: string;
  slug: string;
  group: string;
  plus_one_count: number;
}

export interface SectionData {
  id: string;
  event_id: string;
  section_type: string;
  sort_order: number;
  is_active: boolean;
  content: Record<string, unknown>;
}

export interface InvitationPageData {
  event: EventData;
  guest: GuestData;
  theme: InvitationThemeData;
  sections: SectionData[];
}

/**
 * Fetch invitation data for a specific event and guest.
 * Returns null if event or guest is not found.
 */
export async function fetchInvitationData(
  eventSlug: string,
  guestSlug: string
): Promise<InvitationPageData | null> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/invitations/${encodeURIComponent(eventSlug)}/${encodeURIComponent(guestSlug)}`,
      {
        next: { revalidate: 60 }, // ISR: revalidate every 60 seconds
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data;
  } catch {
    return null;
  }
}

/**
 * Fetch event data by slug (without guest personalization).
 * Used for generating static paths or previewing.
 */
export async function fetchEventBySlug(eventSlug: string): Promise<EventData | null> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/invitations/${encodeURIComponent(eventSlug)}`,
      {
        next: { revalidate: 60 },
      }
    );

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
}

// --- RSVP API ---

export interface RsvpPayload {
  guest_id: string;
  attendance: 'akad' | 'resepsi' | 'both' | 'decline';
  guest_count: number;
}

export interface RsvpResponse {
  id: string;
  guest_id: string;
  attendance: string;
  guest_count: number;
  submitted_at: string;
}

/**
 * Submit RSVP for a guest.
 * Uses upsert logic on the backend (updates existing RSVP if already submitted).
 */
export async function submitRsvp(payload: RsvpPayload): Promise<RsvpResponse> {
  const response = await fetch(`${API_BASE_URL}/rsvp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Gagal mengirim RSVP' }));
    throw new Error(error.message || 'Gagal mengirim RSVP');
  }

  return response.json();
}

// --- Messages API ---

export interface MessageData {
  id: string;
  sender_name: string;
  message_text: string;
  created_at: string;
}

export interface MessagesResponse {
  messages: MessageData[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface SubmitMessagePayload {
  event_id: string;
  sender_name: string;
  message_text: string;
}

/**
 * Fetch messages for an event with pagination.
 * Returns newest messages first.
 */
export async function fetchMessages(
  eventId: string,
  page: number = 1,
  limit: number = 20
): Promise<MessagesResponse> {
  const response = await fetch(
    `${API_BASE_URL}/messages/${encodeURIComponent(eventId)}?page=${page}&limit=${limit}`,
    { cache: 'no-store' }
  );

  if (!response.ok) {
    throw new Error('Gagal memuat ucapan');
  }

  return response.json();
}

/**
 * Submit a new message/wish for an event.
 */
export async function submitMessage(payload: SubmitMessagePayload): Promise<MessageData> {
  const response = await fetch(`${API_BASE_URL}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Gagal mengirim ucapan' }));
    throw new Error(error.message || 'Gagal mengirim ucapan');
  }

  return response.json();
}
