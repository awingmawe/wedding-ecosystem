import { PrismaClient } from '@wedding/db';
import { AttendanceType } from '@wedding/shared';
import { GuestForRsvp, RsvpRecord, RsvpRepository } from '../services/rsvp.service';

export class PrismaRsvpRepository implements RsvpRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findGuestByIdAndEvent(guestId: string, eventId: string): Promise<GuestForRsvp | null> {
    const guest = await this.prisma.guest.findFirst({
      where: { id: guestId, event_id: eventId },
      select: {
        id: true,
        event_id: true,
        tenant_id: true,
        name: true,
        plus_one_count: true,
      },
    });
    return guest;
  }

  async findRsvpByGuestId(guestId: string): Promise<RsvpRecord | null> {
    const rsvp = await this.prisma.rSVP.findFirst({
      where: { guest_id: guestId },
    });
    if (!rsvp) return null;
    return {
      id: rsvp.id,
      guest_id: rsvp.guest_id,
      attendance: rsvp.attendance as AttendanceType,
      guest_count: rsvp.guest_count,
      submitted_at: rsvp.submitted_at,
    };
  }

  async createRsvp(data: {
    id: string;
    guest_id: string;
    attendance: AttendanceType;
    guest_count: number;
  }): Promise<RsvpRecord> {
    const rsvp = await this.prisma.rSVP.create({
      data: {
        id: data.id,
        guest_id: data.guest_id,
        attendance: data.attendance,
        guest_count: data.guest_count,
        submitted_at: new Date(),
      },
    });
    return {
      id: rsvp.id,
      guest_id: rsvp.guest_id,
      attendance: rsvp.attendance as AttendanceType,
      guest_count: rsvp.guest_count,
      submitted_at: rsvp.submitted_at,
    };
  }

  async updateRsvp(
    rsvpId: string,
    data: {
      attendance: AttendanceType;
      guest_count: number;
    }
  ): Promise<RsvpRecord> {
    const rsvp = await this.prisma.rSVP.update({
      where: { id: rsvpId },
      data: {
        attendance: data.attendance,
        guest_count: data.guest_count,
        submitted_at: new Date(),
      },
    });
    return {
      id: rsvp.id,
      guest_id: rsvp.guest_id,
      attendance: rsvp.attendance as AttendanceType,
      guest_count: rsvp.guest_count,
      submitted_at: rsvp.submitted_at,
    };
  }
}
