import { describe, it, expect, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { FastifyRequest, FastifyReply } from 'fastify';
import { ErrorCode } from '@wedding/shared';
import {
  createAuthMiddleware,
  createTenantIsolationMiddleware,
  tenantFilter,
  validateTenantOwnership,
  AuthenticatedRequest,
} from './tenant-isolation.middleware';

// --- Test Helpers ---

const TEST_JWT_SECRET = 'test-secret-key-for-unit-tests';

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

function createValidToken(payload: object): string {
  return jwt.sign(payload, TEST_JWT_SECRET, { expiresIn: '15m' });
}

function createExpiredToken(payload: object): string {
  return jwt.sign(payload, TEST_JWT_SECRET, { expiresIn: '-1s' });
}

// --- Tests ---

describe('Tenant Isolation Middleware', () => {
  const validPayload = {
    sub: 'user-123',
    tenant_id: 'tenant-abc',
    role: 'client',
    email: 'user@example.com',
  };

  describe('createAuthMiddleware', () => {
    it('should reject requests without Authorization header', async () => {
      const middleware = createAuthMiddleware(TEST_JWT_SECRET);
      const request = createMockRequest(undefined);
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.statusCode).toBe(401);
      expect((reply.body as { error: { code: string } }).error.code).toBe('AUTH_2002');
    });

    it('should reject requests with non-Bearer Authorization header', async () => {
      const middleware = createAuthMiddleware(TEST_JWT_SECRET);
      const request = createMockRequest('Basic abc123');
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.statusCode).toBe(401);
      expect((reply.body as { error: { code: string } }).error.code).toBe('AUTH_2002');
    });

    it('should reject requests with expired token', async () => {
      const middleware = createAuthMiddleware(TEST_JWT_SECRET);
      const token = createExpiredToken(validPayload);
      const request = createMockRequest(`Bearer ${token}`);
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.statusCode).toBe(401);
      expect((reply.body as { error: { code: string } }).error.code).toBe('AUTH_2002');
    });

    it('should reject requests with invalid token signature', async () => {
      const middleware = createAuthMiddleware(TEST_JWT_SECRET);
      const token = jwt.sign(validPayload, 'wrong-secret');
      const request = createMockRequest(`Bearer ${token}`);
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.statusCode).toBe(401);
      expect((reply.body as { error: { code: string } }).error.code).toBe('AUTH_2003');
    });

    it('should reject requests with malformed token', async () => {
      const middleware = createAuthMiddleware(TEST_JWT_SECRET);
      const request = createMockRequest('Bearer not-a-valid-jwt');
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.statusCode).toBe(401);
      expect((reply.body as { error: { code: string } }).error.code).toBe('AUTH_2003');
    });

    it('should reject requests where token has no tenant_id', async () => {
      const middleware = createAuthMiddleware(TEST_JWT_SECRET);
      const token = createValidToken({
        sub: 'user-123',
        tenant_id: '',
        role: 'client',
        email: 'a@b.com',
      });
      const request = createMockRequest(`Bearer ${token}`);
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.statusCode).toBe(403);
      expect((reply.body as { error: { code: string } }).error.code).toBe(ErrorCode.INVALID_TENANT);
    });

    it('should attach user context for valid token with tenant_id', async () => {
      const middleware = createAuthMiddleware(TEST_JWT_SECRET);
      const token = createValidToken(validPayload);
      const request = createMockRequest(`Bearer ${token}`);
      const reply = createMockReply();

      await middleware(request, reply);

      const authenticatedRequest = request as AuthenticatedRequest;
      expect(authenticatedRequest.user).toEqual({
        id: 'user-123',
        tenant_id: 'tenant-abc',
        role: 'client',
        email: 'user@example.com',
      });
      // Reply should not have been called (no error)
      expect(reply.statusCode).toBe(0);
    });

    it('should correctly extract token from Bearer prefix', async () => {
      const middleware = createAuthMiddleware(TEST_JWT_SECRET);
      const token = createValidToken(validPayload);
      const request = createMockRequest(`Bearer ${token}`);
      const reply = createMockReply();

      await middleware(request, reply);

      // Verify user was attached (proves token was correctly extracted and verified)
      expect((request as any).user).toBeDefined();
      expect((request as any).user.id).toBe('user-123');
    });
  });

  describe('createTenantIsolationMiddleware (legacy alias)', () => {
    it('should work as alias for createAuthMiddleware', async () => {
      const middleware = createTenantIsolationMiddleware({ jwtSecret: TEST_JWT_SECRET });
      const token = createValidToken(validPayload);
      const request = createMockRequest(`Bearer ${token}`);
      const reply = createMockReply();

      await middleware(request, reply);

      expect((request as any).user.tenant_id).toBe('tenant-abc');
    });
  });

  describe('tenantFilter', () => {
    it('should return tenant_id filter from authenticated request', () => {
      const request = createMockRequest('Bearer token') as any;
      request.user = {
        id: 'user-1',
        tenant_id: 'tenant-xyz',
        role: 'client',
        email: 'test@test.com',
      };

      const filter = tenantFilter(request);

      expect(filter).toEqual({ tenant_id: 'tenant-xyz' });
    });

    it('should throw error when user context is not available', () => {
      const request = createMockRequest('Bearer token');

      expect(() => tenantFilter(request)).toThrow('Tenant context not available');
    });
  });

  describe('validateTenantOwnership', () => {
    it('should return true when resource belongs to same tenant', () => {
      const request = createMockRequest('Bearer token') as any;
      request.user = {
        id: 'user-1',
        tenant_id: 'tenant-abc',
        role: 'client',
        email: 'test@test.com',
      };

      expect(validateTenantOwnership(request, 'tenant-abc')).toBe(true);
    });

    it('should return false when resource belongs to different tenant', () => {
      const request = createMockRequest('Bearer token') as any;
      request.user = {
        id: 'user-1',
        tenant_id: 'tenant-abc',
        role: 'client',
        email: 'test@test.com',
      };

      expect(validateTenantOwnership(request, 'tenant-xyz')).toBe(false);
    });

    it('should return false when user context is not available', () => {
      const request = createMockRequest('Bearer token');

      expect(validateTenantOwnership(request, 'tenant-abc')).toBe(false);
    });
  });
});
