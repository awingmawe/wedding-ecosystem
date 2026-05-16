import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import {
  rateLimiter,
  resolveCategory,
  buildRateLimitKey,
  DEFAULT_CATEGORIES,
  DEFAULT_ROUTE_CATEGORIES,
} from './rate-limiter';

// Mock the redis module
vi.mock('../config/redis', () => {
  let mockRedis: any = null;

  return {
    getCacheClient: () => mockRedis,
    __setMockRedis: (redis: any) => {
      mockRedis = redis;
    },
  };
});

// Import the mock setter
const { __setMockRedis } = (await import('../config/redis')) as any;

/**
 * Creates a mock Redis client for testing.
 */
function createMockRedis() {
  const store = new Map<string, { value: number; expiresAt: number }>();

  return {
    multi: () => {
      const commands: Array<() => [Error | null, any]> = [];
      const pipeline = {
        incr: (key: string) => {
          commands.push(() => {
            const now = Date.now();
            const existing = store.get(key);
            if (!existing || existing.expiresAt <= now) {
              store.set(key, { value: 1, expiresAt: now + 60_000 });
              return [null, 1];
            }
            existing.value++;
            return [null, existing.value];
          });
          return pipeline;
        },
        ttl: (key: string) => {
          commands.push(() => {
            const existing = store.get(key);
            if (!existing) return [null, -2];
            const remaining = Math.ceil((existing.expiresAt - Date.now()) / 1000);
            return [null, remaining > 0 ? remaining : -2];
          });
          return pipeline;
        },
        exec: async () => commands.map((cmd) => cmd()),
      };
      return pipeline;
    },
    expire: async (key: string, seconds: number) => {
      const existing = store.get(key);
      if (existing) {
        existing.expiresAt = Date.now() + seconds * 1000;
      }
      return 1;
    },
    _store: store,
    _clear: () => store.clear(),
  };
}

