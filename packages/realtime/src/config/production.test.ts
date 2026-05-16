import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getProductionSocketConfig,
  getRedisAdapterConfig,
  getRedisUrl,
  buildAdapterRedisOptions,
  createAdapterRedisClients,
} from './production';

describe('Production Socket.io Configuration', () => {
  describe('getProductionSocketConfig', () => {
    it('returns default config with 25s ping interval', () => {
      const config = getProductionSocketConfig();
      expect(config.pingInterval).toBe(25_000);
    });

    it('returns default config with 60s ping timeout (idle timeout)', () => {
      const config = getProductionSocketConfig();
      expect(config.pingTimeout).toBe(60_000);
    });

    it('enables websocket and polling transports', () => {
      const config = getProductionSocketConfig();
      expect(config.transports).toEqual(['websocket', 'polling']);
    });

    it('enables connection state recovery', () => {
      const config = getProductionSocketConfig();
      expect(config.connectionStateRecovery).toBe(true);
    });

    it('allows transport upgrades for sticky session support', () => {
      const config = getProductionSocketConfig();
      expect(config.allowUpgrades).toBe(true);
    });

    it('applies overrides correctly', () => {
      const config = getProductionSocketConfig({
        pingInterval: 30_000,
        corsOrigins: ['https://dashboard.example.com'],
      });
      expect(config.pingInterval).toBe(30_000);
      expect(config.corsOrigins).toEqual(['https://dashboard.example.com']);
      // Non-overridden values remain default
      expect(config.pingTimeout).toBe(60_000);
    });
  });

  describe('getRedisAdapterConfig', () => {
    it('returns default config with 5s connect timeout', () => {
      const config = getRedisAdapterConfig();
      expect(config.connectTimeout).toBe(5_000);
    });

    it('returns default config with max 3 retries', () => {
      const config = getRedisAdapterConfig();
      expect(config.maxRetries).toBe(3);
    });

    it('returns default config with 1s initial retry delay', () => {
      const config = getRedisAdapterConfig();
      expect(config.initialRetryDelay).toBe(1_000);
    });

    it('enables TLS by default', () => {
      const config = getRedisAdapterConfig();
      expect(config.tls).toBe(true);
    });

    it('applies overrides correctly', () => {
      const config = getRedisAdapterConfig({ connectTimeout: 10_000 });
      expect(config.connectTimeout).toBe(10_000);
      expect(config.maxRetries).toBe(3); // unchanged
    });
  });

  describe('getRedisUrl', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      delete process.env.UPSTASH_REDIS_PUBSUB_URL;
      delete process.env.UPSTASH_REDIS_CACHE_URL;
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('returns UPSTASH_REDIS_PUBSUB_URL when set', () => {
      process.env.UPSTASH_REDIS_PUBSUB_URL = 'rediss://pubsub.example.com:6379';
      process.env.UPSTASH_REDIS_CACHE_URL = 'rediss://cache.example.com:6379';

      expect(getRedisUrl()).toBe('rediss://pubsub.example.com:6379');
    });

    it('falls back to UPSTASH_REDIS_CACHE_URL when PUBSUB_URL not set', () => {
      process.env.UPSTASH_REDIS_CACHE_URL = 'rediss://cache.example.com:6379';

      expect(getRedisUrl()).toBe('rediss://cache.example.com:6379');
    });

    it('returns null when neither URL is configured', () => {
      expect(getRedisUrl()).toBeNull();
    });
  });

  describe('buildAdapterRedisOptions', () => {
    it('parses host and port from URL', () => {
      const config = getRedisAdapterConfig();
      const options = buildAdapterRedisOptions(
        'rediss://default:password123@host.upstash.io:6379',
        config
      );

      expect(options.host).toBe('host.upstash.io');
      expect(options.port).toBe(6379);
    });

    it('extracts password from URL', () => {
      const config = getRedisAdapterConfig();
      const options = buildAdapterRedisOptions(
        'rediss://default:mypassword@host.upstash.io:6379',
        config
      );

      expect(options.password).toBe('mypassword');
    });

    it('extracts username from URL', () => {
      const config = getRedisAdapterConfig();
      const options = buildAdapterRedisOptions(
        'rediss://customuser:password@host.upstash.io:6379',
        config
      );

      expect(options.username).toBe('customuser');
    });

    it('enables TLS for rediss:// protocol', () => {
      const config = getRedisAdapterConfig({ tls: false });
      const options = buildAdapterRedisOptions(
        'rediss://default:pass@host.upstash.io:6379',
        config
      );

      expect(options.tls).toEqual({ rejectUnauthorized: true });
    });

    it('enables TLS when config.tls is true even for redis:// protocol', () => {
      const config = getRedisAdapterConfig({ tls: true });
      const options = buildAdapterRedisOptions(
        'redis://default:pass@host.example.com:6379',
        config
      );

      expect(options.tls).toEqual({ rejectUnauthorized: true });
    });

    it('sets connectTimeout from config', () => {
      const config = getRedisAdapterConfig({ connectTimeout: 10_000 });
      const options = buildAdapterRedisOptions(
        'rediss://default:pass@host.upstash.io:6379',
        config
      );

      expect(options.connectTimeout).toBe(10_000);
    });

    it('sets maxRetriesPerRequest from config', () => {
      const config = getRedisAdapterConfig({ maxRetries: 5 });
      const options = buildAdapterRedisOptions(
        'rediss://default:pass@host.upstash.io:6379',
        config
      );

      expect(options.maxRetriesPerRequest).toBe(5);
    });

    it('implements exponential backoff retry strategy', () => {
      const config = getRedisAdapterConfig({
        maxRetries: 3,
        initialRetryDelay: 1_000,
      });
      const options = buildAdapterRedisOptions(
        'rediss://default:pass@host.upstash.io:6379',
        config
      );

      const retryStrategy = options.retryStrategy as (times: number) => number | null;
      expect(retryStrategy(1)).toBe(1_000); // 1s
      expect(retryStrategy(2)).toBe(2_000); // 2s
      expect(retryStrategy(3)).toBe(4_000); // 4s
      expect(retryStrategy(4)).toBeNull(); // stop after max retries
    });

    it('uses lazy connect', () => {
      const config = getRedisAdapterConfig();
      const options = buildAdapterRedisOptions(
        'rediss://default:pass@host.upstash.io:6379',
        config
      );

      expect(options.lazyConnect).toBe(true);
    });

    it('defaults port to 6379 when not specified', () => {
      const config = getRedisAdapterConfig();
      const options = buildAdapterRedisOptions('rediss://default:pass@host.upstash.io', config);

      expect(options.port).toBe(6379);
    });
  });

  describe('createAdapterRedisClients', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      delete process.env.UPSTASH_REDIS_PUBSUB_URL;
      delete process.env.UPSTASH_REDIS_CACHE_URL;
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('returns null when no Redis URL is configured', () => {
      const result = createAdapterRedisClients();
      expect(result).toBeNull();
    });

    it('creates pub and sub clients when cache URL is configured', () => {
      process.env.UPSTASH_REDIS_CACHE_URL = 'rediss://default:pass@host.upstash.io:6379';

      const result = createAdapterRedisClients();
      expect(result).not.toBeNull();
      expect(result!.pubClient).toBeDefined();
      expect(result!.subClient).toBeDefined();

      // Cleanup - disconnect clients
      result!.pubClient.disconnect();
      result!.subClient.disconnect();
    });

    it('creates separate pub and sub client instances', () => {
      process.env.UPSTASH_REDIS_CACHE_URL = 'rediss://default:pass@host.upstash.io:6379';

      const result = createAdapterRedisClients();
      expect(result!.pubClient).not.toBe(result!.subClient);

      // Cleanup
      result!.pubClient.disconnect();
      result!.subClient.disconnect();
    });
  });
});
