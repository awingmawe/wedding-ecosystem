import { FastifyInstance, FastifyPluginCallback, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import type Redis from 'ioredis';
import { getCacheClient } from '../config/redis';

/**
 * Rate Limiting Plugin for Fastify with per-endpoint configuration.
 *
 * Uses Redis-backed fixed window counters via Upstash cache instance.
 * Gracefully degrades (allows requests through) when Redis is unavailable.
 *
 * Rate limits:
 * - General API: 100 req/min
 * - Authentication endpoints: 20 req/min
 * - Scanner check-in endpoints: 300 req/min
 *
 * Returns HTTP 429 with Retry-After header when limit exceeded.
 *
 * Validates: Requirements 12.4
 */

// --- Types ---

export interface RateLimitCategory {
  /** Maximum requests allowed per window */
  max: number;
  /** Window duration in seconds */
  windowSeconds: number;
}

export interface RateLimiterPluginOptions {
  /** Rate limit categories by name */
  categories: Record<string, RateLimitCategory>;
  /** Route prefix to category mapping */
  routeCategories: RouteCategory[];
  /** Redis key prefix (default: 'rl:') */
  keyPrefix?: string;
  /** Custom identifier extractor (default: uses request IP) */
  identifierExtractor?: (request: FastifyRequest) => string;
}

export interface RouteCategory {
  /** URL prefix to match (e.g., '/auth') */
  prefix: string;
  /** Category name from the categories config */
  category: string;
}

// --- Default Configuration ---

export const DEFAULT_CATEGORIES: Record<string, RateLimitCategory> = {
  general: { max: 100, windowSeconds: 60 },
  auth: { max: 20, windowSeconds: 60 },
  scanner: { max: 300, windowSeconds: 60 },
};

export const DEFAULT_ROUTE_CATEGORIES: RouteCategory[] = [
  { prefix: '/auth', category: 'auth' },
  { prefix: '/scanner', category: 'scanner' },
  { prefix: '/checkin', category: 'scanner' },
];

const DEFAULT_KEY_PREFIX = 'rl:';

// --- Helper Functions ---

/**
 * Determines the rate limit category for a given request URL.
 * Matches the longest prefix first for specificity.
 */
export function resolveCategory(url: string, routeCategories: RouteCategory[]): string {
  // Sort by prefix length descending for most-specific match
  const sorted = [...routeCategories].sort((a, b) => b.prefix.length - a.prefix.length);

  for (const route of sorted) {
    if (url.startsWith(route.prefix)) {
      return route.category;
    }
  }

  return 'general';
}

/**
 * Extracts the client identifier from the request.
 * Uses authenticated user's tenant_id + user_id if available, otherwise IP.
 */
function defaultIdentifierExtractor(request: FastifyRequest): string {
  const user = (request as any).user;
  if (user?.tenant_id && user?.id) {
    return `${user.tenant_id}:${user.id}`;
  }
  // Fall back to IP address for unauthenticated requests
  return request.ip;
}

/**
 * Builds the Redis key for a rate limit entry.
 */
export function buildRateLimitKey(prefix: string, category: string, identifier: string): string {
  return `${prefix}${category}:${identifier}`;
}

// --- Redis Operations ---

/**
 * Increments the rate limit counter in Redis using INCR + EXPIRE.
 * Returns the current count and TTL, or null if Redis is unavailable.
 */
async function incrementCounter(
  redis: Redis,
  key: string,
  windowSeconds: number
): Promise<{ count: number; ttl: number } | null> {
  try {
    const multi = redis.multi();
    multi.incr(key);
    multi.ttl(key);
    const results = await multi.exec();

    if (!results) {
      return null;
    }

    const [incrResult, ttlResult] = results;

    // Check for errors in pipeline
    if (incrResult[0] || ttlResult[0]) {
      return null;
    }

    const count = incrResult[1] as number;
    const ttl = ttlResult[1] as number;

    // Set expiry on first request in window (TTL is -1 when key has no expiry)
    if (ttl === -1 || ttl === -2) {
      await redis.expire(key, windowSeconds);
    }

    return { count, ttl: ttl > 0 ? ttl : windowSeconds };
  } catch {
    return null;
  }
}

// --- Plugin Implementation ---

const rateLimiterPlugin: FastifyPluginCallback<RateLimiterPluginOptions> = (
  fastify: FastifyInstance,
  options: RateLimiterPluginOptions,
  done: (err?: Error) => void
) => {
  const {
    categories = DEFAULT_CATEGORIES,
    routeCategories = DEFAULT_ROUTE_CATEGORIES,
    keyPrefix = DEFAULT_KEY_PREFIX,
    identifierExtractor = defaultIdentifierExtractor,
  } = options;

  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip rate limiting for health check and OPTIONS preflight
    if (request.url === '/health' || request.method === 'OPTIONS') {
      return;
    }

    const categoryName = resolveCategory(request.url, routeCategories);
    const category =
      categories[categoryName] || categories['general'] || DEFAULT_CATEGORIES['general'];

    const identifier = identifierExtractor(request);
    const key = buildRateLimitKey(keyPrefix, categoryName, identifier);

    // Get Redis client — graceful degradation if unavailable
    const redis = getCacheClient();
    if (!redis) {
      // Redis not configured — allow request through (graceful degradation)
      return;
    }

    const result = await incrementCounter(redis, key, category.windowSeconds);

    if (!result) {
      // Redis operation failed — allow request through (graceful degradation)
      return;
    }

    const { count, ttl } = result;
    const remaining = Math.max(0, category.max - count);

    // Set rate limit headers on every response
    reply.header('X-RateLimit-Limit', category.max.toString());
    reply.header('X-RateLimit-Remaining', remaining.toString());
    reply.header('X-RateLimit-Reset', ttl.toString());

    // Check if limit exceeded
    if (count > category.max) {
      const retryAfter = ttl > 0 ? ttl : category.windowSeconds;

      reply.header('Retry-After', retryAfter.toString());
      reply.header('X-RateLimit-Remaining', '0');

      reply.status(429).send({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Rate limit exceeded. Maximum ${category.max} requests per ${category.windowSeconds} seconds for this endpoint. Try again in ${retryAfter} seconds.`,
        },
        retryAfter,
      });
      return;
    }
  });

  done();
};

// --- Exported Plugin ---

/**
 * Fastify rate limiter plugin with per-endpoint configuration.
 * Register with: fastify.register(rateLimiterPlugin, options)
 *
 * Uses fastify-plugin to ensure the hook is applied at the encapsulation level
 * where it's registered (not scoped to a child context).
 */
export const rateLimiter = fp(rateLimiterPlugin, {
  name: 'rate-limiter',
  fastify: '5.x',
});

export default rateLimiter;
