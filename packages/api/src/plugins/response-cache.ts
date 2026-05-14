import { FastifyInstance, FastifyPluginCallback, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import type Redis from 'ioredis';
import { getCacheClient } from '../config/redis';

/**
 * Response Caching Plugin for Fastify with Redis.
 *
 * Caches GET responses for configured route patterns with appropriate TTLs:
 * - Event details: TTL 5 minutes (300s)
 * - CMS sections: TTL 5 minutes (300s)
 * - Guest list: TTL 1 minute (60s)
 *
 * Implements cache invalidation on write operations (POST, PUT, PATCH, DELETE)
 * that match invalidation patterns.
 *
 * Gracefully degrades when Redis is unavailable — requests pass through without caching.
 *
 * Validates: Requirements 14.3
 */

// --- Types ---

export interface CacheRoute {
  /** URL pattern to match (supports :param placeholders) */
  pattern: string;
  /** TTL in seconds */
  ttlSeconds: number;
  /** HTTP methods to cache (default: ['GET']) */
  methods?: string[];
}

export interface InvalidationRule {
  /** URL pattern that triggers invalidation (write operations) */
  triggerPattern: string;
  /** HTTP methods that trigger invalidation */
  methods: string[];
  /** Cache key patterns to invalidate (supports wildcards via scan) */
  invalidatePatterns: string[];
}

export interface ResponseCacheOptions {
  /** Routes to cache with their TTL */
  cacheRoutes?: CacheRoute[];
  /** Invalidation rules for write operations */
  invalidationRules?: InvalidationRule[];
  /** Redis key prefix (default: 'rc:') */
  keyPrefix?: string;
  /** Whether to add cache status headers (default: true) */
  addCacheHeaders?: boolean;
}

export interface CachedResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  cachedAt: number;
}

// --- Default Configuration ---

export const DEFAULT_CACHE_ROUTES: CacheRoute[] = [
  // Event details — TTL 5 minutes
  { pattern: '/events/current', ttlSeconds: 300 },
  { pattern: '/events/:id/stats', ttlSeconds: 300 },
  { pattern: '/events/:id/sections', ttlSeconds: 300 },
  // CMS sections — TTL 5 minutes
  { pattern: '/cms/sections/:eventId', ttlSeconds: 300 },
  { pattern: '/cms/sections/:eventId/:sectionId', ttlSeconds: 300 },
  // Guest list — TTL 1 minute
  { pattern: '/guests', ttlSeconds: 60 },
  { pattern: '/guests/search', ttlSeconds: 60 },
];

export const DEFAULT_INVALIDATION_RULES: InvalidationRule[] = [
  // Event write operations invalidate event cache
  {
    triggerPattern: '/events/:id/sections/:sectionId/content',
    methods: ['PUT'],
    invalidatePatterns: ['events:', 'cms:'],
  },
  {
    triggerPattern: '/events/:id/sections/:sectionId/toggle',
    methods: ['PUT'],
    invalidatePatterns: ['events:', 'cms:'],
  },
  {
    triggerPattern: '/events/:id/sections/:sectionId/reorder',
    methods: ['PUT'],
    invalidatePatterns: ['events:', 'cms:'],
  },
  // CMS write operations invalidate CMS and event cache
  {
    triggerPattern: '/cms/sections/:eventId/:sectionId/content',
    methods: ['PUT'],
    invalidatePatterns: ['cms:', 'events:'],
  },
  {
    triggerPattern: '/cms/sections/:eventId/:sectionId/toggle',
    methods: ['PUT'],
    invalidatePatterns: ['cms:', 'events:'],
  },
  {
    triggerPattern: '/cms/sections/:eventId/:sectionId/reorder',
    methods: ['PUT'],
    invalidatePatterns: ['cms:', 'events:'],
  },
  // Guest write operations invalidate guest cache
  {
    triggerPattern: '/guests',
    methods: ['POST'],
    invalidatePatterns: ['guests:'],
  },
  {
    triggerPattern: '/guests/:id',
    methods: ['PUT', 'PATCH', 'DELETE'],
    invalidatePatterns: ['guests:'],
  },
  {
    triggerPattern: '/guests/import',
    methods: ['POST'],
    invalidatePatterns: ['guests:'],
  },
];

