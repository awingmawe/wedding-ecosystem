import { describe, it, expect, beforeEach } from 'vitest';
import { FastifyRequest, FastifyReply } from 'fastify';
import {
  createRateLimiterMiddleware,
  InMemoryRateLimiterStore,
  RATE_LIMITER_CONSTANTS,
} from './rate-limiter.middleware';
import { ErrorCode } from '@wedding/shared';
import { AuthenticatedRequest } from './tenant-isolation.middleware';

// --- Test Helpers ---

function createMockRequest(tenantId?: string, ip = '127.0.0.1'): FastifyRequest {
  const req = {
    ip,
    headers: {},
  } as unknown as FastifyRequest;

  if (tenantId) {
    (req as any).user = {
      id: 'user-1',
      tenant_id: tenantId,
      role: 'client',
      email: 'test@example.com',
    };
  }

  return req;
}

function createMockReply(): FastifyReply & {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
} {
  const state = {
    statusCode: 200,
    body: null as unknown,
    headers: {} as Record<string, string>,
  };

  const reply = {
    get statusCode() {
      return state.statusCode;
    },
    get body() {
      return state.body;
    },
    get headers() {
      return state.headers;
    },
    status(code: number) {
      state.statusCode = code;
      return reply;
    },
    send(body: unknown) {
      state.body = body;
      return reply;
    },
    header(key: string, value: string) {
      state.headers[key] = value;
      return reply;
    },
  } as unknown as FastifyReply & {
    statusCode: number;
    body: unknown;
    headers: Record<string, string>;
  };

  return reply;
}

// --- Tests ---

describe('Rate Limiter Middleware', () => {
  let store: InMemoryRateLimiterStore;

  beforeEach(() => {
    store = new InMemoryRateLimiterStore();
  });

  describe('createRateLimiterMiddleware', () => {
    it('should allow requests under the limit', async () => {
      const middleware = createRateLimiterMiddleware(store, { maxRequests: 5 });
      const request = createMockRequest('tenant-1');
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.statusCode).toBe(200);
      expect(reply.headers['X-RateLimit-Limit']).toBe('5');
      expect(reply.headers['X-RateLimit-Remaining']).toBe('4');
    });

    it('should return 429 when limit is exceeded', async () => {
      const middleware = createRateLimiterMiddleware(store, { maxRequests: 3 });
      const request = createMockRequest('tenant-1');

      // Make 3 requests (at limit)
      for (let i = 0; i < 3; i++) {
        const reply = createMockReply();
        await middleware(request, reply);
        expect(reply.statusCode).toBe(200);
      }

      // 4th request should be rejected
      const reply = createMockReply();
      await middleware(request, reply);

      expect(reply.statusCode).toBe(429);
      expect(reply.body).toEqual({
        success: false,
        error: {
          code: ErrorCode.RATE_LIMIT_EXCEEDED,
          message: expect.stringContaining('Batas permintaan terlampaui'),
        },
      });
      expect(reply.headers['Retry-After']).toBeDefined();
      expect(reply.headers['X-RateLimit-Remaining']).toBe('0');
    });

    it('should track limits per tenant independently', async () => {
      const middleware = createRateLimiterMiddleware(store, { maxRequests: 2 });

      const request1 = createMockRequest('tenant-1');
      const request2 = createMockRequest('tenant-2');

      // Exhaust tenant-1 limit
      await middleware(request1, createMockReply());
      await middleware(request1, createMockReply());

      // tenant-1 should be blocked
      const reply1 = createMockReply();
      await middleware(request1, reply1);
      expect(reply1.statusCode).toBe(429);

      // tenant-2 should still be allowed
      const reply2 = createMockReply();
      await middleware(request2, reply2);
      expect(reply2.statusCode).toBe(200);
    });

    it('should use IP-based limiting for unauthenticated requests', async () => {
      const middleware = createRateLimiterMiddleware(store, { maxRequests: 2 });

      const request = createMockRequest(undefined, '192.168.1.1');

      await middleware(request, createMockReply());
      await middleware(request, createMockReply());

      const reply = createMockReply();
      await middleware(request, reply);
      expect(reply.statusCode).toBe(429);
    });

    it('should use default config of 100 requests per minute', () => {
      expect(RATE_LIMITER_CONSTANTS.DEFAULT_MAX_REQUESTS).toBe(100);
      expect(RATE_LIMITER_CONSTANTS.DEFAULT_WINDOW_SECONDS).toBe(60);
    });

    it('should set rate limit headers on every response', async () => {
      const middleware = createRateLimiterMiddleware(store, { maxRequests: 10 });
      const request = createMockRequest('tenant-1');
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.headers['X-RateLimit-Limit']).toBe('10');
      expect(reply.headers['X-RateLimit-Remaining']).toBe('9');
    });

    it('should decrement remaining count with each request', async () => {
      const middleware = createRateLimiterMiddleware(store, { maxRequests: 5 });
      const request = createMockRequest('tenant-1');

      const reply1 = createMockReply();
      await middleware(request, reply1);
      expect(reply1.headers['X-RateLimit-Remaining']).toBe('4');

      const reply2 = createMockReply();
      await middleware(request, reply2);
      expect(reply2.headers['X-RateLimit-Remaining']).toBe('3');

      const reply3 = createMockReply();
      await middleware(request, reply3);
      expect(reply3.headers['X-RateLimit-Remaining']).toBe('2');
    });
  });

  describe('InMemoryRateLimiterStore', () => {
    it('should increment count for new keys', async () => {
      const count = await store.increment('key1', 60);
      expect(count).toBe(1);
    });

    it('should increment count for existing keys', async () => {
      await store.increment('key1', 60);
      const count = await store.increment('key1', 60);
      expect(count).toBe(2);
    });

    it('should reset count after window expires', async () => {
      // Use a very short window
      const shortStore = new InMemoryRateLimiterStore();
      await shortStore.increment('key1', 0); // 0 second window

      // Wait a tick for expiry
      await new Promise((resolve) => setTimeout(resolve, 10));

      const count = await shortStore.increment('key1', 60);
      expect(count).toBe(1); // Reset
    });

    it('should return TTL for existing keys', async () => {
      await store.increment('key1', 60);
      const ttl = await store.getTTL('key1');
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60);
    });

    it('should return -1 TTL for non-existent keys', async () => {
      const ttl = await store.getTTL('nonexistent');
      expect(ttl).toBe(-1);
    });

    it('should clear all entries', async () => {
      await store.increment('key1', 60);
      await store.increment('key2', 60);
      store.clear();

      const count = await store.increment('key1', 60);
      expect(count).toBe(1);
    });
  });
});
