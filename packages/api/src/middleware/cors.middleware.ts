import { FastifyRequest, FastifyReply } from 'fastify';
import type { AppName } from '@wedding/shared';

// --- Types ---

export interface CORSConfig {
  /** Allowed origins per application */
  origins: Record<AppName, string[]>;
  /** Additional allowed origins (e.g., for development) */
  additionalOrigins?: string[];
  /** Allowed HTTP methods */
  methods?: string[];
  /** Allowed headers */
  allowedHeaders?: string[];
  /** Exposed headers */
  exposedHeaders?: string[];
  /** Whether to allow credentials */
  credentials?: boolean;
  /** Max age for preflight cache in seconds */
  maxAge?: number;
}

// --- Default Configuration ---

const DEFAULT_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const DEFAULT_ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Requested-With',
  'Accept',
  'Origin',
  'X-Tenant-ID',
];
const DEFAULT_EXPOSED_HEADERS = [
  'X-RateLimit-Limit',
  'X-RateLimit-Remaining',
  'Retry-After',
];
const DEFAULT_MAX_AGE = 86400; // 24 hours

// --- CORS Middleware ---

/**
 * Creates a Fastify hook that enforces CORS policy per application.
 * Only allows requests from registered origins for each app (Dashboard, Invitation, Scanner).
 *
 * Validates: Requirement 13.7
 */
export function createCORSMiddleware(config: CORSConfig) {
  const methods = config.methods ?? DEFAULT_METHODS;
  const allowedHeaders = config.allowedHeaders ?? DEFAULT_ALLOWED_HEADERS;
  const exposedHeaders = config.exposedHeaders ?? DEFAULT_EXPOSED_HEADERS;
  const credentials = config.credentials ?? true;
  const maxAge = config.maxAge ?? DEFAULT_MAX_AGE;

  // Build a set of all allowed origins for fast lookup
  const allAllowedOrigins = new Set<string>();

  for (const appOrigins of Object.values(config.origins)) {
    for (const origin of appOrigins) {
      allAllowedOrigins.add(origin);
    }
  }

  if (config.additionalOrigins) {
    for (const origin of config.additionalOrigins) {
      allAllowedOrigins.add(origin);
    }
  }

  return async function corsHook(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const origin = request.headers.origin;

    // Handle preflight OPTIONS requests
    if (request.method === 'OPTIONS') {
      if (origin && allAllowedOrigins.has(origin)) {
        reply.header('Access-Control-Allow-Origin', origin);
        reply.header('Access-Control-Allow-Methods', methods.join(', '));
        reply.header('Access-Control-Allow-Headers', allowedHeaders.join(', '));
        reply.header('Access-Control-Expose-Headers', exposedHeaders.join(', '));
        reply.header('Access-Control-Max-Age', maxAge.toString());
        if (credentials) {
          reply.header('Access-Control-Allow-Credentials', 'true');
        }
        reply.header('Vary', 'Origin');
      }
      reply.status(204).send();
      return;
    }

    // For non-preflight requests, set CORS headers if origin is allowed
    if (origin && allAllowedOrigins.has(origin)) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Access-Control-Expose-Headers', exposedHeaders.join(', '));
      if (credentials) {
        reply.header('Access-Control-Allow-Credentials', 'true');
      }
      reply.header('Vary', 'Origin');
    }
    // If origin is not in the allowed list, no CORS headers are set
    // The browser will block the response on the client side
  };
}

/**
 * Check if a given origin is allowed for a specific app.
 * Useful for programmatic checks outside of middleware.
 */
export function isOriginAllowed(
  config: CORSConfig,
  origin: string,
  app?: AppName
): boolean {
  if (app) {
    return config.origins[app]?.includes(origin) ?? false;
  }

  // Check all apps
  for (const appOrigins of Object.values(config.origins)) {
    if (appOrigins.includes(origin)) return true;
  }

  return config.additionalOrigins?.includes(origin) ?? false;
}

/**
 * Create a default CORS configuration for development.
 */
export function createDefaultCORSConfig(overrides?: Partial<CORSConfig>): CORSConfig {
  return {
    origins: {
      dashboard: ['http://localhost:3000'],
      invitation: ['http://localhost:3001'],
      scanner: ['http://localhost:3002'],
    },
    additionalOrigins: [],
    ...overrides,
  };
}

// --- Exported constants for testing ---

export const CORS_CONSTANTS = {
  DEFAULT_METHODS,
  DEFAULT_ALLOWED_HEADERS,
  DEFAULT_EXPOSED_HEADERS,
  DEFAULT_MAX_AGE,
} as const;
