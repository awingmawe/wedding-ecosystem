import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  buildRedisOptions,
  cacheDel,
  cacheGet,
  cacheSet,
  createRetryStrategy,
  getRedisConfig,
  getRedisHealth,
  resetRedisClients,
  type RedisConfig,
} from './redis';

describe('Redis Configuration', () => {
  describe('getRedisConfig', () => {
    it('should return default configuration', () => {
      const config = getRedisConfig();
      expect(config.connectTimeout).toBe(5_000);
      expect(config.maxRetries).toBe(3);
      expect(config.initialRetryDelay).toBe(1_000);
      expect(config.tls).toBe(true);
    });

    it('should allow overriding specific values', () => {
      const config = getRedisConfig({ connectTimeout: 10_000, tls: false });
      expect(config.connectTimeout).toBe(10_000);
      expect(config.tls).toBe(false);
      // Non-overridden values remain default
      expect(config.maxRetries).toBe(3);
      expect(config.initialRetryDelay).toBe(1_000);
    });
  });

  describe('createRetryStrategy', () => {
    const config: RedisConfig = {
      connectTimeout: 5_000,
      maxRetries: 3,
      initialRetryDelay: 1_000,
      tls: true,
    };

    it('should return exponential backoff delays: 1s, 2s, 4s', () => {
      const strategy = createRetryStrategy(config);
      expect(strategy(1)).toBe(1_000); // 1s
      expect(strategy(2)).toBe(2_000); // 2s
      expect(strategy(3)).toBe(4_000); // 4s
    });

    it('should return null after max retries exhausted', () => {
      const strategy = createRetryStrategy(config);
      expect(strategy(4)).toBeNull();
      expect(strategy(5)).toBeNull();
    });

    it('should respect custom initialRetryDelay', () => {
      const customConfig: RedisConfig = { ...config, initialRetryDelay: 500 };
      const strategy = createRetryStrategy(customConfig);
      expect(strategy(1)).toBe(500);
      expect(strategy(2)).toBe(1_000);
      expect(strategy(3)).toBe(2_000);
    });

    it('should respect custom maxRetries', () => {
      const customConfig: RedisConfig = { ...config, maxRetries: 2 };
      const strategy = createRetryStrategy(customConfig);
      expect(strategy(1)).toBe(1_000);
      expect(strategy(2)).toBe(2_000);
      expect(strategy(3)).toBeNull(); // Exceeds max 2
    });
  });

  describe('buildRedisOptions', () => {
    it('should parse rediss:// URL with TLS enabled', () => {
      const url = 'rediss://default:mypassword@grand-cattle-122365.upstash.io:6379';
      const config = getRedisConfig();
      const options = buildRedisOptions(url, config);

      expect(options.host).toBe('grand-cattle-122365.upstash.io');
      expect(options.port).toBe(6379);
      expect(options.password).toBe('mypassword');
      expect(options.username).toBe('default');
      expect(options.connectTimeout).toBe(5_000);
      expect(options.maxRetriesPerRequest).toBe(3);
      expect(options.tls).toEqual({ rejectUnauthorized: true });
      expect(options.enableReadyCheck).toBe(true);
      expect(options.lazyConnect).toBe(true);
    });

    it('should parse redis:// URL without TLS when config.tls is false', () => {
      const url = 'redis://localhost:6379';
      const config = getRedisConfig({ tls: false });
      const options = buildRedisOptions(url, config);

      expect(options.host).toBe('localhost');
      expect(options.port).toBe(6379);
      expect(options.password).toBeUndefined();
      expect(options.username).toBeUndefined();
      expect(options.tls).toBeUndefined();
    });

    it('should not enable TLS for redis:// URL even when config.tls is true', () => {
      const url = 'redis://default:pass@host.io:6379';
      const config = getRedisConfig({ tls: true });
      const options = buildRedisOptions(url, config);

      expect(options.tls).toBeUndefined();
    });

    it('should default port to 6379 when not specified', () => {
      const url = 'rediss://default:pass@host.io';
      const config = getRedisConfig();
      const options = buildRedisOptions(url, config);

      expect(options.port).toBe(6379);
    });

    it('should include retry strategy function', () => {
      const url = 'rediss://default:pass@host.io:6379';
      const config = getRedisConfig();
      const options = buildRedisOptions(url, config);

      expect(options.retryStrategy).toBeTypeOf('function');
    });
  });

  describe('getRedisHealth', () => {
    beforeEach(() => {
      resetRedisClients();
    });

    it('should report unhealthy when no clients are connected', () => {
      const health = getRedisHealth();
      expect(health.cache.healthy).toBe(false);
      expect(health.pubsub.healthy).toBe(false);
    });
  });

  describe('Graceful degradation - cache operations', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      resetRedisClients();
      delete process.env.UPSTASH_REDIS_CACHE_URL;
    });

    afterEach(() => {
      process.env.UPSTASH_REDIS_CACHE_URL = originalEnv.UPSTASH_REDIS_CACHE_URL;
    });

    it('cacheGet should return failure result when cache is unavailable', async () => {
      const result = await cacheGet('test-key');
      expect(result.success).toBe(false);
      expect(result.data).toBeNull();
      expect(result.error).toBe('Cache unavailable');
    });

    it('cacheSet should return failure result when cache is unavailable', async () => {
      const result = await cacheSet('test-key', 'test-value');
      expect(result.success).toBe(false);
      expect(result.data).toBeNull();
      expect(result.error).toBe('Cache unavailable');
    });

    it('cacheDel should return failure result when cache is unavailable', async () => {
      const result = await cacheDel('test-key');
      expect(result.success).toBe(false);
      expect(result.data).toBeNull();
      expect(result.error).toBe('Cache unavailable');
    });

    it('cacheSet with TTL should return failure result when cache is unavailable', async () => {
      const result = await cacheSet('test-key', 'test-value', 300);
      expect(result.success).toBe(false);
      expect(result.data).toBeNull();
      expect(result.error).toBe('Cache unavailable');
    });
  });
});
