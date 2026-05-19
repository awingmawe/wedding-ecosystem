import { FastifyInstance, FastifyPluginCallback, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { PrismaClient } from '@wedding/db';

// --- Types ---

/** Sensitive operations that should be audit logged */
export type AuditAction =
  | 'login'
  | 'logout'
  | 'data_export'
  | 'bulk_operation'
  | 'tenant_config_change'
  | string;

export interface AuditEntry {
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Authenticated user ID (null if unauthenticated) */
  user_id: string | null;
  /** Tenant ID from authenticated user context */
  tenant_id: string | null;
  /** The sensitive action performed */
  action: AuditAction;
  /** Correlation ID from request-validation plugin */
  request_id: string;
  /** Additional metadata about the operation */
  metadata?: Record<string, unknown>;
}

export interface AuditLoggerOptions {
  /** Route patterns that are automatically audit-logged via hooks.
   *  Each entry maps a method + URL prefix to an action name.
   */
  autoLogRoutes?: AutoLogRoute[];
  /** Optional PrismaClient instance for database-backed audit logging */
  prisma?: PrismaClient;
}

export interface AutoLogRoute {
  /** HTTP method to match (e.g., 'POST', 'DELETE') */
  method: string;
  /** URL prefix to match (e.g., '/auth/login') */
  prefix: string;
  /** Action name to record in the audit entry */
  action: AuditAction;
}

// --- Default Configuration ---

export const DEFAULT_AUTO_LOG_ROUTES: AutoLogRoute[] = [
  { method: 'POST', prefix: '/auth/login', action: 'login' },
  { method: 'POST', prefix: '/auth/logout', action: 'logout' },
  { method: 'GET', prefix: '/export', action: 'data_export' },
  { method: 'POST', prefix: '/export', action: 'data_export' },
  { method: 'POST', prefix: '/bulk', action: 'bulk_operation' },
  { method: 'PUT', prefix: '/bulk', action: 'bulk_operation' },
  { method: 'DELETE', prefix: '/bulk', action: 'bulk_operation' },
  { method: 'PUT', prefix: '/tenant/config', action: 'tenant_config_change' },
  { method: 'PATCH', prefix: '/tenant/config', action: 'tenant_config_change' },
];

// --- Fastify Declaration Merging ---

declare module 'fastify' {
  interface FastifyInstance {
    auditLog: (
      request: FastifyRequest,
      action: AuditAction,
      metadata?: Record<string, unknown>
    ) => void;
  }
}

// --- Helper Functions ---

/**
 * Extracts user info from the request object.
 * Returns user_id and tenant_id if the user is authenticated.
 */
function extractUserInfo(request: FastifyRequest): {
  user_id: string | null;
  tenant_id: string | null;
} {
  const user = (request as any).user;
  return {
    user_id: user?.id ?? user?.user_id ?? null,
    tenant_id: user?.tenant_id ?? null,
  };
}

/**
 * Builds a structured audit entry from request context.
 */
export function buildAuditEntry(
  request: FastifyRequest,
  action: AuditAction,
  metadata?: Record<string, unknown>
): AuditEntry {
  const { user_id, tenant_id } = extractUserInfo(request);

  return {
    timestamp: new Date().toISOString(),
    user_id,
    tenant_id,
    action,
    request_id: request.requestId ?? 'unknown',
    ...(metadata && Object.keys(metadata).length > 0 ? { metadata } : {}),
  };
}

/**
 * Checks if a request matches any auto-log route pattern.
 * Returns the matching action or null.
 */
export function matchAutoLogRoute(
  method: string,
  url: string,
  routes: AutoLogRoute[]
): AuditAction | null {
  for (const route of routes) {
    if (route.method === method.toUpperCase() && url.startsWith(route.prefix)) {
      return route.action;
    }
  }
  return null;
}

// --- Plugin Implementation ---

/**
 * Fastify plugin that provides audit logging for sensitive operations.
 *
 * Provides:
 * 1. A `fastify.auditLog(request, action, metadata?)` decorator for manual audit logging
 * 2. Automatic hook-based audit logging for configured route patterns (login, logout, etc.)
 *
 * Audit entries are structured JSON logged via Fastify's built-in logger at 'info' level,
 * and written to the database asynchronously if a PrismaClient instance is provided.
 *
 * Validates: Requirements 12.10
 */
const auditLoggerPlugin: FastifyPluginCallback<AuditLoggerOptions> = (
  fastify: FastifyInstance,
  opts: AuditLoggerOptions,
  done
) => {
  const autoLogRoutes = opts.autoLogRoutes ?? DEFAULT_AUTO_LOG_ROUTES;
  const prisma = opts.prisma;

  // Decorator: allows route handlers to manually log audit entries
  fastify.decorate(
    'auditLog',
    function (request: FastifyRequest, action: AuditAction, metadata?: Record<string, unknown>) {
      const entry = buildAuditEntry(request, action, metadata);
      request.log.info({ audit: entry }, `audit: ${action}`);

      if (prisma) {
        prisma.auditLog.create({
          data: {
            timestamp: new Date(entry.timestamp),
            user_id: entry.user_id,
            tenant_id: entry.tenant_id,
            action: entry.action,
            request_id: entry.request_id,
            metadata: entry.metadata ? (entry.metadata as any) : undefined,
          },
        }).catch((err: any) => {
          request.log.error({ err }, 'Gagal menyimpan log audit ke database');
        });
      }
    }
  );

  // Hook: automatically log audit entries for matching routes after response is sent
  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const action = matchAutoLogRoute(request.method, request.url, autoLogRoutes);

    if (!action) {
      return;
    }

    // Only log successful operations (2xx/3xx status codes)
    const statusCode = reply.statusCode;
    if (statusCode >= 200 && statusCode < 400) {
      fastify.auditLog(request, action);
    }
  });

  done();
};

// --- Exported Plugin ---

/**
 * Audit logger plugin wrapped with fastify-plugin to break encapsulation.
 * This ensures the decorator and hooks are available at the root level.
 *
 * Register with: fastify.register(auditLogger, options)
 */
export const auditLogger = fp(auditLoggerPlugin, {
  name: 'audit-logger',
  fastify: '5.x',
});

export default auditLogger;
