import { FastifyInstance, FastifyPluginOptions, FastifyRequest } from 'fastify';
import { PrismaClient } from '@prisma/client';

interface InvitationRouteOptions extends FastifyPluginOptions {
  prisma: PrismaClient;
}

/**
 * Public invitation routes (no auth required).
 * Used by the Invitation App to fetch event and guest data for rendering.
 */
export async function invitationRoutes(app: FastifyInstance, opts: InvitationRouteOptions) {
  const { prisma } = opts;

  // GET /invitations/:eventSlug/:guestSlug
  // Fetch personalized invitation data for a specific guest
  app.get('/:eventSlug/:guestSlug', async (request: FastifyRequest, reply) => {
    const { eventSlug, guestSlug } = request.params as {
      eventSlug: string;
      guestSlug: string;
    };

    // Find event by slug
    const event = await prisma.event.findFirst({
      where: { slug: eventSlug, status: 'published' },
    });

    if (!event) {
      return reply.status(404).send({
        success: false,
        error: { code: 'INV_4001', message: 'Event tidak ditemukan' },
      });
    }

    // Find guest by slug within the event
    const guest = await prisma.guest.findFirst({
      where: { slug: guestSlug, event_id: event.id },
    });

    if (!guest) {
      return reply.status(404).send({
        success: false,
        error: { code: 'INV_4002', message: 'Tamu tidak ditemukan' },
      });
    }

    // Fetch event config (theme)
    const eventConfig = await prisma.eventConfig.findFirst({
      where: { event_id: event.id },
    });

    // Fetch active sections sorted by sort_order
    const sections = await prisma.invitationSection.findMany({
      where: { event_id: event.id, is_active: true },
      orderBy: { sort_order: 'asc' },
    });

    // Extract invitation theme from config
    const themeConfig = eventConfig?.theme_config as Record<string, unknown> | null;
    const invitationTheme = (themeConfig?.invitation as Record<string, unknown>) || {
      primary_color: '#5F7161',
      secondary_color: '#A7C4A0',
      accent_color: '#C9A96E',
      background_color: '#FDFCF9',
      text_color: '#2D3436',
      font_family: 'Poppins',
      font_heading: 'Playfair Display',
      template_id: 'classic-sage-gold',
    };

    return reply.send({
      event: {
        id: event.id,
        slug: event.slug,
        bride_name: event.bride_name,
        groom_name: event.groom_name,
        event_date: event.event_date,
        venue_name: event.venue_name,
        venue_address: event.venue_address,
        venue_maps_url: event.venue_maps_url,
        akad_start: event.akad_start,
        akad_end: event.akad_end,
        resepsi_start: event.resepsi_start,
        resepsi_end: event.resepsi_end,
        status: event.status,
      },
      guest: {
        id: guest.id,
        name: guest.name,
        slug: guest.slug,
        group: guest.group,
        plus_one_count: guest.plus_one_count,
      },
      theme: invitationTheme,
      sections: sections.map((s) => ({
        id: s.id,
        event_id: s.event_id,
        section_type: s.section_type,
        sort_order: s.sort_order,
        is_active: s.is_active,
        content: s.content,
      })),
    });
  });

  // GET /invitations/:eventSlug
  // Fetch basic event data (for previews or metadata)
  app.get('/:eventSlug', async (request: FastifyRequest, reply) => {
    const { eventSlug } = request.params as { eventSlug: string };

    const event = await prisma.event.findFirst({
      where: { slug: eventSlug, status: 'published' },
    });

    if (!event) {
      return reply.status(404).send({
        success: false,
        error: { code: 'INV_4001', message: 'Event tidak ditemukan' },
      });
    }

    return reply.send({
      id: event.id,
      slug: event.slug,
      bride_name: event.bride_name,
      groom_name: event.groom_name,
      event_date: event.event_date,
      venue_name: event.venue_name,
      venue_address: event.venue_address,
      venue_maps_url: event.venue_maps_url,
      akad_start: event.akad_start,
      akad_end: event.akad_end,
      resepsi_start: event.resepsi_start,
      resepsi_end: event.resepsi_end,
      status: event.status,
    });
  });
}
