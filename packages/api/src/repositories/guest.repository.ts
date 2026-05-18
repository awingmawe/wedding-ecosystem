/**
 * Prisma adapter for GuestRepository interface.
 *
 * Implements the repository seam defined by GuestService,
 * translating domain operations into Prisma queries.
 *
 * This adapter is the single place where guest-related DB queries live.
 * The service layer never touches Prisma directly.
 */

import { PrismaClient } from '@wedding/db';
import { GuestGroup, GuestType, DeliveryStatus } from '@wedding/shared';
import type {
  GuestRepository,
  GuestRecord,
  QRCodeRecord,
  GuestListItem,
  PaginatedGuestList,
  GuestFilterOptions,
} from '../services/guest.service';
import type { PaginationInput } from '@wedding/shared';

export class PrismaGuestRepository implements GuestRepository {
  constructor(private readonly prisma: PrismaClient) { }

  async createGuest(data: {
    id: string;
    event_id: string;
    tenant_id: string;
    name: string;
    slug: string;
    phone: string | null;
    email: string | null;
    group: GuestGroup;
    type: GuestType;
    plus_one_count: number;
    invitation_url: string | null;
    delivery_status: DeliveryStatus;
  }): Promise<GuestRecord> {
    const guest = await this.prisma.guest.create({
      data: {
        id: data.id,
        event_id: data.event_id,
        tenant_id: data.tenant_id,
        name: data.name,
        slug: data.slug,
        phone: data.phone,
        email: data.email,
        group: data.group,
        type: data.type,
        plus_one_count: data.plus_one_count,
        invitation_url: data.invitation_url,
        delivery_status: data.delivery_status,
      },
    });

    return this.toGuestRecord(guest);
  }

  async createQRCode(data: {
    id: string;
    guest_id: string;
    qr_payload: string;
    is_active: boolean;
  }): Promise<QRCodeRecord> {
    const qr = await this.prisma.qRCode.create({
      data: {
        id: data.id,
        guest_id: data.guest_id,
        qr_payload: data.qr_payload,
        is_active: data.is_active,
      },
    });

    return {
      id: qr.id,
      guest_id: qr.guest_id,
      qr_payload: qr.qr_payload,
      qr_image_url: qr.qr_image_url,
      is_active: qr.is_active,
      generated_at: qr.generated_at,
    };
  }

  async findGuestById(guestId: string, tenantId: string): Promise<GuestRecord | null> {
    const guest = await this.prisma.guest.findFirst({
      where: { id: guestId, tenant_id: tenantId },
    });

    return guest ? this.toGuestRecord(guest) : null;
  }

  async findGuestBySlug(eventId: string, slug: string): Promise<GuestRecord | null> {
    const guest = await this.prisma.guest.findFirst({
      where: { event_id: eventId, slug },
    });

    return guest ? this.toGuestRecord(guest) : null;
  }

  async findGuestsByEvent(
    eventId: string,
    tenantId: string,
    pagination: PaginationInput,
    filters?: GuestFilterOptions
  ): Promise<PaginatedGuestList> {
    const page = pagination.page ?? 1;
    const per_page = pagination.per_page ?? 50;
    const skip = (page - 1) * per_page;

    // Build where clause — always scoped by event + tenant.
    // Cast to `any` because Prisma's GuestWhereInput is not available until
    // `prisma generate` runs; the shape is correct at runtime.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { event_id: eventId, tenant_id: tenantId };

    if (filters?.group) {
      where.group = filters.group;
    }

    // Translate status filter to Prisma relation conditions
    if (filters?.status) {
      switch (filters.status) {
        case 'belum_rsvp':
          where.rsvps = { none: {} };
          break;
        case 'confirmed':
          where.rsvps = { some: { attendance: 'both' } };
          break;
        case 'declined':
          where.rsvps = { some: { attendance: 'decline' } };
          break;
        case 'checked_in':
          where.check_ins = { some: {} };
          break;
      }
    }

    const [total, guestsRaw] = await Promise.all([
      this.prisma.guest.count({ where }),
      this.prisma.guest.findMany({
        where,
        skip,
        take: per_page,
        orderBy: { created_at: 'desc' },
        include: {
          qr_codes: { where: { is_active: true }, take: 1 },
          rsvps: { take: 1, orderBy: { submitted_at: 'desc' } },
          check_ins: { take: 1 },
        },
      }),
    ]);

    const total_pages = Math.ceil(total / per_page);

    // `guestsRaw` has the relation arrays attached but TypeScript infers
    // the base Guest type without them. Cast via `any` to access relation fields.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const guests = guestsRaw as any[];

    const data: GuestListItem[] = guests.map((guest) => ({
      id: guest.id,
      name: guest.name,
      slug: guest.slug,
      group: guest.group as GuestGroup,
      type: guest.type as GuestType,
      plus_one_count: guest.plus_one_count,
      phone: guest.phone ?? null,
      email: guest.email ?? null,
      invitation_url: guest.invitation_url ?? null,
      delivery_status: guest.delivery_status as DeliveryStatus,
      rsvp_status: guest.rsvps[0]?.attendance ?? null,
      check_in_status: guest.check_ins.length > 0,
      qr_active: guest.qr_codes.length > 0 && guest.qr_codes[0].is_active,
    }));

    return {
      data,
      pagination: { page, per_page, total, total_pages },
    };
  }