const DEFAULT_KEY_PREFIX = 'rc:';

// --- Helper Functions ---

/**
 * Converts a route pattern with :param placeholders into a regex.
 * e.g., '/events/:id/stats' → /^\/events\/[^/]+\/stats$/
 */
export function patternToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:[^/]+/g, '[^/]+');
  return new RegExp(`^${escaped}$`);
}

/**
 * Checks if a URL matches a route pattern.
 * Strips query string before matching.
 */
export function matchesPattern(url: string, pattern: string): boolean {
  const pathname = url.split('?')[0];
  const regex = patternToRegex(pattern);
  return regex.test(pathname);
}

/**
 * Finds the matching cache route for a given URL and method.
 */
export function findCacheRoute(
  url: string,
  method: string,
  cacheRoutes: CacheRoute[]
): CacheRoute | null {
  const upperMethod = method.toUpperCase();

  for (const route of cacheRoutes) {
    const allowedMethods = route.methods || ['GET'];
    if (!allowedMethods.includes(upperMethod)) continue;
    if (matchesPattern(url, route.pattern)) {
      return route;
    }
  }

  return null;
}

/**
 * Checks if a request should trigger cache invalidation.
 */
export function shouldInvalidate(
  url: string,
  method: string,
  rules: InvalidationRule[]
): InvalidationRule | null {
  const upperMethod = method.toUpperCase();

  for (const rule of rules) {
    if (!rule.methods.includes(upperMethod)) continue;
    if (matchesPattern(url, rule.triggerPattern)) {
      return rule;
    }
  }

  return null;
}

/**
 * Builds a cache key from the request URL, method, and tenant context.
 * Includes tenant_id to ensure multi-tenant isolation.
 */
export function buildCacheKey(
  prefix: string,
  routePattern: string,
  url: string,
  tenantId?: string
): string {
  // Extract the category from the pattern (first path segment)
  const category = routePattern.split('/').filter(Boolean)[0] || 'default';
  // Use the full URL (with query params) as the unique identifier
  const tenant = tenantId || 'anonymous';
  return `${prefix}${category}:${tenant}:${url}`;
}

// --- Redis Operations ---

/**
 * Gets a cached response from Redis.
 */
async function getCachedResponse(redis: Redis, key: string): Promise<CachedResponse | null> {
  try {
    const data = await redis.get(key);
    if (!data) return null;
    return JSON.parse(data) as CachedResponse;
  } catch {
    return null;
  }
}

/**
 * Stores a response in Redis cache with TTL.
 */
async function setCachedResponse(
  redis: Redis,
  key: string,
  response: CachedResponse,
  ttlSeconds: number
): Promise<boolean> {
  try {
    await redis.set(key, JSON.stringify(response), 'EX', ttlSeconds);
    return true;
  } catch {
    return false;
  }
}

/**
 * Invalidates cache entries matching the given patterns using SCAN.
 * Uses SCAN to avoid blocking Redis with KEYS command.
 */
async function invalidateByPatterns(
  redis: Redis,
  prefix: string,
  patterns: string[],
  tenantId?: string
): Promise<number> {
  let totalDeleted = 0;

  for (const pattern of patterns) {
    const scanPattern = tenantId ? `${prefix}${pattern}${tenantId}:*` : `${prefix}${pattern}*`;

    try {
      let cursor = '0';
      do {
        const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', scanPattern, 'COUNT', 100);
        cursor = nextCursor;

        if (keys.length > 0) {
          const deleted = await redis.del(...keys);
          totalDeleted += deleted;
        }
      } while (cursor !== '0');
    } catch {
      // Graceful degradation — continue even if invalidation fails
    }
  }

  return totalDeleted;
}

// --- Plugin Implementation ---

