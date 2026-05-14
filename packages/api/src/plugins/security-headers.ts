import { FastifyInstance, FastifyPluginCallback, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

// --- Types ---

export interface SecurityHeadersOptions {
  /** Whether the server is running in production mode */
  isProduction?: boolean;
  /** Custom Content-Security-Policy directives */
  contentSecurityPolicy?: string;
  /** Custom Permissions-Policy directives */
  permissionsPolicy?: string;
}

// --- Constants ---

/**
 * Default Content-Security-Policy for an API server.
 * Restrictive by default: only allows self for default-src, blocks everything else.
 */
const DEFAULT_CSP = [
  "default-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

/**
 * Default Permissions-Policy: disable all browser features not needed by an API.
 */
const DEFAULT_PERMISSIONS_POLICY = [
  'camera=()',
  'microphone=()',
  'geolocation=()',
  'interest-cohort=()',
  'payment=()',
  'usb=()',
  'accelerometer=()',
  'gyroscope=()',
  'magnetometer=()',
].join(', ');

// --- Plugin ---

/**
 * Fastify plugin that adds security headers to all responses.
 *
 * - Adds Content-Security-Policy, X-Content-Type-Options, X-Frame-Options,
 *   Referrer-Policy, and Permissions-Policy headers.
 * - Removes X-Powered-By and Server headers to prevent information leakage.
 * - Disables stack traces in production error responses.
 *
 * Validates: Requirements 12.1, 12.2
 */
const securityHeadersPlugin: FastifyPluginCallback<SecurityHeadersOptions> = (
  fastify: FastifyInstance,
  opts: SecurityHeadersOptions,
  done
) => {
  const isProduction = opts.isProduction ?? process.env.NODE_ENV === 'production';
  const csp = opts.contentSecurityPolicy ?? DEFAULT_CSP;
  const permissionsPolicy = opts.permissionsPolicy ?? DEFAULT_PERMISSIONS_POLICY;

  // Add security headers to every response (Req 12.1)
  fastify.addHook('onSend', async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.header('Content-Security-Policy', csp);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('Permissions-Policy', permissionsPolicy);

    // Remove headers that expose server information (Req 12.2)
    reply.removeHeader('X-Powered-By');
    reply.removeHeader('Server');
  });

  // Disable stack traces in production error responses (Req 12.2)
  if (isProduction) {
    fastify.setErrorHandler(async (error, request, reply) => {
      const err = error as { statusCode?: number; code?: string; message?: string };
      const statusCode = err.statusCode ?? 500;

      request.log.error({
        err: error,
        statusCode,
        url: request.url,
        method: request.method,
      });

      reply.status(statusCode).send({
        success: false,
        error: {
          code: err.code ?? 'INTERNAL_ERROR',
          message: statusCode >= 500 ? 'An internal server error occurred.' : err.message,
        },
      });
    });
  }

  done();
};

/**
 * Security headers plugin wrapped with fastify-plugin to break encapsulation.
 * This ensures headers are applied at the root level regardless of where it's registered.
 *
 * Register with: fastify.register(securityHeaders, options)
 */
export const securityHeaders = fp(securityHeadersPlugin, {
  name: 'security-headers',
  fastify: '5.x',
});

export default securityHeaders;

// --- Exported constants for testing ---

export const SECURITY_HEADERS_CONSTANTS = {
  DEFAULT_CSP,
  DEFAULT_PERMISSIONS_POLICY,
  EXPECTED_HEADERS: [
    'Content-Security-Policy',
    'X-Content-Type-Options',
    'X-Frame-Options',
    'Referrer-Policy',
    'Permissions-Policy',
  ],
  REMOVED_HEADERS: ['X-Powered-By', 'Server'],
} as const;
