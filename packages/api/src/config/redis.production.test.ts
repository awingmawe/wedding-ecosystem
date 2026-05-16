/**
 * Production Redis Connection Test (Upstash)
 *
 * Tests connectivity and operations against the production Upstash Redis instance.
 * Requires UPSTASH_REDIS_CACHE_URL to be set with the production rediss:// URL.
 *
 * Run:
 *   UPSTASH_REDIS_CACHE_URL="rediss://..." npx vitest run packages/api/src/config/redis.production.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Redis from 'ioredis';
import { buildRedisOptions, getRedisConfig } from './redis';

const PROD_REDIS_URL = process.env.UPSTASH_REDIS_CACHE_URL;
const TEST_PREFIX = 'test:prod-check:';

// Skip entire suite if production URL not provided
const describeIfProd = PROD_REDIS_URL?.startsWith('rediss://') ? describe : describe.skip;

describeIfProd('Production Redis (Upstash) - Live Connection', () => {
  let client: Redis;

  beforeAll(async () => {
    const config = getRedisConfig(); // TLS enabled by default
    const options = buildRedisOptions(PROD_REDIS_URL!, config);
    client = new Redis(options);
    await client.connect();
  });

  afterAll(async () => {
    // Cleanup test keys
    const keys = await client.keys(`${TEST_PREFIX}*`);
    if (keys.length > 0) {
      await client.del(...keys);
    }
    await client.quit();
  });

  describe('Connection & TLS', () => {
    it('should connect to Upstash via TLS (rediss://)', async () => {
      const pong = await client.ping();
      expect(pong).toBe('PONG');
    });

    it('should report Redis server info', async () => {
      const info = await client.info('server');
      expect(info).toContain('redis_version');
      const version = info.match(/redis_version:(.+)/)?.[1]?.trim();
      console.log(`  Upstash Redis version: ${version}`);
    });

    it('should have acceptable latency (< 200ms for remote)', async () => {
      const start = Date.now();
      await client.ping();
      const latency = Date.now() - start;
      console.log(`  Single PING latency: ${latency}ms`);
      // Upstash from Asia should be < 200ms
      expect(latency).toBeLessThan(200);
    });
  });

  describe('Basic Operations', () => {
    it('should SET and GET a value', async () => {
      await client.set(`${TEST_PREFIX}basic`, 'hello-upstash', 'EX', 30);
      const val = await client.get(`${TEST_PREFIX}basic`);
      expect(val).toBe('hello-upstash');
    });

    it('should SET and GET JSON (cache pattern)', async () => {
      const data = {
        event_id: 'test-event',
        guests: [{ name: 'Budi', group: 'family' }],
        cached_at: new Date().toISOString(),
      };
      await client.set(`${TEST_PREFIX}json`, JSON.stringify(data), 'EX', 30);

      const raw = await client.get(`${TEST_PREFIX}json`);
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!);
      expect(parsed.event_id).toBe('test-event');
      expect(parsed.guests[0].name).toBe('Budi');
    });

    it('should DEL a key', async () => {
      await client.set(`${TEST_PREFIX}todelete`, 'bye', 'EX', 30);
      const deleted = await client.del(`${TEST_PREFIX}todelete`);
      expect(deleted).toBe(1);

      const val = await client.get(`${TEST_PREFIX}todelete`);
      expect(val).toBeNull();
    });

    it('should return null for non-existent key', async () => {
      const val = await client.get(`${TEST_PREFIX}does-not-exist-xyz`);
      expect(val).toBeNull();
    });
  });

  describe('TTL & Expiry', () => {
    it('should set TTL correctly', async () => {
      await client.set(`${TEST_PREFIX}ttl`, 'expires', 'EX', 60);
      const ttl = await client.ttl(`${TEST_PREFIX}ttl`);
      expect(ttl).toBeGreaterThan(50);
      expect(ttl).toBeLessThanOrEqual(60);
    });
  });

  describe('Performance Benchmarks', () => {
    it('should complete 10 sequential SET+GET in acceptable time', async () => {
      const start = Date.now();
      for (let i = 0; i < 10; i++) {
        await client.set(`${TEST_PREFIX}perf:${i}`, `val-${i}`, 'EX', 30);
        await client.get(`${TEST_PREFIX}perf:${i}`);
      }
      const duration = Date.now() - start;
      console.log(`  10 sequential SET+GET: ${duration}ms (avg ${Math.round(duration / 10)}ms/op)`);
      // Remote Redis: should be < 2000ms for 10 ops (< 200ms per op)
      expect(duration).toBeLessThan(2000);
    });

    it('should complete pipeline operations efficiently', async () => {
      const pipeline = client.pipeline();
      for (let i = 0; i < 20; i++) {
        pipeline.set(`${TEST_PREFIX}pipe:${i}`, `val-${i}`, 'EX', 30);
      }

      const start = Date.now();
      const results = await pipeline.exec();
      const duration = Date.now() - start;

      console.log(`  20 pipelined SET: ${duration}ms`);
      expect(results).toHaveLength(20);
      // Pipeline should batch into 1 round-trip
      expect(duration).toBeLessThan(500);
    });

    it('should measure average latency over 10 PINGs', async () => {
      const latencies: number[] = [];
      for (let i = 0; i < 10; i++) {
        const s = Date.now();
        await client.ping();
        latencies.push(Date.now() - s);
      }
      const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
      const min = Math.min(...latencies);
      const max = Math.max(...latencies);
      const p95 = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)];

      console.log(`  Latency: avg=${avg}ms, min=${min}ms, max=${max}ms, p95=${p95}ms`);
      // Should be under 200ms average for Upstash
      expect(avg).toBeLessThan(200);
    });
  });

  describe('Memory & Limits', () => {
    it('should report memory usage', async () => {
      const info = await client.info('memory');
      const usedMemory = info.match(/used_memory_human:(.+)/)?.[1]?.trim();
      const maxMemory = info.match(/maxmemory_human:(.+)/)?.[1]?.trim();
      console.log(`  Memory: used=${usedMemory}, max=${maxMemory}`);
      expect(usedMemory).toBeDefined();
    });

    it('should report connected clients', async () => {
      const info = await client.info('clients');
      const connected = info.match(/connected_clients:(\d+)/)?.[1];
      console.log(`  Connected clients: ${connected}`);
      expect(parseInt(connected || '0')).toBeGreaterThan(0);
    });
  });
});
