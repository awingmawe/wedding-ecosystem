import { describe, it, expect } from 'vitest';
import { FastifyRequest, FastifyReply } from 'fastify';
import { ErrorCode, UserRole } from '@wedding/shared';
import {
  createRBACMiddleware,
  hasRole,
  hasAnyRole,
  getUserRole,
  PERMISSIONS,
} from './rbac.middleware';
import { AuthenticatedRequest, TenantContext } from './tenant-isolation.middleware';

// --- Test Helpers ---

function createAuthenticatedRequest(role: UserRole): AuthenticatedRequest {
  const request = {
    headers: {},
    tenantContext: {
      user_id: 'user-123',
      tenant_id: 'tenant-abc',
      role: role,
      email: 'user@example.com',
    },
  } as unknown as AuthenticatedRequest;
  return request;
}

function createUnauthenticatedRequest(): FastifyRequest {
  return {
    headers: {},
  } as unknown as FastifyRequest;
}

function createMockReply() {
  const reply = {
    statusCode: 0,
    body: null as unknown,
    status(code: number) {
      reply.statusCode = code;
      return reply;
    },
    send(body: unknown) {
      reply.body = body;
      return reply;
    },
  };
  return reply as unknown as FastifyReply & { statusCode: number; body: unknown };
}

// --- Tests ---

