import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import {
  responseCache,
  patternToRegex,
  matchesPattern,
  findCacheRoute,
  shouldInvalidate,
  buildCacheKey,
  DEFAULT_CACHE_ROUTES,
  DEFAULT_INVALIDATION_RULES,
  RESPONSE_CACHE_CONSTANTS,
} from './response-cache';

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

const { __setMockRedis } = (await import('../config/redis')) as any;

/**
 * Creates a mock Redis client for response cache testing.
 */
function createMockRedis() {
  const store = new Map<string, { value: string; expiresAt: number }>();

  return {
    get: async (key: string): Promise<string | null> => {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt > 0 && entry.expiresAt <= Date.now()) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    set: async (key: string, value: string, mode?: string, ttl?: number): Promise<'OK'> => {
      const expiresAt = mode === 'EX' && ttl ? Date.now() + ttl * 1000 : 0;
      store.set(key, { value, expiresAt });
      return 'OK';
    },
    del: async (...keys: string[]): Promise<number> => {
      let deleted = 0;
      for (const key of keys) {
        if (store.delete(key)) deleted++;
      }
      return deleted;
    },
    scan: async (
      cursor: string,
      _match: string,
      pattern: string,
      _count: string,
      _countVal: number
    ): Promise<[string, string[]]> => {
      // Simple scan implementation for testing
      const matchingKeys: string[] = [];
      const regexPattern = pattern.replace(/\*/g, '.*');
      const regex = new RegExp(`^${regexPattern}$`);

      for (const key of store.keys()) {
        if (regex.test(key)) {
          matchingKeys.push(key);
        }
      }

      return ['0', matchingKeys];
    },
    _store: store,
    _clear: () => store.clear(),
  };
}