const responseCachePlugin: FastifyPluginCallback<ResponseCacheOptions> = (
  fastify: FastifyInstance,
  options: ResponseCacheOptions,
  done: (err?: Error) => void
) => {
  const {
    cacheRoutes = DEFAULT_CACHE_ROUTES,
    invalidationRules = DEFAULT_INVALIDATION_RULES,
    keyPrefix = DEFAULT_KEY_PREFIX,
    addCacheHeaders = true,
  } = options;

  // --- Cache Hit: Serve from cache on GET requests ---
  // Use preHandler so that authentication hooks (onRequest) have already run
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    // Only cache GET requests
    if (request.method !== 'GET') return;

    const cacheRoute = findCacheRoute(request.url, request.method, cacheRoutes);
    if (!cacheRoute) return;

    const redis = getCacheClient();
    if (!redis) return;

    const tenantId = (request as any).user?.tenant_id;
    const cacheKey = buildCacheKey(keyPrefix, cacheRoute.pattern, request.url, tenantId);

    const cached = await getCachedResponse(redis, cacheKey);
    if (cached) {
      // Serve from cache
      if (addCacheHeaders) {
        reply.header('X-Cache', 'HIT');
        reply.header('X-Cache-Age', Math.floor((Date.now() - cached.cachedAt) / 1000).toString());
      }

      // Restore original content-type header
      if (cached.headers['content-type']) {
        reply.header('content-type', cached.headers['content-type']);
      }

      reply.status(cached.statusCode).send(cached.body);
      return;
    }

    // Mark as cache miss for the onSend hook
    if (addCacheHeaders) {
      reply.header('X-Cache', 'MISS');
    }

    // Store cache route info on request for use in onSend
    (request as any).__cacheRoute = cacheRoute;
    (request as any).__cacheKey = cacheKey;
  });

  // --- Cache Store: Save successful GET responses ---
  fastify.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload) => {
    const cacheRoute = (request as any).__cacheRoute as CacheRoute | undefined;
    const cacheKey = (request as any).__cacheKey as string | undefined;

    if (!cacheRoute || !cacheKey) return payload;

    // Only cache successful responses (2xx)
    const statusCode = reply.statusCode;
    if (statusCode < 200 || statusCode >= 300) return payload;

    const redis = getCacheClient();
    if (!redis) return payload;

    const cachedResponse: CachedResponse = {
      statusCode,
      headers: {
        'content-type': (reply.getHeader('content-type') as string) || 'application/json',
      },
      body: typeof payload === 'string' ? payload : JSON.stringify(payload),
      cachedAt: Date.now(),
    };

    // Store in background — don't block the response
    setCachedResponse(redis, cacheKey, cachedResponse, cacheRoute.ttlSeconds);

    return payload;
  });

  // --- Cache Invalidation: Clear cache on write operations ---
  // Use onSend for write operations to ensure invalidation completes before response
  fastify.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload) => {
    // Only process write operations (non-GET)
    if (request.method === 'GET') return payload;

    // Only invalidate on successful write operations
    if (reply.statusCode < 200 || reply.statusCode >= 300) return payload;

    const rule = shouldInvalidate(request.url, request.method, invalidationRules);
    if (!rule) return payload;

    const redis = getCacheClient();
    if (!redis) return payload;

    const tenantId = (request as any).user?.tenant_id;

    await invalidateByPatterns(redis, keyPrefix, rule.invalidatePatterns, tenantId);

    return payload;
  });

  done();
};

// --- Exported Plugin ---

/**
 * Fastify response cache plugin with Redis backend.
 * Register with: fastify.register(responseCache, options)
 *
 * Uses fastify-plugin to ensure hooks are applied at the encapsulation level
 * where it's registered.
 */
export const responseCache = fp(responseCachePlugin, {
  name: 'response-cache',
  fastify: '5.x',
});

export default responseCache;

// --- Exported for testing ---

export const RESPONSE_CACHE_CONSTANTS = {
  DEFAULT_KEY_PREFIX,
  TTL_EVENT_DETAILS: 300,
  TTL_CMS_SECTIONS: 300,
  TTL_GUEST_LIST: 60,
} as const;
