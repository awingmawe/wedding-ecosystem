import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { randomUUID } from 'crypto';

// --- Constants ---

/** Maximum JSON body size: 1MB */
export const MAX_JSON_BODY_SIZE = 1 * 1024 * 1024; // 1MB

/** Maximum file upload body size: 10MB */
export const MAX_FILE_UPLOAD_BODY_SIZE = 10 * 1024 * 1024; // 10MB

/** Header name for request correlation ID */
export const REQUEST_ID_HEADER = 'x-request-id';

/** Content-Type for JSON requests */
export const CONTENT_TYPE_JSON = 'application/json';

/** Content-Type for multipart file uploads */
export const CONTENT_TYPE_MULTIPART = 'multipart/form-data';

// --- Types ---

export interface RequestValidationOptions {
  /** Routes that expect file uploads (multipart/form-data). Matched by prefix. */
  fileUploadRoutes?: string[];
  /** Maximum JSON body size in bytes (default: 1MB) */
  maxJsonBodySize?: number;
  /** Maximum file upload body size in bytes (default: 10MB) */
  maxFileUploadBodySize?: number;
  /** Custom request ID generator (default: crypto.randomUUID) */
  generateRequestId?: () => string;
}

// --- Fastify Declaration Merging ---

declare module 'fastify' {
  interface FastifyRequest {
    requestId: string;
  }
}

// --- Helper Functions ---

/**
 * Determines if a route expects file uploads based on configured prefixes.
 */
export function isFileUploadRoute(url: string, fileUploadRoutes: string[]): boolean {
  return fileUploadRoutes.some((prefix) => url.startsWith(prefix));
}

/**
 * Extracts the base content type (without parameters like charset or boundary).
 */
export function parseContentType(contentType: string | undefined): string | null {
  if (!contentType) return null;
  // Extract the media type before any semicolons (e.g., "application/json; charset=utf-8" → "application/json")
  const mediaType = contentType.split(';')[0].trim().toLowerCase();
  return mediaType || null;
}

/**
 * Validates Content-Type header against expected type for the route.
 * Returns null if valid, or an error message if invalid.
 */
export function validateContentType(
  request: FastifyRequest,
  fileUploadRoutes: string[]
): string | null {
  const method = request.method.toUpperCase();

  // Only validate Content-Type for methods that carry a body
  if (method === 'GET' || method === 'HEAD' || method === 'DELETE' || method === 'OPTIONS') {
    return null;
  }

  const contentType = parseContentType(request.headers['content-type']);
  const isUploadRoute = isFileUploadRoute(request.url, fileUploadRoutes);

  if (isUploadRoute) {
    // File upload routes expect multipart/form-data
    if (!contentType || !contentType.startsWith(CONTENT_TYPE_MULTIPART)) {
      return `Content-Type harus '${CONTENT_TYPE_MULTIPART}' untuk endpoint ini.`;
    }
  } else {
    // All other routes with body expect application/json
    if (!contentType || contentType !== CONTENT_TYPE_JSON) {
      return `Content-Type harus '${CONTENT_TYPE_JSON}' untuk endpoint ini.`;
    }
  }

  return null;
}

// --- Plugin Implementation ---

/**
 * Fastify plugin for request validation.
 *
 * Provides:
 * 1. Correlation ID (request_id) generation and attachment on every request
 * 2. Content-Type validation (returns 415 Unsupported Media Type on mismatch)
 * 3. Request body size limits (1MB JSON, 10MB file upload)
 *
 * Usage:
 *   await fastify.register(requestValidation, { fileUploadRoutes: ['/upload', '/cms/media'] });
 *
 * Validates: Requirements 12.3, 12.5, 12.9
 */
export const requestValidationImpl: FastifyPluginAsync<RequestValidationOptions> = async (
  fastify: FastifyInstance,
  options: RequestValidationOptions
) => {
  const {
    fileUploadRoutes = ['/upload', '/cms/media'],
    maxJsonBodySize = MAX_JSON_BODY_SIZE,
    maxFileUploadBodySize = MAX_FILE_UPLOAD_BODY_SIZE,
    generateRequestId = randomUUID,
  } = options;

  // Set body size limits per route via onRoute hook
  fastify.addHook('onRoute', (routeOptions) => {
    if (routeOptions.url && isFileUploadRoute(routeOptions.url, fileUploadRoutes)) {
      routeOptions.bodyLimit = maxFileUploadBodySize;
    } else if (!routeOptions.bodyLimit) {
      routeOptions.bodyLimit = maxJsonBodySize;
    }
  });

  // Remove default content-type parsers and re-register them.
  // This prevents Fastify from returning its own 415 before our validation hook runs.
  // Our preHandler hook will validate and return a proper 415 with request_id.
  fastify.removeAllContentTypeParsers();

  // Re-add JSON parser for proper body parsing on valid JSON requests
  fastify.addContentTypeParser(
    CONTENT_TYPE_JSON,
    { parseAs: 'string' },
    function (_request, body, done) {
      try {
        const parsed = JSON.parse(body as string);
        done(null, parsed);
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );

  // Accept all other content types without parsing body.
  // Actual multipart parsing is handled by dedicated plugins (e.g., @fastify/multipart).
  // Content-Type validation happens in our preHandler hook.
  fastify.addContentTypeParser('*', function (_request, payload, done) {
    let data = '';
    payload.on('data', (chunk: Buffer) => {
      data += chunk.toString();
    });
    payload.on('end', () => {
      done(null, data);
    });
  });

  // Hook: Attach correlation ID to every incoming request
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Use existing request ID from header if provided (for distributed tracing), otherwise generate one
    const existingId = request.headers[REQUEST_ID_HEADER] as string | undefined;
    const requestId = existingId || generateRequestId();

    // Attach to request object for use throughout the request lifecycle
    request.requestId = requestId;

    // Set the correlation ID on the response header
    reply.header(REQUEST_ID_HEADER, requestId);
  });

  // Hook: Validate Content-Type header
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const error = validateContentType(request, fileUploadRoutes);

    if (error) {
      reply.status(415).send({
        success: false,
        error: {
          code: 'UNSUPPORTED_MEDIA_TYPE',
          message: error,
          request_id: request.requestId,
        },
      });
    }
  });
};

/**
 * Wrapped with fastify-plugin to break encapsulation,
 * allowing hooks to apply to all routes in the parent context.
 */
export const requestValidation = fp(requestValidationImpl, {
  name: 'request-validation',
  fastify: '5.x',
});

export default requestValidation;
