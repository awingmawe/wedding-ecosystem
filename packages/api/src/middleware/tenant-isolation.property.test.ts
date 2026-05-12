import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { FastifyRequest, FastifyReply } from 'fastify';
import { ErrorCode } from '@wedding/shared';
import {
  createTenantIsolationMiddleware,
  tenantFilter,
  validateTenantOwnership,
  AuthenticatedRequest,
} from './tenant-isolation.middleware';
import { AuthService, TokenPayload, AuthServiceError } from '../services/auth.service';

// --- Arbitraries ---

/** Generates a non-empty tenant_id string (UUID-like or alphanumeric) */
const arbTenantId = fc.string({ minLength: 1, maxLength: 64 }).filter((s) => s.trim().length > 0);

/** Generates a valid TokenPayload with a given tenant_id */
function arbTokenPayload(tenantId: string): fc.Arbitrary<TokenPayload> {
  return fc.record({
    sub: fc.uuid(),
    tenant_id: fc.constant(tenantId),
    role: fc.constantFrom('admin', 'client', 'wo', 'scanner'),
    email: fc.emailAddress(),
  });
}

// --- Test Helpers ---

function createMockRequest(authHeader?: string): FastifyRequest {
  return {
    headers: {
      authorization: authHeader,
    },
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

function createMockAuthService(verifyResult: TokenPayload | AuthServiceError): AuthService {
  return {
    verifyAccessToken: () => verifyResult,
  } as unknown as AuthService;
}

// --- Property Tests ---

describe('Property 1: Tenant Data Isolation', () => {
  /**
   * **Validates: Requirements 1.2**
   *
   * For any tenant T and any database query Q executed in the context of tenant T,
   * all returned results SHALL only contain records where tenant_id equals T.
   */
  it('tenantFilter always returns a filter scoped to the authenticated tenant_id', () => {
    fc.assert(
      fc.property(arbTenantId, (tenantId) => {
        const request = createMockRequest('Bearer token') as AuthenticatedRequest;
        request.tenantContext = {
          user_id: 'user-1',
          tenant_id: tenantId,
          role: 'client',
          email: 'test@test.com',
        };

        const filter = tenantFilter(request);

        expect(filter).toEqual({ tenant_id: tenantId });
        expect(filter.tenant_id).toBe(tenantId);
      }),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 1.2**
   *
   * For any set of resources with various tenant_ids, only resources matching
   * the authenticated tenant should pass validateTenantOwnership.
   */
  it('validateTenantOwnership only returns true for resources matching the authenticated tenant', () => {
    fc.assert(
      fc.property(
        arbTenantId,
        fc.array(arbTenantId, { minLength: 1, maxLength: 20 }),
        (authenticatedTenantId, resourceTenantIds) => {
          const request = createMockRequest('Bearer token') as AuthenticatedRequest;
          request.tenantContext = {
            user_id: 'user-1',
            tenant_id: authenticatedTenantId,
            role: 'client',
            email: 'test@test.com',
          };

          for (const resourceTenantId of resourceTenantIds) {
            const result = validateTenantOwnership(request, resourceTenantId);
            if (resourceTenantId === authenticatedTenantId) {
              expect(result).toBe(true);
            } else {
              expect(result).toBe(false);
            }
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 1.2**
   *
   * The middleware attaches the correct tenant context from the JWT payload,
   * ensuring downstream queries are scoped to the correct tenant.
   */
  it('middleware attaches correct tenant context for any valid tenant_id', () => {
    fc.assert(
      fc.property(arbTenantId, (tenantId) => {
        const payload: TokenPayload = {
          sub: 'user-123',
          tenant_id: tenantId,
          role: 'client',
          email: 'user@example.com',
        };
        const authService = createMockAuthService(payload);
        const middleware = createTenantIsolationMiddleware(authService);
        const request = createMockRequest('Bearer valid-token');
        const reply = createMockReply();

        middleware(request, reply);

        const authenticatedRequest = request as AuthenticatedRequest;
        expect(authenticatedRequest.tenantContext.tenant_id).toBe(tenantId);
        // Reply should not have been called (no error)
        expect(reply.statusCode).toBe(0);
      }),
      { numRuns: 200 }
    );
  });
});

describe('Property 19: Cross-Tenant Access Rejection', () => {
  /**
   * **Validates: Requirements 1.3**
   *
   * For any two distinct tenant_ids (tenantA ≠ tenantB), validateTenantOwnership
   * with tenantA's context and tenantB's resource always returns false.
   */
  it('cross-tenant access is always rejected for distinct tenants', () => {
    fc.assert(
      fc.property(
        arbTenantId,
        arbTenantId,
        (tenantA, tenantB) => {
          fc.pre(tenantA !== tenantB);

          const request = createMockRequest('Bearer token') as AuthenticatedRequest;
          request.tenantContext = {
            user_id: 'user-1',
            tenant_id: tenantA,
            role: 'client',
            email: 'test@test.com',
          };

          const result = validateTenantOwnership(request, tenantB);
          expect(result).toBe(false);
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 1.3**
   *
   * The middleware returns 403 when tenant_id is missing (empty string),
   * without revealing resource existence.
   */
  it('middleware returns 403 when token has empty tenant_id', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.constantFrom('admin', 'client', 'wo', 'scanner'),
        fc.emailAddress(),
        (userId, role, email) => {
          const payload: TokenPayload = {
            sub: userId,
            tenant_id: '', // empty tenant_id
            role,
            email,
          };
          const authService = createMockAuthService(payload);
          const middleware = createTenantIsolationMiddleware(authService);
          const request = createMockRequest('Bearer valid-token');
          const reply = createMockReply();

          middleware(request, reply);

          expect(reply.statusCode).toBe(403);
          expect((reply.body as { error: { code: string } }).error.code).toBe(
            ErrorCode.INVALID_TENANT
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 1.3**
   *
   * validateTenantOwnership returns false when tenant context is not available,
   * ensuring no access is granted without proper authentication.
   */
  it('validateTenantOwnership rejects access when tenant context is missing', () => {
    fc.assert(
      fc.property(arbTenantId, (resourceTenantId) => {
        const request = createMockRequest('Bearer token');
        // No tenantContext attached — simulates unauthenticated state

        const result = validateTenantOwnership(request, resourceTenantId);
        expect(result).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 1.3**
   *
   * The middleware rejects requests without valid tenant context:
   * missing Authorization header, non-Bearer prefix, or invalid token.
   */
  it('middleware rejects all requests without valid authentication', () => {
    const invalidHeaders = [
      undefined,
      '',
      'Basic abc123',
      'Token xyz',
      'bearer lowercase',
    ];

    for (const header of invalidHeaders) {
      const authService = createMockAuthService({
        sub: 'user-1',
        tenant_id: 'tenant-1',
        role: 'client',
        email: 'test@test.com',
      });
      const middleware = createTenantIsolationMiddleware(authService);
      const request = createMockRequest(header);
      const reply = createMockReply();

      middleware(request, reply);

      expect(reply.statusCode).toBe(401);
    }
  });
});
