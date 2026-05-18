/**
 * Tenant-Scoped Query Module
 *
 * Encapsulates the domain invariant: "every resource access must be scoped by tenant_id."
 * This module is the SINGLE place where tenant isolation is enforced at the query level.
 *
 * If a route forgets to scope by tenant, it won't compile — because these functions
 * require tenant_id as a parameter, not as an afterthought.
 *
 * Requirements: 1.2 (tenant isolation), 1.3 (cross-tenant rejection)
 */

import { PrismaClient } from '@wedding/db';
import { FastifyReply } from 'fastify';

// --- Types ---

/** Result of a tenant-scoped lookup: either the resource or null (not found / wrong tenant) */
export type TenantScopedResult<T> = T | null;

/** Event with minimal fields needed for route-level checks */
export interface TenantEvent {
  id: string;
  tenant_id: string;
  slug: string;
}

/** Full event data */
export interface TenantEventFull {
  id: string;
  tenant_id: string;
  slug: string;
  bride_name: string;
  groom_name: string;
  event_date: Date;
  venue_name: string;
  venue_address: string;
  venue_maps_url: string;
  akad_start: string;
  akad_end: string;
  resepsi_start: string;
  resepsi_end: string;
  status: string;
  created_at: Date;
}

// --- Tenant-Scoped Query Functions ---

/**
 * Get an event by ID, scoped to a tenant.
 * Returns null if the event doesn't exist OR doesn't belong to the tenant.
 * (Intentionally indistinguishable — Req 1.3: don't reveal resource existence)
 */
export async function getTenantEvent(
  prisma: PrismaClient,
  eventId: string,
  tenantId: string
): Promise<TenantScopedResult<TenantEvent>> {
  const event = await prisma.event.findFirst({
    where: { id: eventId, tenant_id: tenantId },
    select: { id: true, tenant_id: true, slug: true },
  });

  return event;
}

/**
 * Get the current (most recent) event for a tenant.
 * Returns null if the tenant has no events.
 */
export async function getCurrentTenantEvent(
  prisma: PrismaClient,
  tenantId: string
): Promise<TenantScopedResult<TenantEventFull>> {
  const event = await prisma.event.findFirst({
    where: { tenant_id: tenantId },
    orderBy: { created_at: 'desc' },
  });

  return event as TenantEventFull | null;
}

/**
 * Get a guest by ID, scoped to a tenant.
 * Returns null if the guest doesn't exist OR doesn't belong to the tenant.
 */
export async function getTenantGuest(
  prisma: PrismaClient,
  guestId: string,
  tenantId: string
): Promise<TenantScopedResult<{ id: string; event_id: string; tenant_id: string; name: string }>> {
  return prisma.guest.findFirst({
    where: { id: guestId, tenant_id: tenantId },
    select: { id: true, event_id: true, tenant_id: true, name: true },
  });
}

// --- Reply Helpers ---

/**
 * Send a standard 404 response for a missing/unauthorized event.
 * Use this instead of manually constructing the error response.
 */
export function replyEventNotFound(reply: FastifyReply) {
  return reply.status(404).send({
    success: false,
    error: { code: 'RES_5001', message: 'Event tidak ditemukan' },
  });
}

/**
 * Send a standard 404 response for a missing/unauthorized guest.
 */
export function replyGuestNotFound(reply: FastifyReply) {
  return reply.status(404).send({
    success: false,
    error: { code: 'GUEST_6001', message: 'Tamu tidak ditemukan' },
  });
}

/**
 * Send a standard 404 response for a missing CMS section.
 */
export function replySectionNotFound(reply: FastifyReply) {
  return reply.status(404).send({
    success: false,
    error: { code: 'CMS_9001', message: 'Section tidak ditemukan' },
  });
}
