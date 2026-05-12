import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FastifyRequest, FastifyReply } from 'fastify';
import { ErrorCode } from '@wedding/shared';
import {
  createTenantIsolationMiddleware,
  tenantFilter,
  validateTenantOwnership,
  AuthenticatedRequest,
} from './tenant-isolation.middleware';
import { AuthService, TokenPayload, AuthServiceError } from '../services/auth.service';

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

function createMockAuthService(
  verifyResult: TokenPayload | AuthServiceError
): AuthService {
  return {
    verifyAccessToken: vi.fn().mockReturnValue(verifyResult),
  } as unknown as AuthService;
}

// --- Tests ---

describe('Tenant Isolation Middleware', () => {
  const validPayload: TokenPayload = {
    sub: 'user-123',
    tenant_id: 'tenant-abc',
    role: 'client',
    email: 'user@example.com',
  };

  describe('createTenantIsolationMiddleware', () => {
    it('should reject requests without Authorization header', async () => {
      const authService = createMockAuthService(validPayload);
      const middleware = createTenantIsolationMiddleware(authService);
      const request = createMockRequest(undefined);
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.statusCode).toBe(401);
      expect((reply.body as { error: { code: string } }).error.code).toBe(
        ErrorCode.TOKEN_EXPIRED
      );
    });

    it('should reject requests with non-Bearer Authorization header', async () => {
      const authService = createMockAuthService(validPayload);
      const middleware = createTenantIsolationMiddleware(authService);
      const request = createMockRequest('Basic abc123');
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.statusCode).toBe(401);
    });

    it('should reject requests with empty Bearer token', async () => {
      const authService = createMockAuthService(validPayload);
      const middleware = createTenantIsolationMiddleware(authService);
      const request = createMockRequest('Bearer ');
      const reply = createMockReply();

      // Empty token will fail verification
      const errorResult: AuthServiceError = {
        code: ErrorCode.TOKEN_EXPIRED,
        message: 'Token tidak valid.',
      };
      const authServiceWithError = createMockAuthService(errorResult);
      const middlewareWithError = createTenantIsolationMiddleware(authServiceWithError);

      await middlewareWithError(request, reply);

      expect(reply.statusCode).toBe(401);
    });

    it('should reject requests with invalid/expired token', async () => {
      const errorResult: AuthServiceError = {
        code: ErrorCode.TOKEN_EXPIRED,
        message: 'Access token telah kedaluwarsa.',
      };
      const authService = createMockAuthService(errorResult);
      const middleware = createTenantIsolationMiddleware(authService);
      const request = createMockRequest('Bearer expired-token');
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.statusCode).toBe(401);
      expect((reply.body as { error: { code: string } }).error.code).toBe(
        ErrorCode.TOKEN_EXPIRED
      );
    });

    it('should reject requests where token has no tenant_id', async () => {
      const payloadWithoutTenant: TokenPayload = {
        sub: 'user-123',
        tenant_id: '', // empty tenant_id
        role: 'client',
        email: 'user@example.com',
      };
      const authService = createMockAuthService(payloadWithoutTenant);
      const middleware = createTenantIsolationMiddleware(authService);
      const request = createMockRequest('Bearer valid-token');
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.statusCode).toBe(403);
      expect((reply.body as { error: { code: string } }).error.code).toBe(
        ErrorCode.INVALID_TENANT
      );
    });

    it('should attach tenant context for valid token with tenant_id', async () => {
      const authService = createMockAuthService(validPayload);
      const middleware = createTenantIsolationMiddleware(authService);
      const request = createMockRequest('Bearer valid-token');
      const reply = createMockReply();

      await middleware(request, reply);

      const authenticatedRequest = request as AuthenticatedRequest;
      expect(authenticatedRequest.tenantContext).toEqual({
        user_id: 'user-123',
        tenant_id: 'tenant-abc',
        role: 'client',
        email: 'user@example.com',
      });
      // Reply should not have been called (no error)
      expect(reply.statusCode).toBe(0);
    });

    it('should extract token correctly from Bearer prefix', async () => {
      const authService = createMockAuthService(validPayload);
      const middleware = createTenantIsolationMiddleware(authService);
      const request = createMockRequest('Bearer my-jwt-token-here');
      const reply = createMockReply();

      await middleware(request, reply);

      expect(authService.verifyAccessToken).toHaveBeenCalledWith('my-jwt-token-here');
    });
  });

  describe('tenantFilter', () => {
    it('should return tenant_id filter from authenticated request', () => {
      const request = createMockRequest('Bearer token') as AuthenticatedRequest;
      request.tenantContext = {
        user_id: 'user-1',
        tenant_id: 'tenant-xyz',
        role: 'client',
        email: 'test@test.com',
      };

      const filter = tenantFilter(request);

      expect(filter).toEqual({ tenant_id: 'tenant-xyz' });
    });

    it('should throw error when tenant context is not available', () => {
      const request = createMockRequest('Bearer token');

      expect(() => tenantFilter(request)).toThrow(
        'Tenant context not available'
      );
    });
  });

  describe('validateTenantOwnership', () => {
    it('should return true when resource belongs to same tenant', () => {
      const request = createMockRequest('Bearer token') as AuthenticatedRequest;
      request.tenantContext = {
        user_id: 'user-1',
        tenant_id: 'tenant-abc',
        role: 'client',
        email: 'test@test.com',
      };

      expect(validateTenantOwnership(request, 'tenant-abc')).toBe(true);
    });

    it('should return false when resource belongs to different tenant', () => {
      const request = createMockRequest('Bearer token') as AuthenticatedRequest;
      request.tenantContext = {
        user_id: 'user-1',
        tenant_id: 'tenant-abc',
        role: 'client',
        email: 'test@test.com',
      };

      expect(validateTenantOwnership(request, 'tenant-xyz')).toBe(false);
    });

    it('should return false when tenant context is not available', () => {
      const request = createMockRequest('Bearer token');

      expect(validateTenantOwnership(request, 'tenant-abc')).toBe(false);
    });
  });
});
