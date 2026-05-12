import { FastifyRequest, FastifyReply } from 'fastify';
import { ErrorCode } from '@wedding/shared';
import { AuthService, TokenPayload, isAuthError } from '../services/auth.service';

// --- Types ---

/** Authenticated request context attached by tenant isolation middleware */
export interface TenantContext {
  user_id: string;
  tenant_id: string;
  role: string;
  email: string;
}

/** Extended Fastify request with tenant context */
export interface AuthenticatedRequest extends FastifyRequest {
  tenantContext: TenantContext;
}

// --- Middleware Factory ---

/**
 * Creates a Fastify preHandler hook that:
 * 1. Extracts and verifies the JWT access token from the Authorization header
 * 2. Extracts tenant_id from the token payload
 * 3. Rejects requests without a valid tenant_id (Req 1.5)
 * 4. Attaches tenant context to the request for downstream use (Req 1.2)
 */
export function createTenantIsolationMiddleware(authService: AuthService) {
  return async function tenantIsolationHook(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    // Extract Bearer token from Authorization header
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      reply.status(401).send({
        success: false,
        error: {
          code: ErrorCode.TOKEN_EXPIRED,
          message: 'Token autentikasi diperlukan.',
        },
      });
      return;
    }

    const token = authHeader.slice(7); // Remove 'Bearer ' prefix

    // Verify the access token
    const result = authService.verifyAccessToken(token);

    if (isAuthError(result)) {
      reply.status(401).send({
        success: false,
        error: {
          code: result.code,
          message: result.message,
        },
      });
      return;
    }

    const payload = result as TokenPayload;

    // Validate tenant_id exists in the token (Req 1.5)
    if (!payload.tenant_id) {
      reply.status(403).send({
        success: false,
        error: {
          code: ErrorCode.INVALID_TENANT,
          message: 'Akses ditolak. Tenant tidak valid.',
        },
      });
      return;
    }

    // Attach tenant context to request
    (request as AuthenticatedRequest).tenantContext = {
      user_id: payload.sub,
      tenant_id: payload.tenant_id,
      role: payload.role,
      email: payload.email,
    };
  };
}

// --- Query Filter Helper ---

/**
 * Creates a tenant-scoped filter object for database queries.
 * Ensures all queries are automatically filtered by tenant_id (Req 1.2).
 */
export function tenantFilter(request: FastifyRequest): { tenant_id: string } {
  const ctx = (request as AuthenticatedRequest).tenantContext;
  if (!ctx || !ctx.tenant_id) {
    throw new Error('Tenant context not available. Ensure tenant isolation middleware is applied.');
  }
  return { tenant_id: ctx.tenant_id };
}

/**
 * Validates that a resource belongs to the requesting tenant.
 * Returns false if the resource's tenant_id doesn't match the request's tenant_id.
 * Used to enforce cross-tenant access rejection (Req 1.3).
 * 
 * IMPORTANT: When this returns false, respond with 403 Forbidden
 * without revealing whether the resource exists.
 */
export function validateTenantOwnership(
  request: FastifyRequest,
  resourceTenantId: string
): boolean {
  const ctx = (request as AuthenticatedRequest).tenantContext;
  if (!ctx || !ctx.tenant_id) {
    return false;
  }
  return ctx.tenant_id === resourceTenantId;
}