describe('Response Cache Plugin', () => {
  let app: FastifyInstance;
  let mockRedis: ReturnType<typeof createMockRedis>;

  beforeEach(async () => {
    mockRedis = createMockRedis();
    __setMockRedis(mockRedis);

    app = Fastify();
    await app.register(responseCache, {
      cacheRoutes: DEFAULT_CACHE_ROUTES,
      invalidationRules: DEFAULT_INVALIDATION_RULES,
    });

    // Simulate authenticated user by decorating request
    app.addHook('onRequest', async (request) => {
      (request as any).user = { tenant_id: 'tenant-1', id: 'user-1' };
    });

    // Register test routes
    app.get('/events/current', async () => ({ id: 'evt-1', name: 'Wedding' }));
    app.get('/events/:id/stats', async () => ({ total_guests: 100 }));
    app.get('/events/:id/sections', async () => ({ sections: [] }));
    app.get('/cms/sections/:eventId', async () => ({ data: [] }));
    app.get('/cms/sections/:eventId/:sectionId', async () => ({ id: 'sec-1' }));
    app.get('/guests', async () => ({ data: [], pagination: {} }));
    app.get('/guests/search', async () => ({ data: [] }));
    app.post('/guests', async () => ({ id: 'guest-1' }));
    app.put('/guests/:id', async () => ({ id: 'guest-1', name: 'Updated' }));
    app.put('/events/:id/sections/:sectionId/content', async () => ({ updated: true }));
    app.put('/events/:id/sections/:sectionId/toggle', async () => ({ updated: true }));
    app.put('/cms/sections/:eventId/:sectionId/content', async () => ({ updated: true }));
    app.get('/other/route', async () => ({ not: 'cached' }));

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    mockRedis._clear();
    __setMockRedis(null);
  });

  describe('patternToRegex', () => {
    it('converts simple path to regex', () => {
      const regex = patternToRegex('/events/current');
      expect(regex.test('/events/current')).toBe(true);
      expect(regex.test('/events/other')).toBe(false);
    });

    it('converts path with params to regex', () => {
      const regex = patternToRegex('/events/:id/stats');
      expect(regex.test('/events/abc-123/stats')).toBe(true);
      expect(regex.test('/events/xyz/stats')).toBe(true);
      expect(regex.test('/events/stats')).toBe(false);
    });

    it('converts path with multiple params', () => {
      const regex = patternToRegex('/cms/sections/:eventId/:sectionId');
      expect(regex.test('/cms/sections/evt-1/sec-1')).toBe(true);
      expect(regex.test('/cms/sections/evt-1')).toBe(false);
    });
  });

  describe('matchesPattern', () => {
    it('matches URL against pattern', () => {
      expect(matchesPattern('/events/current', '/events/current')).toBe(true);
      expect(matchesPattern('/events/abc/stats', '/events/:id/stats')).toBe(true);
    });

    it('strips query string before matching', () => {
      expect(matchesPattern('/guests?page=1&per_page=50', '/guests')).toBe(true);
      expect(matchesPattern('/guests/search?q=test', '/guests/search')).toBe(true);
    });

    it('returns false for non-matching URLs', () => {
      expect(matchesPattern('/other/route', '/events/current')).toBe(false);
    });
  });

  describe('findCacheRoute', () => {
    it('finds matching cache route for GET requests', () => {
      const route = findCacheRoute('/events/current', 'GET', DEFAULT_CACHE_ROUTES);
      expect(route).not.toBeNull();
      expect(route!.ttlSeconds).toBe(300);
    });

    it('finds guest list route with 60s TTL', () => {
      const route = findCacheRoute('/guests', 'GET', DEFAULT_CACHE_ROUTES);
      expect(route).not.toBeNull();
      expect(route!.ttlSeconds).toBe(60);
    });

    it('returns null for non-GET methods by default', () => {
      const route = findCacheRoute('/events/current', 'POST', DEFAULT_CACHE_ROUTES);
      expect(route).toBeNull();
    });

    it('returns null for unconfigured routes', () => {
      const route = findCacheRoute('/other/route', 'GET', DEFAULT_CACHE_ROUTES);
      expect(route).toBeNull();
    });
  });

  describe('shouldInvalidate', () => {
    it('detects guest write operations', () => {
      const rule = shouldInvalidate('/guests', 'POST', DEFAULT_INVALIDATION_RULES);
      expect(rule).not.toBeNull();
      expect(rule!.invalidatePatterns).toContain('guests:');
    });

    it('detects CMS section content update', () => {
      const rule = shouldInvalidate(
        '/cms/sections/evt-1/sec-1/content',
        'PUT',
        DEFAULT_INVALIDATION_RULES
      );
      expect(rule).not.toBeNull();
      expect(rule!.invalidatePatterns).toContain('cms:');
    });

    it('detects event section toggle', () => {
      const rule = shouldInvalidate(
        '/events/evt-1/sections/sec-1/toggle',
        'PUT',
        DEFAULT_INVALIDATION_RULES
      );
      expect(rule).not.toBeNull();
      expect(rule!.invalidatePatterns).toContain('events:');
    });

    it('returns null for GET requests', () => {
      const rule = shouldInvalidate('/guests', 'GET', DEFAULT_INVALIDATION_RULES);
      expect(rule).toBeNull();
    });
  });

  describe('buildCacheKey', () => {
    it('builds key with prefix, category, tenant, and URL', () => {
      const key = buildCacheKey('rc:', '/events/current', '/events/current', 'tenant-1');
      expect(key).toBe('rc:events:tenant-1:/events/current');
    });

    it('includes query params in key for uniqueness', () => {
      const key = buildCacheKey('rc:', '/guests', '/guests?page=1&per_page=50', 'tenant-1');
      expect(key).toBe('rc:guests:tenant-1:/guests?page=1&per_page=50');
    });

    it('uses "anonymous" when no tenant provided', () => {
      const key = buildCacheKey('rc:', '/events/current', '/events/current');
      expect(key).toBe('rc:events:anonymous:/events/current');
    });
  });

  describe('cache behavior', () => {
    it('returns MISS on first request and HIT on second', async () => {
      // First request — cache miss
      const res1 = await app.inject({ method: 'GET', url: '/events/current' });
      expect(res1.statusCode).toBe(200);
      expect(res1.headers['x-cache']).toBe('MISS');

      // Second request — cache hit
      const res2 = await app.inject({ method: 'GET', url: '/events/current' });
      expect(res2.statusCode).toBe(200);
      expect(res2.headers['x-cache']).toBe('HIT');
    });

    it('serves cached response body correctly', async () => {
      // First request
      const res1 = await app.inject({ method: 'GET', url: '/events/current' });
      const body1 = JSON.parse(res1.body);

      // Second request (from cache)
      const res2 = await app.inject({ method: 'GET', url: '/events/current' });
      const body2 = JSON.parse(res2.body);

      expect(body1).toEqual(body2);
      expect(body2).toEqual({ id: 'evt-1', name: 'Wedding' });
    });

    it('caches event details with 5 min TTL', async () => {
      await app.inject({ method: 'GET', url: '/events/current' });

      // Verify the stored entry has correct TTL
      const keys = Array.from(mockRedis._store.keys());
      const eventKey = keys.find((k) => k.includes('events:'));
      expect(eventKey).toBeDefined();

      const entry = mockRedis._store.get(eventKey!);
      expect(entry).toBeDefined();
      // TTL should be approximately 300 seconds from now
      const ttlMs = entry!.expiresAt - Date.now();
      expect(ttlMs).toBeGreaterThan(299_000);
      expect(ttlMs).toBeLessThanOrEqual(300_000);
    });

    it('caches guest list with 1 min TTL', async () => {
      await app.inject({ method: 'GET', url: '/guests' });

      const keys = Array.from(mockRedis._store.keys());
      const guestKey = keys.find((k) => k.includes('guests:'));
      expect(guestKey).toBeDefined();

      const entry = mockRedis._store.get(guestKey!);
      const ttlMs = entry!.expiresAt - Date.now();
      expect(ttlMs).toBeGreaterThan(59_000);
      expect(ttlMs).toBeLessThanOrEqual(60_000);
    });

    it('does not cache non-configured routes', async () => {
      const res = await app.inject({ method: 'GET', url: '/other/route' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['x-cache']).toBeUndefined();

      // No cache entries should exist for this route
      const keys = Array.from(mockRedis._store.keys());
      expect(keys.length).toBe(0);
    });

    it('does not cache POST requests', async () => {
      const res = await app.inject({ method: 'POST', url: '/guests', payload: {} });
      expect(res.headers['x-cache']).toBeUndefined();
    });

    it('includes X-Cache-Age header on cache hit', async () => {
      await app.inject({ method: 'GET', url: '/events/current' });

      const res = await app.inject({ method: 'GET', url: '/events/current' });
      expect(res.headers['x-cache']).toBe('HIT');
      expect(res.headers['x-cache-age']).toBeDefined();
      const age = parseInt(res.headers['x-cache-age'] as string, 10);
      expect(age).toBeGreaterThanOrEqual(0);
    });
  });

  describe('cache invalidation', () => {
    it('invalidates guest cache on POST /guests', async () => {
      // Populate cache
      await app.inject({ method: 'GET', url: '/guests' });
      const res1 = await app.inject({ method: 'GET', url: '/guests' });
      expect(res1.headers['x-cache']).toBe('HIT');

      // Write operation triggers invalidation
      await app.inject({ method: 'POST', url: '/guests', payload: {} });

      // Cache should be cleared
      const res2 = await app.inject({ method: 'GET', url: '/guests' });
      expect(res2.headers['x-cache']).toBe('MISS');
    });

    it('invalidates guest cache on PUT /guests/:id', async () => {
      // Populate cache
      await app.inject({ method: 'GET', url: '/guests' });
      await app.inject({ method: 'GET', url: '/guests' }); // confirm HIT

      // Update a guest
      await app.inject({ method: 'PUT', url: '/guests/guest-1', payload: { name: 'New' } });

      // Cache should be cleared
      const res = await app.inject({ method: 'GET', url: '/guests' });
      expect(res.headers['x-cache']).toBe('MISS');
    });

    it('invalidates CMS cache on section content update', async () => {
      // Populate CMS cache
      await app.inject({ method: 'GET', url: '/cms/sections/evt-1' });
      const hit = await app.inject({ method: 'GET', url: '/cms/sections/evt-1' });
      expect(hit.headers['x-cache']).toBe('HIT');

      // Update section content
      await app.inject({
        method: 'PUT',
        url: '/cms/sections/evt-1/sec-1/content',
        payload: { content: {} },
      });

      // CMS cache should be invalidated
      const res = await app.inject({ method: 'GET', url: '/cms/sections/evt-1' });
      expect(res.headers['x-cache']).toBe('MISS');
    });

    it('invalidates event cache on section toggle', async () => {
      // Populate event sections cache
      await app.inject({ method: 'GET', url: '/events/evt-1/sections' });
      const hit = await app.inject({ method: 'GET', url: '/events/evt-1/sections' });
      expect(hit.headers['x-cache']).toBe('HIT');

      // Toggle section
      await app.inject({
        method: 'PUT',
        url: '/events/evt-1/sections/sec-1/toggle',
        payload: { is_active: false },
      });

      // Event cache should be invalidated
      const res = await app.inject({ method: 'GET', url: '/events/evt-1/sections' });
      expect(res.headers['x-cache']).toBe('MISS');
    });
  });

  describe('multi-tenant isolation', () => {
    it('caches separately per tenant', async () => {
      // Request as tenant-1
      await app.inject({ method: 'GET', url: '/events/current' });

      // Verify key includes tenant-1
      const keys = Array.from(mockRedis._store.keys());
      expect(keys.some((k) => k.includes('tenant-1'))).toBe(true);
      expect(keys.some((k) => k.includes('tenant-2'))).toBe(false);
    });
  });

  describe('graceful degradation', () => {
    it('passes through when Redis is null', async () => {
      __setMockRedis(null);

      const res = await app.inject({ method: 'GET', url: '/events/current' });
      expect(res.statusCode).toBe(200);
      // No cache headers when Redis is unavailable (plugin skips entirely)
      expect(res.headers['x-cache']).toBeUndefined();
    });

    it('passes through when Redis get fails', async () => {
      const failingRedis = {
        get: async () => {
          throw new Error('Connection refused');
        },
        set: async () => {
          throw new Error('Connection refused');
        },
        del: async () => 0,
        scan: async () => ['0', []] as [string, string[]],
      };
      __setMockRedis(failingRedis);

      const res = await app.inject({ method: 'GET', url: '/events/current' });
      expect(res.statusCode).toBe(200);
      // Should still serve the response from the handler
      const body = JSON.parse(res.body);
      expect(body).toEqual({ id: 'evt-1', name: 'Wedding' });
    });
  });

  describe('constants', () => {
    it('exports correct TTL values', () => {
      expect(RESPONSE_CACHE_CONSTANTS.TTL_EVENT_DETAILS).toBe(300);
      expect(RESPONSE_CACHE_CONSTANTS.TTL_CMS_SECTIONS).toBe(300);
      expect(RESPONSE_CACHE_CONSTANTS.TTL_GUEST_LIST).toBe(60);
      expect(RESPONSE_CACHE_CONSTANTS.DEFAULT_KEY_PREFIX).toBe('rc:');
    });
  });
});
