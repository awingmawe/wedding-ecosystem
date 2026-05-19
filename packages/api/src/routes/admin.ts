import { FastifyInstance, FastifyPluginOptions, FastifyRequest } from 'fastify';
import { PrismaClient } from '@wedding/db';
import { AdminService } from '../services/admin.service';
import { PrismaAdminRepository } from '../repositories/admin.repository';
import { PlanType, UserRole, ErrorCode } from '@wedding/shared';
import { z } from 'zod';

interface AdminRouteOptions extends FastifyPluginOptions {
  prisma: PrismaClient;
}

export async function adminRoutes(app: FastifyInstance, opts: AdminRouteOptions) {
  const { prisma } = opts;
  const repository = new PrismaAdminRepository(prisma);
  const adminService = new AdminService(repository);

  // Enforce authentication & global admin role
  app.addHook('onRequest', async (request, reply) => {
    await (app as any).authenticate(request, reply);
    
    if (request.user?.role !== 'admin') {
      return reply.status(403).send({
        success: false,
        error: {
          code: ErrorCode.ROLE_INSUFFICIENT,
          message: 'Hanya administrator yang diizinkan untuk mengakses resource ini',
        },
      });
    }
  });

  // GET /admin/stats
  app.get('/stats', async (request, reply) => {
    const stats = await adminService.getGlobalStats();
    return reply.send({ success: true, data: stats });
  });

  // GET /admin/tenants
  app.get('/tenants', async (request, reply) => {
    const query = request.query as {
      page?: string;
      per_page?: string;
      plan_type?: PlanType;
    };

    const page = parseInt(query.page || '1', 10);
    const perPage = parseInt(query.per_page || '10', 10);
    const planType = query.plan_type;

    const result = await adminService.listTenants(page, perPage, planType);
    return reply.send({
      success: true,
      data: result.data,
      pagination: {
        page,
        per_page: perPage,
        total: result.total,
        total_pages: Math.ceil(result.total / perPage),
      },
    });
  });

  // POST /admin/tenants
  app.post('/tenants', async (request, reply) => {
    const bodySchema = z.object({
      name: z.string().min(1, 'Nama tenant tidak boleh kosong'),
      slug: z.string().min(1, 'Slug tenant tidak boleh kosong').regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug hanya boleh berisi huruf kecil, angka, dan tanda hubung'),
      plan_type: z.nativeEnum(PlanType),
      client_email: z.string().email('Format email tidak valid'),
      client_name: z.string().min(1, 'Nama client tidak boleh kosong'),
      client_password: z.string().min(8, 'Password minimal 8 karakter'),
    });

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: ErrorCode.VALIDATION_FAILED,
          message: parsed.error.errors[0].message,
        },
      });
    }

    const result = await adminService.createTenant(
      {
        name: parsed.data.name,
        slug: parsed.data.slug,
        plan_type: parsed.data.plan_type,
      },
      {
        email: parsed.data.client_email,
        name: parsed.data.client_name,
        passwordPlain: parsed.data.client_password,
      }
    );

    if ('code' in result) {
      return reply.status(400).send({
        success: false,
        error: {
          code: result.code,
          message: result.message,
        },
      });
    }

    return reply.status(201).send({
      success: true,
      data: result,
    });
  });

  // PATCH /admin/tenants/:id/status
  app.patch('/tenants/:id/status', async (request, reply) => {
    const { id } = request.params as { id: string };
    const bodySchema = z.object({
      is_active: z.boolean({ required_error: 'Status aktif/nonaktif harus ditentukan' }),
    });

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: ErrorCode.VALIDATION_FAILED,
          message: parsed.error.errors[0].message,
        },
      });
    }

    const result = await adminService.toggleTenantStatus(id, parsed.data.is_active);
    if ('code' in result) {
      return reply.status(404).send({
        success: false,
        error: {
          code: result.code,
          message: result.message,
        },
      });
    }

    return reply.send({
      success: true,
      data: result,
    });
  });

  // GET /admin/audit-logs
  app.get('/audit-logs', async (request, reply) => {
    const query = request.query as {
      page?: string;
      per_page?: string;
      action?: string;
      tenant_id?: string;
      user_id?: string;
      search?: string;
    };

    const page = parseInt(query.page || '1', 10);
    const perPage = parseInt(query.per_page || '10', 10);
    const action = query.action;
    const tenantId = query.tenant_id;
    const userId = query.user_id;
    const search = query.search;

    const result = await adminService.listAuditLogs(
      page,
      perPage,
      action === 'ALL' || !action ? undefined : action,
      tenantId === 'ALL' || !tenantId ? undefined : tenantId,
      userId === 'ALL' || !userId ? undefined : userId,
      search || undefined
    );

    return reply.send({
      success: true,
      data: result.data,
      pagination: {
        page,
        per_page: perPage,
        total: result.total,
        total_pages: Math.ceil(result.total / perPage),
      },
    });
  });

  // GET /admin/users
  app.get('/users', async (request, reply) => {
    const query = request.query as {
      page?: string;
      per_page?: string;
      role?: UserRole;
    };

    const page = parseInt(query.page || '1', 10);
    const perPage = parseInt(query.per_page || '10', 10);
    const role = query.role;

    const result = await adminService.listUsers(page, perPage, role);
    return reply.send({
      success: true,
      data: result.data,
      pagination: {
        page,
        per_page: perPage,
        total: result.total,
        total_pages: Math.ceil(result.total / perPage),
      },
    });
  });

  // PUT /admin/users/:id/reset-password
  app.put('/users/:id/reset-password', async (request, reply) => {
    const { id } = request.params as { id: string };
    const bodySchema = z.object({
      password: z.string().min(8, 'Password minimal 8 karakter'),
    });

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: ErrorCode.VALIDATION_FAILED,
          message: parsed.error.errors[0].message,
        },
      });
    }

    const result = await adminService.resetUserPassword(id, parsed.data.password);
    if ('code' in result) {
      return reply.status(404).send({
        success: false,
        error: {
          code: result.code,
          message: result.message,
        },
      });
    }

    return reply.send({
      success: true,
      message: 'Password berhasil diperbarui',
    });
  });
}
