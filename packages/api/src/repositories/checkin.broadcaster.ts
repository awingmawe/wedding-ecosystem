/**
 * WebSocket broadcaster adapter for CheckInService.
 *
 * Bridges the CheckInBroadcaster interface to the RealtimeServer,
 * translating domain events into WebSocket broadcasts.
 */

import type { RealtimeServer } from '@wedding/realtime';
import { GuestType } from '@wedding/shared';
import type { CheckInBroadcaster, CheckInBroadcastPayload } from '../services/checkin.service';

export class RealtimeCheckInBroadcaster implements CheckInBroadcaster {
  constructor(private readonly getRealtimeServer: () => RealtimeServer | null) {}

  broadcast(eventId: string, payload: CheckInBroadcastPayload): void {
    const realtime = this.getRealtimeServer();
    if (!realtime) return;

    if (payload.event_type === 'guest_checked_in') {
      realtime.broadcastCheckIn(eventId, {
        guest_id: payload.guest_id,
        guest_name: payload.guest_name,
        group: payload.guest_group,
        method: payload.method,
        checked_in_at: payload.checked_in_at.toISOString(),
        event_id: payload.event_id,
      });
    } else if (payload.event_type === 'go_show_added') {
      realtime.broadcastGoShow(eventId, {
        guest_id: payload.guest_id,
        guest_name: payload.guest_name,
        checked_in_at: payload.checked_in_at.toISOString(),
        event_id: payload.event_id,
      });
    }
  }
}
