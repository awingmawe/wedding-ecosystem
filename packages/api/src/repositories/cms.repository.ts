/**
 * Prisma adapter for CMSRepository interface.
 *
 * Implements the repository seam defined by CMSService,
 * translating domain operations into Prisma queries.
 */

import { PrismaClient } from '@wedding/db';
import { SectionType } from '@wedding/shared';
import type { CMSRepository, SectionRecord } from '../services/cms.service';

export class PrismaCMSRepository implements CMSRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createSection(data: {
    id: string;
    event_id: string;
    section_type: SectionType;
    sort_order: number;
    is_active: boolean;
    content: Record<string, unknown>;
  }): Promise<SectionRecord> {
    const section = await this.prisma.invitationSection.create({
      data: {
        id: data.id,
        event_id: data.event_id,
        section_type: data.section_type,
        sort_order: data.sort_order,
        is_active: data.is_active,
        content: data.content as any,
      },
    });

    return this.toSectionRecord(section);
  }

  async findSectionById(sectionId: string, eventId: string): Promise<SectionRecord | null> {
    const section = await this.prisma.invitationSection.findFirst({
      where: { id: sectionId, event_id: eventId },
    });

    return section ? this.toSectionRecord(section) : null;
  }

  async findSectionByType(eventId: string, sectionType: SectionType): Promise<SectionRecord | null> {
    const section = await this.prisma.invitationSection.findFirst({
      where: { event_id: eventId, section_type: sectionType },
    });

    return section ? this.toSectionRecord(section) : null;
  }

  async findSectionsByEvent(eventId: string): Promise<SectionRecord[]> {
    const sections = await this.prisma.invitationSection.findMany({
      where: { event_id: eventId },
      orderBy: { sort_order: 'asc' },
    });

    return sections.map((s) => this.toSectionRecord(s));
  }

  async findActiveSectionsByEvent(eventId: string): Promise<SectionRecord[]> {
    const sections = await this.prisma.invitationSection.findMany({
      where: { event_id: eventId, is_active: true },
      orderBy: { sort_order: 'asc' },
    });

    return sections.map((s) => this.toSectionRecord(s));
  }

  async updateSection(
    sectionId: string,
    eventId: string,
    data: Partial<{
      sort_order: number;
      is_active: boolean;
      content: Record<string, unknown>;
      updated_at: Date;
    }>
  ): Promise<SectionRecord | null> {
    const result = await this.prisma.invitationSection.updateMany({
      where: { id: sectionId, event_id: eventId },
      data: {
        ...data,
        content: data.content as any,
      },
    });

    if (result.count === 0) return null;

    const updated = await this.prisma.invitationSection.findFirst({
      where: { id: sectionId, event_id: eventId },
    });

    return updated ? this.toSectionRecord(updated) : null;
  }

  async updateManySortOrders(updates: { id: string; sort_order: number }[]): Promise<void> {
    // Prisma does not have a bulk update with multiple conditions for different values easily,
    // so we iterate using sequential updates. It's safe given the small N (max 14).
    for (const update of updates) {
      await this.prisma.invitationSection.update({
        where: { id: update.id },
        data: { sort_order: update.sort_order },
      });
    }
  }

  async deleteSection(sectionId: string, eventId: string): Promise<boolean> {
    const result = await this.prisma.invitationSection.deleteMany({
      where: { id: sectionId, event_id: eventId },
    });

    return result.count > 0;
  }

  async findEventById(eventId: string, tenantId: string): Promise<{ id: string } | null> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, tenant_id: tenantId },
      select: { id: true },
    });

    return event;
  }

  async getMaxSortOrder(eventId: string): Promise<number> {
    const result = await this.prisma.invitationSection.aggregate({
      where: { event_id: eventId },
      _max: { sort_order: true },
    });

    return result._max.sort_order ?? 0;
  }

  // --- Private Helpers ---

  private toSectionRecord(section: {
    id: string;
    event_id: string;
    section_type: string;
    sort_order: number;
    is_active: boolean;
    content: any;
    updated_at: Date;
  }): SectionRecord {
    return {
      id: section.id,
      event_id: section.event_id,
      section_type: section.section_type as SectionType,
      sort_order: section.sort_order,
      is_active: section.is_active,
      content: typeof section.content === 'object' && section.content !== null ? section.content : {},
      updated_at: section.updated_at,
    };
  }
}
