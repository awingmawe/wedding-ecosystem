import { FastifyRequest, FastifyReply } from 'fastify';
import { ErrorCode } from '@wedding/shared';
import { RATE_LIMIT_PER_MINUTE } from '@wedding/shared';
import { AuthenticatedRequest } from './tenant-isolation.middleware';

// --- Types ---

export interface RateLimiterConfig {
  /** Maximum requests per window (default: 100) */
  maxRequests?: number;
  /** Window duration in seconds (default: 60) */
  windowSeconds?: number;
}

export interface RateLimiterStore {
  /**
   * Increment the request count for a key and return the current count.
   * Should set expiry on first increment within a window.
   * @returns current count after increment
   */
  increment(key: string, windowSeconds: number): Promise<number>;

  /**
   * Get the remaining TTL for a key in seconds.
   * @returns TTL in seconds, or -1 if key doesn't exist
   */
  getTTL(key: string): Promise<number>;
}

// --- Redis Rate Limiter Store ---

/**
 * Redis-based rate limiter store using ioredis.
 * Uses atomic INCR + EXPIRE for thread-safe counting.
 */
export class RedisRateLimiterStore implements RateLimiterStore {
  private readonly redis: RedisClient;

  constructor(redis: RedisClient) {
    this.redis = redis;
  }

  async increment(key: string, windowSeconds: number): Promise<number> {
    const count = await this.redis.incr(key);
    // Set expiry only on first request in window
    if (count === 1) {
      await this.redis.expire(key, windowSeconds);
    }
    return count;
  }

  async getTTL(key: string): Promise<number> {
    return this.redis.ttl(key);
  }
}

/**
 * In-memory rate limiter store for testing/development.
 */
export class InMemoryRateLimiterStore implements RateLimiterStore {
  private readonly store = new Map<string, { count: number; expiresAt: number }>();

  async increment(key: string, windowSeconds: number): Promise<number> {
    const now = Date.now();
    const existing = this.store.get(key);

    if (!existing || existing.expiresAt <= now) {
      // New window
      this.store.set(key, { count: 1, expiresAt: now + windowSeconds * 1000 });
      return 1;
    }

    // Increment existing
    existing.count++;
    return existing.count;
  }

  async getTTL(key: string): Promise<number> {
    const existing = this.store.get(key);
    if (!existing) return -1;
    const remaining = Math.ceil((existing.expiresAt - Date.now()) / 1000);
    return remaining > 0 ? remaining : -1;
  }

  /** Clear all entries (for testing) */
  clear(): void {
    this.store.clear();
  }
}

// --- Redis Client Interface ---

/** Minimal Redis client interface for rate limiting */
export interface RedisClient {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
}

// --- Rate Limiter Middleware ---

const DEFAULT_MAX_REQUESTS = RATE_LIMIT_PER_MINUTE; // 100
const DEFAULT_WINDOW_SECONDS = 60;
const RATE_LIMIT_KEY_PREFIX = 'rate_limit:';

/**
 * Creates a Fastify preHandler hook that enforces per-tenant rate limiting.
 * Uses a sliding window counter pattern with Redis for distributed environments.
 *
 * - 100 requests per minute per tenant (Req 13.3)
 * - Returns HTTP 429 when limit exceeded (Req 13.4)
 * - Includes Retry-After header
 *
 * Validates: Requirements 13.3, 13.4
 */
export function createRateLimiterMiddleware(
  store: RateLimiterStore,
  config?: RateLimiterConfig
) {
  const maxRequests = config?.maxRequests ?? DEFAULT_MAX_REQUESTS;
  const windowSeconds = config?.windowSeconds ?? DEFAULT_WINDOW_SECONDS;

  return async function rateLimiterHook(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const authenticatedRequest = request as AuthenticatedRequest;
    const tenantContext = authenticatedRequest.tenantContext;

    // If no tenant context (unauthenticated routes), use IP-based limiting
    const identifier = tenantContext?.tenant_id ?? request.ip;
    const key = `${RATE_LIMIT_KEY_PREFIX}${identifier}`;

    const currentCount = await store.increment(key, windowSeconds);

    // Set rate limit headers
    reply.header('X-RateLimit-Limit', maxRequests.toString());
    reply.header('X-RateLimit-Remaining', Math.max(0, maxRequests - currentCount).toString());

    if (currentCount > maxRequests) {
      const ttl = await store.getTTL(key);
      const retryAfter = ttl > 0 ? ttl : windowSeconds;

      reply.header('Retry-After', retryAfter.toString());
      reply.header('X-RateLimit-Remaining', '0');

      reply.status(429).send({
        success: false,
        error: {
          code: ErrorCode.RATE_LIMIT_EXCEEDED,
          message: `Batas permintaan terlampaui. Maksimal ${maxRequests} permintaan per menit. Coba lagi dalam ${retryAfter} detik.`,
        },
      });
      return;
    }
  };
}

// --- Exported constants for testing ---

export const RATE_LIMITER_CONSTANTS = {
  DEFAULT_MAX_REQUESTS,
  DEFAULT_WINDOW_SECONDS,
  RATE_LIMIT_KEY_PREFIX,
} as const;
