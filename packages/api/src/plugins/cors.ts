import { FastifyInstance, FastifyPluginCallback, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';

// --- Types ---

export interface CorsPluginOptions {
  /** The production domain (e.g., 'example.com'). Defaults to PRODUCTION_DOMAIN env var. */
  productionDomain?: string;
  /** Whether the server is running in development mode. Defaults to NODE_ENV !== 'production'. */
  isDevelopment?: boolean;
  /** Additional allowed origins (exact match). Defaults to CORS_ADDITIONAL_ORIGINS env var (comma-separated). */
  additionalOrigins?: string[];
  /** Allowed HTTP methods for CORS preflight. */
  allowedMethods?: string[];
  /** Allowed headers for CORS preflight. */
  allowedHeaders?: string[];
  /** Whether to allow credentials (cookies, authorization headers). */
  credentials?: boolean;
  /** Max age for preflight cache in seconds (default: 86400 = 24 hours). */
  maxAge?: number;
}

// --- Constants ---

/** Default allowed HTTP methods */
const DEFAULT_ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

/** Default allowed headers */
const DEFAULT_ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Request-ID',
  'X-Requested-With',
  'Accept',
  'Origin',
];

/** Default preflight cache max-age: 24 hours */
const DEFAULT_MAX_AGE = 86400;

/** Development origins allowed in non-production mode */
const DEVELOPMENT_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:4000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:3002',
  'http://127.0.0.1:4000',
];

// --- Helper Functions ---

/**
 * Builds the list of allowed origin patterns for the given production domain.
 *
 * Allowed origins:
 * - dashboard.{domain} (Dashboard app)
 * - scanner.{domain} (Scanner PWA)
 * - cdn.{domain} (CDN/R2 media — for download CORS)
 * - *.{domain} (Invitation app with event-slug subdomains)
 */
export function buildAllowedOriginPatterns(domain: string): {
  exactOrigins: string[];
  wildcardSuffix: string;
} {
  const exactOrigins = [
    `https://dashboard.${domain}`,
    `https://scanner.${domain}`,
    `https://cdn.${domain}`,
  ];

  // Wildcard pattern: any subdomain of the production domain
  // This covers {event-slug}.{domain} for the Invitation app
  const wildcardSuffix = `.${domain}`;

  return { exactOrigins, wildcardSuffix };
}

/**
 * Checks whether a given origin is allowed based on the CORS configuration.
 */
export function isOriginAllowed(
  origin: string,
  exactOrigins: string[],
  wildcardSuffix: string,
  additionalOrigins: string[],
  isDevelopment: boolean
): boolean {
  // In development mode, allow localhost origins
  if (isDevelopment && DEVELOPMENT_ORIGINS.includes(origin)) {
    return true;
  }

  // Check exact match (dashboard, scanner)
  if (exactOrigins.includes(origin)) {
    return true;
  }

  // Check additional origins
  if (additionalOrigins.includes(origin)) {
    return true;
  }

  // Check wildcard subdomain pattern (*.{domain})
  // Origin must be https://{something}.{domain}
  if (origin.startsWith('https://') && origin.endsWith(wildcardSuffix)) {
    const subdomain = origin.slice('https://'.length, origin.length - wildcardSuffix.length);
    // Subdomain must be non-empty and not contain dots (single-level subdomain)
    if (subdomain.length > 0 && !subdomain.includes('.')) {
      return true;
    }
  }

  return false;
}

// --- Plugin Implementation ---

/**
 * Fastify CORS plugin for production domain restriction.
 *
 * Configures CORS to only allow origins from production domains:
 * - dashboard.{domain} (Dashboard app)
 * - scanner.{domain} (Scanner PWA)
 * - *.{domain} (Invitation app with event-slug based subdomains)
 *
 * In development mode, also allows localhost origins.
 * Blocks requests from unauthorized origins by not setting CORS headers,
 * causing the browser to reject the response.
 *
 * Validates: Requirements 11.6
 */
const corsPlugin: FastifyPluginCallback<CorsPluginOptions> = (
  fastify: FastifyInstance,
  opts: CorsPluginOptions,
  done
) => {
  const productionDomain = opts.productionDomain ?? process.env.PRODUCTION_DOMAIN;
  const isDevelopment = opts.isDevelopment ?? process.env.NODE_ENV !== 'production';
  const additionalOrigins =
    opts.additionalOrigins ??
    (process.env.CORS_ADDITIONAL_ORIGINS
      ? process.env.CORS_ADDITIONAL_ORIGINS.split(',')
          .map((o) => o.trim())
          .filter(Boolean)
      : []);
  const allowedMethods = opts.allowedMethods ?? DEFAULT_ALLOWED_METHODS;
  const allowedHeaders = opts.allowedHeaders ?? DEFAULT_ALLOWED_HEADERS;
  const credentials = opts.credentials ?? true;
  const maxAge = opts.maxAge ?? DEFAULT_MAX_AGE;

  // If no production domain is configured and not in development, log a warning
  if (!productionDomain && !isDevelopment) {
    fastify.log.warn(
      'CORS plugin: PRODUCTION_DOMAIN is not set. All cross-origin requests will be blocked in production.'
    );
  }

  // Build allowed origin patterns
  const { exactOrigins, wildcardSuffix } = productionDomain
    ? buildAllowedOriginPatterns(productionDomain)
    : { exactOrigins: [], wildcardSuffix: '' };

  // Handle CORS on every request
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const origin = request.headers.origin;

    // No Origin header means same-origin request or non-browser client — allow through
    if (!origin) {
      return;
    }

    const allowed = isOriginAllowed(
      origin,
      exactOrigins,
      wildcardSuffix,
      additionalOrigins,
      isDevelopment
    );

    if (allowed) {
      // Set CORS headers for allowed origins
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Vary', 'Origin');

      if (credentials) {
        reply.header('Access-Control-Allow-Credentials', 'true');
      }

      // Handle preflight (OPTIONS) requests
      if (request.method === 'OPTIONS') {
        reply.header('Access-Control-Allow-Methods', allowedMethods.join(', '));
        reply.header('Access-Control-Allow-Headers', allowedHeaders.join(', '));
        reply.header('Access-Control-Max-Age', maxAge.toString());

        // Respond immediately to preflight
        reply.status(204).send();
        return;
      }
    } else {
      // Origin not allowed — block by not setting CORS headers.
      // For preflight requests from unauthorized origins, respond with 403.
      if (request.method === 'OPTIONS') {
        reply.status(403).send({
          success: false,
          error: {
            code: 'CORS_ORIGIN_NOT_ALLOWED',
            message: 'Origin not allowed by CORS policy.',
          },
        });
        return;
      }
      // For non-preflight requests from unauthorized origins,
      // the browser will block the response since no CORS headers are set.
    }
  });

  done();
};

// --- Exported Plugin ---

/**
 * CORS plugin wrapped with fastify-plugin to break encapsulation.
 * This ensures CORS headers are applied at the root level regardless of where it's registered.
 *
 * Register with: fastify.register(cors, options)
 */
export const cors = fp(corsPlugin, {
  name: 'cors',
  fastify: '5.x',
});

export default cors;

// --- Exported constants for testing ---

export const CORS_CONSTANTS = {
  DEFAULT_ALLOWED_METHODS,
  DEFAULT_ALLOWED_HEADERS,
  DEFAULT_MAX_AGE,
  DEVELOPMENT_ORIGINS,
} as const;