  async updateGuest(
    guestId: string,
    tenantId: string,
    data: Partial<{
      name: string;
      slug: string;
      phone: string | null;
      email: string | null;
      group: GuestGroup;
      plus_one_count: number;
      invitation_url: string | null;
    }>
  ): Promise<GuestRecord | null> {
    const guest = await this.prisma.guest.updateMany({
      where: { id: guestId, tenant_id: tenantId },
      data,
    });

    if (guest.count === 0) return null;

    const updated = await this.prisma.guest.findFirst({
      where: { id: guestId, tenant_id: tenantId },
    });

    return updated ? this.toGuestRecord(updated) : null;
  }

  async deleteGuest(guestId: string, tenantId: string): Promise<boolean> {
    const result = await this.prisma.guest.deleteMany({
      where: { id: guestId, tenant_id: tenantId },
    });

    return result.count > 0;
  }

  async deactivateQRCode(guestId: string): Promise<boolean> {
    const result = await this.prisma.qRCode.updateMany({
      where: { guest_id: guestId, is_active: true },
      data: { is_active: false },
    });

    return result.count > 0;
  }

  async findQRCodeByGuestId(guestId: string): Promise<QRCodeRecord | null> {
    const qr = await this.prisma.qRCode.findFirst({
      where: { guest_id: guestId, is_active: true },
    });

    if (!qr) return null;

    return {
      id: qr.id,
      guest_id: qr.guest_id,
      qr_payload: qr.qr_payload,
      qr_image_url: qr.qr_image_url,
      is_active: qr.is_active,
      generated_at: qr.generated_at,
    };
  }

  async checkSlugExists(eventId: string, slug: string): Promise<boolean> {
    const guest = await this.prisma.guest.findFirst({
      where: { event_id: eventId, slug },
      select: { id: true },
    });

    return guest !== null;
  }

  async checkQRPayloadExists(payload: string): Promise<boolean> {
    const qr = await this.prisma.qRCode.findFirst({
      where: { qr_payload: payload },
      select: { id: true },
    });

    return qr !== null;
  }

  async findEventById(
    eventId: string,
    tenantId: string
  ): Promise<{ id: string; slug: string } | null> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, tenant_id: tenantId },
      select: { id: true, slug: true },
    });

    return event;
  }

  async findGuestNamesByEvent(eventId: string, tenantId: string): Promise<string[]> {
    const guests = await this.prisma.guest.findMany({
      where: { event_id: eventId, tenant_id: tenantId },
      select: { name: true },
    });

    return guests.map((g: { name: any; }) => g.name);
  }

  async searchGuestsByName(
    query: string,
    eventId: string,
    tenantId: string,
    limit: number
  ): Promise<GuestRecord[]> {
    const guests = await this.prisma.guest.findMany({
      where: {
        event_id: eventId,
        tenant_id: tenantId,
        name: { contains: query, mode: 'insensitive' },
      },
      take: limit,
      orderBy: { name: 'asc' },
    });

    return guests.map((g: { id: string; event_id: string; tenant_id: string; name: string; slug: string; phone: string | null; email: string | null; group: string; type: string; plus_one_count: number; invitation_url: string | null; delivery_status: string; created_at: Date; }) => this.toGuestRecord(g));
  }

  // --- Private Helpers ---

  private toGuestRecord(guest: {
    id: string;
    event_id: string;
    tenant_id: string;
    name: string;
    slug: string;
    phone: string | null;
    email: string | null;
    group: string;
    type: string;
    plus_one_count: number;
    invitation_url: string | null;
    delivery_status: string;
    created_at: Date;
  }): GuestRecord {
    return {
      id: guest.id,
      event_id: guest.event_id,
      tenant_id: guest.tenant_id,
      name: guest.name,
      slug: guest.slug,
      phone: guest.phone,
      email: guest.email,
      group: guest.group as GuestGroup,
      type: guest.type as GuestType,
      plus_one_count: guest.plus_one_count,
      invitation_url: guest.invitation_url,
      delivery_status: guest.delivery_status as DeliveryStatus,
      created_at: guest.created_at,
    };
  }
}
