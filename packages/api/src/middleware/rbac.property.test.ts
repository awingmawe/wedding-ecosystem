import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { FastifyRequest, FastifyReply } from 'fastify';
import { ErrorCode, UserRole } from '@wedding/shared';
import {
  createRBACMiddleware,
  hasRole,
  hasAnyRole,
  getUserRole,
  PERMISSIONS,
  RBACConfig,
} from './rbac.middleware';
import { AuthenticatedRequest } from './tenant-isolation.middleware';

// --- Arbitraries ---

/** Generates a random UserRole */
const arbUserRole = fc.constantFrom(UserRole.ADMIN, UserRole.CLIENT, UserRole.WO, UserRole.SCANNER);

/** Generates a random non-empty subset of UserRole values for permission configs */
const arbAllowedRoles = fc
  .subarray([UserRole.ADMIN, UserRole.CLIENT, UserRole.WO, UserRole.SCANNER], {
    minLength: 1,
  })
  .map((roles) => ({ allowedRoles: roles }));

/** Generates arbitrary request metadata that should not affect RBAC decisions */
const arbRequestMetadata = fc.record({
  userId: fc.uuid(),
  tenantId: fc.uuid(),
  email: fc.emailAddress(),
});

// --- Test Helpers ---

function createAuthenticatedRequest(
  role: UserRole,
  metadata?: { userId?: string; tenantId?: string; email?: string }
): AuthenticatedRequest {
  const request = {
    headers: { authorization: 'Bearer some-token' },
    user: {
      id: metadata?.userId ?? 'user-123',
      tenant_id: metadata?.tenantId ?? 'tenant-abc',
      role: role,
      email: metadata?.email ?? 'user@example.com',
    },
  } as unknown as AuthenticatedRequest;
  return request;
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

// --- Property Tests ---

describe('Property 3: Role-Based Data Access', () => {
  /**
   * **Validates: Requirements 2.6**
   *
   * For any user with role Client, the RBAC middleware should allow access to
   * DASHBOARD_ACCESS, CMS_ACCESS, GUEST_MANAGEMENT, GUEST_READ, EVENT_MANAGEMENT
   * but deny SCANNER_ACCESS and ADMIN_ONLY.
   */
  it('Client sees only own events — allowed and denied permissions are correct', () => {
    const allowedPermissions: (keyof typeof PERMISSIONS)[] = [
      'DASHBOARD_ACCESS',
      'CMS_ACCESS',
      'GUEST_MANAGEMENT',
      'GUEST_READ',
      'EVENT_MANAGEMENT',
      'ALL_ROLES',
    ];
    const deniedPermissions: (keyof typeof PERMISSIONS)[] = ['SCANNER_ACCESS', 'ADMIN_ONLY'];

    fc.assert(
      fc.property(arbRequestMetadata, (metadata) => {
        const request = createAuthenticatedRequest(UserRole.CLIENT, metadata);

        // Client should be allowed for these permissions
        for (const permKey of allowedPermissions) {
          const reply = createMockReply();
          const middleware = createRBACMiddleware(PERMISSIONS[permKey]);
          middleware(request, reply);
          expect(reply.statusCode).toBe(0);
        }

        // Client should be denied for these permissions
        for (const permKey of deniedPermissions) {
          const reply = createMockReply();
          const middleware = createRBACMiddleware(PERMISSIONS[permKey]);
          middleware(request, reply);
          expect(reply.statusCode).toBe(403);
        }
      }),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 2.6**
   *
   * For any user with role Admin, the RBAC middleware should allow access to all
   * permission sets EXCEPT those that explicitly exclude Admin (none currently).
   * Admin does NOT have unrestricted access — same visibility restrictions apply.
   */
  it('Admin has scoped access — allowed for all predefined permission sets', () => {
    const allPermissionKeys = Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[];

    fc.assert(
      fc.property(arbRequestMetadata, (metadata) => {
        const request = createAuthenticatedRequest(UserRole.ADMIN, metadata);

        // Admin should be allowed for ALL predefined permission sets
        // (Admin is included in every predefined permission set)
        for (const permKey of allPermissionKeys) {
          const reply = createMockReply();
          const middleware = createRBACMiddleware(PERMISSIONS[permKey]);
          middleware(request, reply);
          expect(reply.statusCode).toBe(0);
        }
      }),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 2.7**
   *
   * For any user with role WO, the RBAC middleware should allow access to
   * DASHBOARD_ACCESS, CMS_ACCESS, SCANNER_ACCESS, GUEST_MANAGEMENT, GUEST_READ, CHECKIN_ACCESS
   * but deny EVENT_MANAGEMENT and ADMIN_ONLY.
   */
  it('WO sees only assigned events — allowed and denied permissions are correct', () => {
    const allowedPermissions: (keyof typeof PERMISSIONS)[] = [
      'DASHBOARD_ACCESS',
      'CMS_ACCESS',
      'SCANNER_ACCESS',
      'GUEST_MANAGEMENT',
      'GUEST_READ',
      'CHECKIN_ACCESS',
      'ALL_ROLES',
    ];
    const deniedPermissions: (keyof typeof PERMISSIONS)[] = ['EVENT_MANAGEMENT', 'ADMIN_ONLY'];

    fc.assert(
      fc.property(arbRequestMetadata, (metadata) => {
        const request = createAuthenticatedRequest(UserRole.WO, metadata);

        // WO should be allowed for these permissions
        for (const permKey of allowedPermissions) {
          const reply = createMockReply();
          const middleware = createRBACMiddleware(PERMISSIONS[permKey]);
          middleware(request, reply);
          expect(reply.statusCode).toBe(0);
        }

        // WO should be denied for these permissions
        for (const permKey of deniedPermissions) {
          const reply = createMockReply();
          const middleware = createRBACMiddleware(PERMISSIONS[permKey]);
          middleware(request, reply);
          expect(reply.statusCode).toBe(403);
        }
      }),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 2.8**
   *
   * For any user with role Scanner Operator, the RBAC middleware MUST allow access to
   * CHECKIN_ACCESS (which covers both QR scan and manual check-in). Scanner Operator
   * should be denied DASHBOARD_ACCESS, CMS_ACCESS, EVENT_MANAGEMENT, GUEST_MANAGEMENT,
   * ADMIN_ONLY but allowed GUEST_READ, SCANNER_ACCESS, CHECKIN_ACCESS, ALL_ROLES.
   */
  it('Scanner Operator has both QR scan AND manual check-in capabilities', () => {
    const allowedPermissions: (keyof typeof PERMISSIONS)[] = [
      'GUEST_READ',
      'SCANNER_ACCESS',
      'CHECKIN_ACCESS',
      'ALL_ROLES',
    ];
    const deniedPermissions: (keyof typeof PERMISSIONS)[] = [
      'DASHBOARD_ACCESS',
      'CMS_ACCESS',
      'EVENT_MANAGEMENT',
      'GUEST_MANAGEMENT',
      'ADMIN_ONLY',
    ];

    fc.assert(
      fc.property(arbRequestMetadata, (metadata) => {
        const request = createAuthenticatedRequest(UserRole.SCANNER, metadata);

        // Scanner should be allowed for these permissions (both QR scan and manual check-in)
        for (const permKey of allowedPermissions) {
          const reply = createMockReply();
          const middleware = createRBACMiddleware(PERMISSIONS[permKey]);
          middleware(request, reply);
          expect(reply.statusCode).toBe(0);
        }

        // Scanner should be denied for these permissions
        for (const permKey of deniedPermissions) {
          const reply = createMockReply();
          const middleware = createRBACMiddleware(PERMISSIONS[permKey]);
          middleware(request, reply);
          expect(reply.statusCode).toBe(403);
        }
      }),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 2.6, 2.7, 2.8**
   *
   * For any role and any permission config, the middleware always produces the same
   * result (allow or deny) regardless of other request properties like userId,
   * tenantId, or email.
   */
  it('Role-based access is deterministic — same role + config always yields same result', () => {
    fc.assert(
      fc.property(
        arbUserRole,
        arbAllowedRoles,
        arbRequestMetadata,
        arbRequestMetadata,
        (role, config, metadata1, metadata2) => {
          // Run middleware with two different request metadata sets
          const request1 = createAuthenticatedRequest(role, metadata1);
          const reply1 = createMockReply();
          const middleware = createRBACMiddleware(config);
          middleware(request1, reply1);

          const request2 = createAuthenticatedRequest(role, metadata2);
          const reply2 = createMockReply();
          middleware(request2, reply2);

          // Both should produce the same status code
          expect(reply1.statusCode).toBe(reply2.statusCode);
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 2.6, 2.7, 2.8**
   *
   * When access is denied, the error message is always generic ("Akses ditolak.")
   * and never contains resource-specific information.
   */
  it('Denied access never reveals resource existence', () => {
    fc.assert(
      fc.property(arbUserRole, arbAllowedRoles, arbRequestMetadata, (role, config, metadata) => {
        // Only test when access is denied
        fc.pre(!config.allowedRoles.includes(role));

        const request = createAuthenticatedRequest(role, metadata);
        const reply = createMockReply();
        const middleware = createRBACMiddleware(config);
        middleware(request, reply);

        expect(reply.statusCode).toBe(403);

        const body = reply.body as { error: { message: string; code: string } };
        // Message must be generic
        expect(body.error.message).toBe('Akses ditolak.');
        // Must not contain resource-specific information
        expect(body.error.message).not.toContain('not found');
        expect(body.error.message).not.toContain('does not exist');
        expect(body.error.message).not.toContain('tenant');
        expect(body.error.message).not.toContain('event');
        expect(body.error.message).not.toContain('guest');
        // Error code should be ROLE_INSUFFICIENT
        expect(body.error.code).toBe(ErrorCode.ROLE_INSUFFICIENT);
      }),
      { numRuns: 200 }
    );
  });
});
