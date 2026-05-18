import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { ErrorCode } from '@wedding/shared';

// --- Types ---

/** Authenticated request context attached by tenant isolation middleware */
export interface TenantContext {
  id: string;
  tenant_id: string;
  role: string;
  email: string;
}

/** Extended Fastify request with tenant context (via request.user) */
export interface AuthenticatedRequest extends FastifyRequest {
  user: TenantContext;
}

// --- Middleware Factory ---

/**
 * Creates a Fastify onRequest hook that:
 * 1. Extracts and verifies the JWT access token from the Authorization header
 * 2. Extracts tenant_id from the token payload
 * 3. Rejects requests without a valid tenant_id (Req 1.5)
 * 4. Attaches tenant context to request.user for downstream use (Req 1.2)
 *
 * This is the SINGLE auth seam for the entire API.
 * All protected routes use this middleware — no other auth implementation exists.
 */
export function createAuthMiddleware(jwtSecret: string) {
  return async function authHook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    // Extract Bearer token from Authorization header
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      reply.status(401).send({
        success: false,
        error: {
          code: 'AUTH_2002',
          message: 'Token autentikasi diperlukan.',
        },
      });
      return;
    }

    const token = authHeader.slice(7); // Remove 'Bearer ' prefix

    try {
      const decoded = jwt.verify(token, jwtSecret) as {
        sub: string;
        tenant_id: string;
        role: string;
        email: string;
      };

      // Validate tenant_id exists in the token (Req 1.5)
      if (!decoded.tenant_id) {
        reply.status(403).send({
          success: false,
          error: {
            code: ErrorCode.INVALID_TENANT,
            message: 'Akses ditolak. Tenant tidak valid.',
          },
        });
        return;
      }

      // Attach tenant context to request.user
      (request as any).user = {
        id: decoded.sub,
        tenant_id: decoded.tenant_id,
        role: decoded.role,
        email: decoded.email,
      };
    } catch (err: any) {
      if (err.name === 'TokenExpiredError') {
        reply.status(401).send({
          success: false,
          error: { code: 'AUTH_2002', message: 'Access token telah kedaluwarsa.' },
        });
      } else {
        reply.status(401).send({
          success: false,
          error: { code: 'AUTH_2003', message: 'Token tidak valid.' },
        });
      }
      return;
    }
  };
}

/**
 * Legacy alias — kept for backward compatibility with existing middleware exports.
 * Delegates to createAuthMiddleware internally.
 */
export function createTenantIsolationMiddleware(config: { jwtSecret: string }) {
  return createAuthMiddleware(config.jwtSecret);
}

// --- Query Filter Helper ---

/**
 * Creates a tenant-scoped filter object for database queries.
 * Ensures all queries are automatically filtered by tenant_id (Req 1.2).
 */
export function tenantFilter(request: FastifyRequest): { tenant_id: string } {
  const user = (request as any).user;
  if (!user || !user.tenant_id) {
    throw new Error('Tenant context not available. Ensure auth middleware is applied.');
  }
  return { tenant_id: user.tenant_id };
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
  const user = (request as any).user;
  if (!user || !user.tenant_id) {
    return false;
  }
  return user.tenant_id === resourceTenantId;
}
