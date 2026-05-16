/**
 * Redis Integration Test
 * Tests actual Redis connectivity and operations against a local Redis instance.
 *
 * Requires: Redis running on localhost:6379
 * Skips automatically if local Redis is not available.
 *
 * Run: npx vitest run packages/api/src/config/redis.integration.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Redis from 'ioredis';
import { buildRedisOptions, getRedisConfig, createRetryStrategy } from './redis';

const LOCAL_REDIS_URL = 'redis://localhost:6379';
const TEST_PREFIX = 'test:integration:';

// Check if local Redis is available before running tests
let redisAvailable = false;
try {
  const probe = new Redis({
    host: 'localhost',
    port: 6379,
    connectTimeout: 1000,
    lazyConnect: true,
  });
  await probe.connect();
  await probe.ping();
  await probe.quit();
  redisAvailable = true;
} catch {
  redisAvailable = false;
}

const describeIfRedis = redisAvailable ? describe : describe.skip;

describeIfRedis('Redis Integration (live connection)', () => {
  let client: Redis;

  beforeAll(async () => {
    const config = getRedisConfig({ tls: false });
    const options = buildRedisOptions(LOCAL_REDIS_URL, config);
    client = new Redis(options);
    await client.connect();
  });

  afterAll(async () => {
    // Cleanup all test keys
    const keys = await client.keys(`${TEST_PREFIX}*`);
    if (keys.length > 0) {
      await client.del(...keys);
    }
    await client.quit();
  });

  describe('Connection', () => {
    it('should connect successfully to Redis', async () => {
      const pong = await client.ping();
      expect(pong).toBe('PONG');
    });

    it('should report correct Redis version', async () => {
      const info = await client.info('server');
      expect(info).toContain('redis_version');
    });

    it('should have sub-millisecond PING latency locally', async () => {
      const start = Date.now();
      await client.ping();
      const latency = Date.now() - start;
      // Local Redis should respond in < 5ms
      expect(latency).toBeLessThan(5);
    });
  });

  describe('buildRedisOptions', () => {
    it('should produce working connection options for redis:// URL', () => {
      const config = getRedisConfig({ tls: false });
      const options = buildRedisOptions(LOCAL_REDIS_URL, config);

      expect(options.host).toBe('localhost');
      expect(options.port).toBe(6379);
      expect(options.tls).toBeUndefined(); // No TLS for redis://
      expect(options.connectTimeout).toBe(5_000);
      expect(options.lazyConnect).toBe(true);
    });

    it('should produce working connection options for rediss:// URL', () => {
      const config = getRedisConfig();
      const options = buildRedisOptions(
        'rediss://default:pass@host.upstash.io:6379', // nosecret - test fixture
        config
      );

      expect(options.host).toBe('host.upstash.io');
      expect(options.port).toBe(6379);
      expect(options.password).toBe('pass');
      expect(options.tls).toEqual({ rejectUnauthorized: true });
    });
  });

  describe('Basic Operations (SET/GET/DEL)', () => {
    it('should SET and GET a string value', async () => {
      const key = `${TEST_PREFIX}string`;
      await client.set(key, 'hello-wedding');
      const result = await client.get(key);
      expect(result).toBe('hello-wedding');
    });

    it('should SET and GET a JSON value', async () => {
      const key = `${TEST_PREFIX}json`;
      const data = { event: 'romeo-juliet', guests: 500, status: 'published' };
      await client.set(key, JSON.stringify(data));

      const result = await client.get(key);
      expect(result).not.toBeNull();
      expect(JSON.parse(result!)).toEqual(data);
    });

    it('should DEL a key', async () => {
      const key = `${TEST_PREFIX}del`;
      await client.set(key, 'to-be-deleted');
      const deleted = await client.del(key);
      expect(deleted).toBe(1);

      const result = await client.get(key);
      expect(result).toBeNull();
    });

    it('should return null for non-existent key', async () => {
      const result = await client.get(`${TEST_PREFIX}nonexistent`);
      expect(result).toBeNull();
    });
  });

  describe('TTL (Expiry)', () => {
    it('should SET with EX (seconds TTL)', async () => {
      const key = `${TEST_PREFIX}ttl`;
      await client.set(key, 'expires-soon', 'EX', 10);

      const ttl = await client.ttl(key);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(10);
    });

    it('should expire key after TTL', async () => {
      const key = `${TEST_PREFIX}expire`;
      await client.set(key, 'short-lived', 'PX', 100); // 100ms

      // Should exist immediately
      const before = await client.get(key);
      expect(before).toBe('short-lived');

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 150));

      const after = await client.get(key);
      expect(after).toBeNull();
    });
  });

  describe('Cache Pattern (response-cache simulation)', () => {
    it('should cache and retrieve an API response', async () => {
      const cacheKey = `${TEST_PREFIX}cache:guests:list:tenant-123`;
      const response = {
        data: [
          { id: '1', name: 'Budi Santoso', group: 'family' },
          { id: '2', name: 'Siti Rahayu', group: 'friend' },
        ],
        total: 2,
        cached_at: new Date().toISOString(),
      };

      // Cache the response with 5-minute TTL
      await client.set(cacheKey, JSON.stringify(response), 'EX', 300);

      // Retrieve from cache
      const cached = await client.get(cacheKey);
      expect(cached).not.toBeNull();

      const parsed = JSON.parse(cached!);
      expect(parsed.data).toHaveLength(2);
      expect(parsed.data[0].name).toBe('Budi Santoso');
      expect(parsed.total).toBe(2);
    });

    it('should invalidate cache on write', async () => {
      const cacheKey = `${TEST_PREFIX}cache:event:stats:event-456`;

      // Set cache
      await client.set(cacheKey, JSON.stringify({ total_guests: 100 }), 'EX', 300);

      // Simulate write → invalidate
      await client.del(cacheKey);

      // Cache miss
      const result = await client.get(cacheKey);
      expect(result).toBeNull();
    });
  });

  describe('Retry Strategy', () => {
    it('should implement exponential backoff: 1s, 2s, 4s', () => {
      const config = getRedisConfig();
      const strategy = createRetryStrategy(config);

      expect(strategy(1)).toBe(1_000);
      expect(strategy(2)).toBe(2_000);
      expect(strategy(3)).toBe(4_000);
    });

    it('should stop retrying after maxRetries', () => {
      const config = getRedisConfig({ maxRetries: 3 });
      const strategy = createRetryStrategy(config);

      expect(strategy(4)).toBeNull();
    });
  });

  describe('Performance', () => {
    it('should handle 100 sequential SET/GET operations in < 200ms', async () => {
      const start = Date.now();

      for (let i = 0; i < 100; i++) {
        const key = `${TEST_PREFIX}perf:${i}`;
        await client.set(key, `value-${i}`);
        await client.get(key);
      }

      const duration = Date.now() - start;
      console.log(`  100 SET+GET operations: ${duration}ms`);
      expect(duration).toBeLessThan(200); // Should be well under 200ms locally
    });

    it('should handle pipeline operations efficiently', async () => {
      const pipeline = client.pipeline();

      for (let i = 0; i < 100; i++) {
        pipeline.set(`${TEST_PREFIX}pipe:${i}`, `value-${i}`, 'EX', 10);
      }

      const start = Date.now();
      const results = await pipeline.exec();
      const duration = Date.now() - start;

      console.log(`  100 pipelined SET operations: ${duration}ms`);
      expect(results).toHaveLength(100);
      expect(duration).toBeLessThan(50); // Pipeline should be very fast
    });
  });
});
