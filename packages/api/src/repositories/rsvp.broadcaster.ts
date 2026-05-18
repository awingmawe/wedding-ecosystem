import type { RealtimeServer } from '@wedding/realtime';
import { RsvpBroadcaster, RsvpBroadcastPayload } from '../services/rsvp.service';

export class RealtimeRsvpBroadcaster implements RsvpBroadcaster {
  constructor(private readonly getRealtime: () => RealtimeServer | null) {}

  broadcast(eventId: string, payload: RsvpBroadcastPayload): void {
    const realtime = this.getRealtime();
    if (!realtime) return;

    if (payload.event_type === 'rsvp_updated') {
      realtime.broadcastRsvpUpdate(eventId, {
        guest_id: payload.guest_id,
        guest_name: payload.guest_name,
        attendance: payload.attendance,
        guest_count: payload.guest_count,
        submitted_at: new Date().toISOString(), // Optional: pass the submitted_at if needed, though here we just generate ISO
        event_id: eventId,
      });
    }
  }
}
