/**
 * Prisma adapter for CheckInRepository interface.
 *
 * Implements the repository seam defined by CheckInService,
 * translating domain operations into Prisma queries.
 *
 * This adapter is the single place where check-in related DB queries live.
 * The service layer never touches Prisma directly.
 */

import { PrismaClient } from '@prisma/client';
import { CheckInMethod, GuestGroup, GuestType } from '@wedding/shared';
import type {
  CheckInRepository,
  CheckInRecord,
  GuestInfo,
  QRCodeInfo,
  GuestSearchResult,
} from '../services/checkin.service';

export class PrismaCheckInRepository implements CheckInRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findGuestById(guestId: string): Promise<GuestInfo | null> {
    const guest = await this.prisma.guest.findFirst({
      where: { id: guestId },
      select: { id: true, event_id: true, name: true, group: true },
    });

    if (!guest) return null;

    return {
      id: guest.id,
      event_id: guest.event_id,
      name: guest.name,
      group: guest.group as GuestGroup,
    };
  }

  async findGuestByIdAndEvent(guestId: string, eventId: string): Promise<GuestInfo | null> {
    const guest = await this.prisma.guest.findFirst({
      where: { id: guestId, event_id: eventId },
      select: { id: true, event_id: true, name: true, group: true },
    });

    if (!guest) return null;

    return {
      id: guest.id,
      event_id: guest.event_id,
      name: guest.name,
      group: guest.group as GuestGroup,
    };
  }

  async findQRCodeByPayload(payload: string): Promise<QRCodeInfo | null> {
    const qr = await this.prisma.qRCode.findFirst({
      where: { qr_payload: payload },
      select: { guest_id: true, is_active: true },
    });

    if (!qr) return null;

    return {
      guest_id: qr.guest_id,
      is_active: qr.is_active,
    };
  }

  async findCheckInByGuestId(guestId: string): Promise<CheckInRecord | null> {
    const checkIn = await this.prisma.checkIn.findFirst({
      where: { guest_id: guestId },
      select: {
        id: true,
        guest_id: true,
        scanner_device_id: true,
        method: true,
        checked_in_at: true,
      },
    });

    if (!checkIn) return null;

    return {
      id: checkIn.id,
      guest_id: checkIn.guest_id,
      scanner_device_id: checkIn.scanner_device_id,
      method: checkIn.method as CheckInMethod,
      checked_in_at: checkIn.checked_in_at,
    };
  }

  async createCheckIn(data: {
    id: string;
    guest_id: string;
    scanner_device_id: string | null;
    method: CheckInMethod;
    checked_in_at: Date;
  }): Promise<CheckInRecord> {
    const checkIn = await this.prisma.checkIn.create({
      data: {
        id: data.id,
        guest_id: data.guest_id,
        scanner_device_id: data.scanner_device_id,
        method: data.method,
        checked_in_at: data.checked_in_at,
      },
    });

    return {
      id: checkIn.id,
      guest_id: checkIn.guest_id,
      scanner_device_id: checkIn.scanner_device_id,
      method: checkIn.method as CheckInMethod,
      checked_in_at: checkIn.checked_in_at,
    };
  }

  async searchGuestsByName(
    eventId: string,
    query: string,
    limit: number
  ): Promise<GuestSearchResult[]> {
    const guests = await this.prisma.guest.findMany({
      where: {
        event_id: eventId,
        name: { contains: query, mode: 'insensitive' },
      },
      take: limit,
      orderBy: { name: 'asc' },
      include: {
        check_ins: { take: 1 },
      },
    });

    return guests.map((guest) => ({
      id: guest.id,
      name: guest.name,
      group: guest.group as GuestGroup,
      type: guest.type as GuestType,
      is_checked_in: guest.check_ins.length > 0,
      checked_in_at: guest.check_ins[0]?.checked_in_at ?? null,
    }));
  }

  async createGoShowGuest(data: {
    id: string;
    event_id: string;
    tenant_id: string;
    name: string;
    type: GuestType;
  }): Promise<GuestInfo> {
    const slug = data.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    const guest = await this.prisma.guest.create({
      data: {
        id: data.id,
        event_id: data.event_id,
        tenant_id: data.tenant_id,
        name: data.name,
        slug: `${slug}-goshow-${Date.now()}`,
        type: data.type,
        group: 'friend',
        plus_one_count: 0,
        delivery_status: 'not_sent',
      },
    });

    return {
      id: guest.id,
      event_id: guest.event_id,
      name: guest.name,
      group: guest.group as GuestGroup,
    };
  }

  async findEventById(eventId: string): Promise<{ id: string; tenant_id: string } | null> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId },
      select: { id: true, tenant_id: true },
    });

    return event;
  }
}
