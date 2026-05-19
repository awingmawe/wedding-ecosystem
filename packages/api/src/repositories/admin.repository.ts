/**
 * Prisma adapter for AdminRepository interface.
 *
 * Implements the repository seam defined by AdminService,
 * translating domain operations into Prisma queries.
 *
 * Scoped globally, bypassing standard tenant isolation checks.
 */

import { PrismaClient } from '@wedding/db';
import { PlanType, UserRole } from '@wedding/shared';
import type {
  AdminRepository,
  TenantRecord,
  UserRecord,
  GlobalStats,
  AuditLogRecord,
} from '../services/admin.service';

export class PrismaAdminRepository implements AdminRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listTenants(
    page: number,
    perPage: number,
    planType?: PlanType
  ): Promise<{ data: TenantRecord[]; total: number }> {
    const skip = (page - 1) * perPage;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (planType) {
      where.plan_type = planType;
    }

    const [total, tenants] = await Promise.all([
      this.prisma.tenant.count({ where }),
      this.prisma.tenant.findMany({
        where,
        skip,
        take: perPage,
        orderBy: { created_at: 'desc' },
      }),
    ]);

    return {
      data: tenants.map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        plan_type: tenant.plan_type as PlanType,
        is_active: tenant.is_active,
        created_at: tenant.created_at,
      })),
      total,
    };
  }

  async createTenantWithClient(
    tenantData: { name: string; slug: string; plan_type: PlanType },
    clientUserData: { email: string; password_hash: string; name: string }
  ): Promise<TenantRecord> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Create the tenant
      const tenant = await tx.tenant.create({
        data: {
          name: tenantData.name,
          slug: tenantData.slug,
          plan_type: tenantData.plan_type,
          is_active: true,
        },
      });

      // 2. Create the primary client user for this tenant
      await tx.user.create({
        data: {
          tenant_id: tenant.id,
          email: clientUserData.email,
          password_hash: clientUserData.password_hash,
          role: 'client',
          name: clientUserData.name,
        },
      });

      return {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        plan_type: tenant.plan_type as PlanType,
        is_active: tenant.is_active,
        created_at: tenant.created_at,
      };
    });
  }

  async updateTenantStatus(tenantId: string, isActive: boolean): Promise<TenantRecord | null> {
    try {
      const tenant = await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { is_active: isActive },
      });

      return {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        plan_type: tenant.plan_type as PlanType,
        is_active: tenant.is_active,
        created_at: tenant.created_at,
      };
    } catch {
      return null;
    }
  }

  async listUsers(
    page: number,
    perPage: number,
    role?: UserRole
  ): Promise<{ data: UserRecord[]; total: number }> {
    const skip = (page - 1) * perPage;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (role) {
      where.role = role;
    }

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take: perPage,
        orderBy: { created_at: 'desc' },
        include: {
          tenant: {
            select: {
              name: true,
            },
          },
        },
      }),
    ]);

    return {
      data: users.map((user) => ({
        id: user.id,
        tenant_id: user.tenant_id,
        tenant_name: user.tenant?.name ?? null,
        email: user.email,
        role: user.role as UserRole,
        name: user.name,
        created_at: user.created_at,
      })),
      total,
    };
  }

  async updateUserPassword(userId: string, passwordHash: string): Promise<boolean> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { password_hash: passwordHash },
      });
      return true;
    } catch {
      return false;
    }
  }

  async getGlobalStats(): Promise<GlobalStats> {
    const [totalTenants, totalUsers, activeScannerDevices, totalGuests] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.user.count(),
      this.prisma.scannerDevice.count({ where: { is_active: true } }),
      this.prisma.guest.count(),
    ]);

    return {
      total_tenants: totalTenants,
      total_users: totalUsers,
      active_scanner_devices: activeScannerDevices,
      total_guests: totalGuests,
    };
  }

  async checkTenantSlugExists(slug: string): Promise<boolean> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true },
    });
    return tenant !== null;
  }

  async checkUserEmailExists(email: string): Promise<boolean> {
    const user = await this.prisma.user.findFirst({
      where: { email },
      select: { id: true },
    });
    return user !== null;
  }

  async listAuditLogs(
    page: number,
    perPage: number,
    action?: string,
    tenantId?: string,
    userId?: string,
    search?: string
  ): Promise<{ data: AuditLogRecord[]; total: number }> {
    const skip = (page - 1) * perPage;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (action) {
      where.action = action;
    }
    if (tenantId) {
      where.tenant_id = tenantId;
    }
    if (userId) {
      where.user_id = userId;
    }
    if (search) {
      where.OR = [
        { action: { contains: search, mode: 'insensitive' } },
        { request_id: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, logs] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: perPage,
        orderBy: { timestamp: 'desc' },
      }),
    ]);

    const tenantIds: string[] = Array.from(new Set(logs.map((l: any) => l.tenant_id).filter((id: any): id is string => id !== null)));
    const userIds: string[] = Array.from(new Set(logs.map((l: any) => l.user_id).filter((id: any): id is string => id !== null)));

    const [tenants, users] = await Promise.all([
      tenantIds.length > 0
        ? this.prisma.tenant.findMany({
            where: { id: { in: tenantIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      userIds.length > 0
        ? this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, email: true, name: true },
          })
        : Promise.resolve([]),
    ]);

    const tenantMap = new Map<string, string>(tenants.map(t => [t.id, t.name]));
    const userMap = new Map<string, { email: string; name: string }>(
      users.map(u => [u.id, { email: u.email, name: u.name }])
    );

    const data = logs.map((log: any) => {
      const tenantName = log.tenant_id ? tenantMap.get(log.tenant_id) || null : null;
      const user = log.user_id ? userMap.get(log.user_id) || null : null;

      return {
        id: log.id,
        timestamp: log.timestamp,
        user_id: log.user_id,
        user_email: user?.email ?? null,
        user_name: user?.name ?? null,
        tenant_id: log.tenant_id,
        tenant_name: tenantName,
        action: log.action,
        request_id: log.request_id,
        metadata: log.metadata ?? null,
      };
    });

    return { data, total };
  }
}