describe('RBAC Middleware', () => {
  describe('createRBACMiddleware', () => {
    it('should allow access when user role is in allowed roles', async () => {
      const middleware = createRBACMiddleware({
        allowedRoles: [UserRole.CLIENT, UserRole.WO],
      });
      const request = createAuthenticatedRequest(UserRole.CLIENT);
      const reply = createMockReply();

      await middleware(request, reply);

      // Reply should not have been called (no error)
      expect(reply.statusCode).toBe(0);
    });

    it('should deny access when user role is not in allowed roles', async () => {
      const middleware = createRBACMiddleware({
        allowedRoles: [UserRole.ADMIN, UserRole.CLIENT],
      });
      const request = createAuthenticatedRequest(UserRole.SCANNER);
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.statusCode).toBe(403);
      expect((reply.body as { error: { code: string } }).error.code).toBe(
        ErrorCode.ROLE_INSUFFICIENT
      );
    });

    it('should return generic 403 message without revealing resource existence', async () => {
      const middleware = createRBACMiddleware({
        allowedRoles: [UserRole.ADMIN],
      });
      const request = createAuthenticatedRequest(UserRole.SCANNER);
      const reply = createMockReply();

      await middleware(request, reply);

      const body = reply.body as { error: { message: string } };
      expect(body.error.message).toBe('Akses ditolak.');
      // Should NOT contain any resource-specific information
      expect(body.error.message).not.toContain('not found');
      expect(body.error.message).not.toContain('does not exist');
    });

    it('should deny access when tenant context is missing', async () => {
      const middleware = createRBACMiddleware({
        allowedRoles: [UserRole.CLIENT],
      });
      const request = createUnauthenticatedRequest();
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.statusCode).toBe(403);
      expect((reply.body as { error: { code: string } }).error.code).toBe(
        ErrorCode.FORBIDDEN
      );
    });

    it('should allow Admin access to DASHBOARD_ACCESS resources', async () => {
      const middleware = createRBACMiddleware(PERMISSIONS.DASHBOARD_ACCESS);
      const request = createAuthenticatedRequest(UserRole.ADMIN);
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.statusCode).toBe(0);
    });

    it('should deny Scanner Operator access to DASHBOARD_ACCESS resources', async () => {
      const middleware = createRBACMiddleware(PERMISSIONS.DASHBOARD_ACCESS);
      const request = createAuthenticatedRequest(UserRole.SCANNER);
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.statusCode).toBe(403);
    });

    it('should allow Scanner Operator access to CHECKIN_ACCESS resources', async () => {
      const middleware = createRBACMiddleware(PERMISSIONS.CHECKIN_ACCESS);
      const request = createAuthenticatedRequest(UserRole.SCANNER);
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.statusCode).toBe(0);
    });

    it('should allow WO access to SCANNER_ACCESS resources', async () => {
      const middleware = createRBACMiddleware(PERMISSIONS.SCANNER_ACCESS);
      const request = createAuthenticatedRequest(UserRole.WO);
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.statusCode).toBe(0);
    });

    it('should deny Client access to SCANNER_ACCESS resources', async () => {
      const middleware = createRBACMiddleware(PERMISSIONS.SCANNER_ACCESS);
      const request = createAuthenticatedRequest(UserRole.CLIENT);
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.statusCode).toBe(403);
    });

    it('should allow all roles access to ALL_ROLES resources', async () => {
      const middleware = createRBACMiddleware(PERMISSIONS.ALL_ROLES);

      for (const role of Object.values(UserRole)) {
        const request = createAuthenticatedRequest(role);
        const reply = createMockReply();

        await middleware(request, reply);

        expect(reply.statusCode).toBe(0);
      }
    });

    it('should only allow Admin access to ADMIN_ONLY resources', async () => {
      const middleware = createRBACMiddleware(PERMISSIONS.ADMIN_ONLY);

      // Admin should pass
      const adminRequest = createAuthenticatedRequest(UserRole.ADMIN);
      const adminReply = createMockReply();
      await middleware(adminRequest, adminReply);
      expect(adminReply.statusCode).toBe(0);

      // All other roles should be denied
      const nonAdminRoles = [UserRole.CLIENT, UserRole.WO, UserRole.SCANNER];
      for (const role of nonAdminRoles) {
        const request = createAuthenticatedRequest(role);
        const reply = createMockReply();
        await middleware(request, reply);
        expect(reply.statusCode).toBe(403);
      }
    });
  });

  describe('hasRole', () => {
    it('should return true when user has the specified role', () => {
      const request = createAuthenticatedRequest(UserRole.CLIENT);
      expect(hasRole(request, UserRole.CLIENT)).toBe(true);
    });

    it('should return false when user does not have the specified role', () => {
      const request = createAuthenticatedRequest(UserRole.CLIENT);
      expect(hasRole(request, UserRole.ADMIN)).toBe(false);
    });

    it('should return false when tenant context is missing', () => {
      const request = createUnauthenticatedRequest();
      expect(hasRole(request, UserRole.CLIENT)).toBe(false);
    });
  });

  describe('hasAnyRole', () => {
    it('should return true when user has one of the specified roles', () => {
      const request = createAuthenticatedRequest(UserRole.WO);
      expect(hasAnyRole(request, [UserRole.CLIENT, UserRole.WO])).toBe(true);
    });

    it('should return false when user has none of the specified roles', () => {
      const request = createAuthenticatedRequest(UserRole.SCANNER);
      expect(hasAnyRole(request, [UserRole.CLIENT, UserRole.WO])).toBe(false);
    });

    it('should return false when tenant context is missing', () => {
      const request = createUnauthenticatedRequest();
      expect(hasAnyRole(request, [UserRole.CLIENT])).toBe(false);
    });
  });

  describe('getUserRole', () => {
    it('should return the user role from tenant context', () => {
      const request = createAuthenticatedRequest(UserRole.WO);
      expect(getUserRole(request)).toBe(UserRole.WO);
    });

    it('should return null when tenant context is missing', () => {
      const request = createUnauthenticatedRequest();
      expect(getUserRole(request)).toBeNull();
    });
  });

  describe('PERMISSIONS predefined sets', () => {
    it('GUEST_MANAGEMENT should include Admin, Client, and WO', () => {
      expect(PERMISSIONS.GUEST_MANAGEMENT.allowedRoles).toContain(UserRole.ADMIN);
      expect(PERMISSIONS.GUEST_MANAGEMENT.allowedRoles).toContain(UserRole.CLIENT);
      expect(PERMISSIONS.GUEST_MANAGEMENT.allowedRoles).toContain(UserRole.WO);
      expect(PERMISSIONS.GUEST_MANAGEMENT.allowedRoles).not.toContain(UserRole.SCANNER);
    });

    it('GUEST_READ should include all roles (Scanner has read-only)', () => {
      expect(PERMISSIONS.GUEST_READ.allowedRoles).toContain(UserRole.ADMIN);
      expect(PERMISSIONS.GUEST_READ.allowedRoles).toContain(UserRole.CLIENT);
      expect(PERMISSIONS.GUEST_READ.allowedRoles).toContain(UserRole.WO);
      expect(PERMISSIONS.GUEST_READ.allowedRoles).toContain(UserRole.SCANNER);
    });

    it('CMS_ACCESS should not include Scanner Operator', () => {
      expect(PERMISSIONS.CMS_ACCESS.allowedRoles).not.toContain(UserRole.SCANNER);
    });

    it('EVENT_MANAGEMENT should only include Admin and Client', () => {
      expect(PERMISSIONS.EVENT_MANAGEMENT.allowedRoles).toEqual([
        UserRole.ADMIN,
        UserRole.CLIENT,
      ]);
    });
  });
});