describe('Rate Limiter Plugin', () => {
  let app: FastifyInstance;
  let mockRedis: ReturnType<typeof createMockRedis>;

  beforeEach(async () => {
    mockRedis = createMockRedis();
    __setMockRedis(mockRedis);

    app = Fastify();
    await app.register(rateLimiter, {
      categories: DEFAULT_CATEGORIES,
      routeCategories: DEFAULT_ROUTE_CATEGORIES,
    });

    // Register test routes
    app.get('/api/test', async () => ({ ok: true }));
    app.post('/auth/login', async () => ({ token: 'abc' }));
    app.post('/scanner/checkin', async () => ({ checked: true }));
    app.get('/health', async () => ({ status: 'ok' }));

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    mockRedis._clear();
    __setMockRedis(null);
  });

  describe('resolveCategory', () => {
    it('returns "auth" for /auth prefixed routes', () => {
      expect(resolveCategory('/auth/login', DEFAULT_ROUTE_CATEGORIES)).toBe('auth');
      expect(resolveCategory('/auth/refresh', DEFAULT_ROUTE_CATEGORIES)).toBe('auth');
    });

    it('returns "scanner" for /scanner prefixed routes', () => {
      expect(resolveCategory('/scanner/checkin', DEFAULT_ROUTE_CATEGORIES)).toBe('scanner');
    });

    it('returns "scanner" for /checkin prefixed routes', () => {
      expect(resolveCategory('/checkin/verify', DEFAULT_ROUTE_CATEGORIES)).toBe('scanner');
    });

    it('returns "general" for unmatched routes', () => {
      expect(resolveCategory('/api/guests', DEFAULT_ROUTE_CATEGORIES)).toBe('general');
      expect(resolveCategory('/events', DEFAULT_ROUTE_CATEGORIES)).toBe('general');
    });
  });

  describe('buildRateLimitKey', () => {
    it('builds key with prefix, category, and identifier', () => {
      expect(buildRateLimitKey('rl:', 'general', '127.0.0.1')).toBe('rl:general:127.0.0.1');
      expect(buildRateLimitKey('rl:', 'auth', 'tenant1:user1')).toBe('rl:auth:tenant1:user1');
    });
  });

  describe('rate limiting enforcement', () => {
    it('allows requests under the limit and sets rate limit headers', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/test',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['x-ratelimit-limit']).toBe('100');
      expect(response.headers['x-ratelimit-remaining']).toBe('99');
    });

    it('returns 429 when general rate limit is exceeded', async () => {
      // Exhaust the general limit (100 requests)
      for (let i = 0; i < 100; i++) {
        await app.inject({ method: 'GET', url: '/api/test' });
      }

      // 101st request should be rejected
      const response = await app.inject({
        method: 'GET',
        url: '/api/test',
      });

      expect(response.statusCode).toBe(429);
      expect(response.headers['retry-after']).toBeDefined();
      expect(response.headers['x-ratelimit-remaining']).toBe('0');

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(body.retryAfter).toBeGreaterThan(0);
    });

    it('applies auth rate limit (20 req/min) to /auth routes', async () => {
      // Exhaust the auth limit (20 requests)
      for (let i = 0; i < 20; i++) {
        await app.inject({ method: 'POST', url: '/auth/login' });
      }

      // 21st request should be rejected
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
      });

      expect(response.statusCode).toBe(429);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('applies scanner rate limit (300 req/min) to /scanner routes', async () => {
      // Make 300 requests (should all pass)
      for (let i = 0; i < 300; i++) {
        const res = await app.inject({ method: 'POST', url: '/scanner/checkin' });
        expect(res.statusCode).toBe(200);
      }

      // 301st request should be rejected
      const response = await app.inject({
        method: 'POST',
        url: '/scanner/checkin',
      });

      expect(response.statusCode).toBe(429);
    });

    it('skips rate limiting for /health endpoint', async () => {
      // Even with Redis down, health should work
      __setMockRedis(null);

      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['x-ratelimit-limit']).toBeUndefined();
    });

    it('skips rate limiting for OPTIONS requests', async () => {
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/api/test',
      });

      // OPTIONS may return 404 since no OPTIONS handler is registered,
      // but it should NOT have rate limit headers
      expect(response.headers['x-ratelimit-limit']).toBeUndefined();
    });
  });

  describe('graceful degradation', () => {
    it('allows requests through when Redis client is null', async () => {
      __setMockRedis(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/test',
      });

      expect(response.statusCode).toBe(200);
      // No rate limit headers when Redis is unavailable
      expect(response.headers['x-ratelimit-limit']).toBeUndefined();
    });

    it('allows requests through when Redis operation fails', async () => {
      // Create a Redis mock that always fails
      const failingRedis = {
        multi: () => ({
          incr: () => ({ ttl: () => ({ exec: async () => null }) }),
          ttl: () => ({ exec: async () => null }),
          exec: async () => null,
        }),
        expire: async () => 0,
      };
      __setMockRedis(failingRedis);

      const response = await app.inject({
        method: 'GET',
        url: '/api/test',
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('429 response format', () => {
    it('includes Retry-After header in 429 response', async () => {
      // Exhaust auth limit
      for (let i = 0; i < 20; i++) {
        await app.inject({ method: 'POST', url: '/auth/login' });
      }

      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
      });

      expect(response.statusCode).toBe(429);
      const retryAfter = parseInt(response.headers['retry-after'] as string, 10);
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(60);
    });

    it('includes structured error body in 429 response', async () => {
      // Exhaust auth limit
      for (let i = 0; i < 20; i++) {
        await app.inject({ method: 'POST', url: '/auth/login' });
      }

      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
      });

      const body = JSON.parse(response.body);
      expect(body).toEqual({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: expect.stringContaining('20 requests per 60 seconds'),
        },
        retryAfter: expect.any(Number),
      });
    });
  });
});
