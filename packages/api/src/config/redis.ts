import Redis, { type RedisOptions } from 'ioredis';

/**
 * Production Redis connection configuration for Upstash Redis.
 *
 * Implements:
 * - Separate clients for cache and pub/sub
 * - 5-second connection timeout
 * - Exponential backoff retry (1s, 2s, 4s — max 3 retries)
 * - Graceful degradation: bypass cache on connection failure, log error
 *
 * Cache endpoint: grand-cattle-122365.upstash.io:6379 (TLS enabled)
 * Environment variables:
 *   UPSTASH_REDIS_CACHE_URL - Redis connection URL for caching
 *   UPSTASH_REDIS_PUBSUB_URL - Redis connection URL for pub/sub
 *
 * Requirements: 5.5, 5.6
 */

// --- Types ---

export interface RedisConfig {
  /** Connection timeout in milliseconds */
  connectTimeout: number;
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Initial retry delay in milliseconds (doubles each attempt) */
  initialRetryDelay: number;
  /** Whether TLS is enabled */
  tls: boolean;
}

export interface CacheOperationResult<T = string | null> {
  /** Whether the operation succeeded */
  success: boolean;
  /** The returned data (null if miss or failure) */
  data: T;
  /** Error message if operation failed */
  error?: string;
}

// --- Configuration ---

const DEFAULT_CONFIG: RedisConfig = {
  connectTimeout: 5_000, // 5 seconds
  maxRetries: 3,
  initialRetryDelay: 1_000, // 1 second
  tls: true,
};

/**
 * Returns the Redis configuration for production.
 * Can be overridden for testing purposes.
 */
export function getRedisConfig(overrides?: Partial<RedisConfig>): RedisConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}

// --- Retry Strategy ---

/**
 * Creates an exponential backoff retry strategy.
 * Delays: 1s, 2s, 4s (for max 3 retries).
 * Returns null after max retries to stop reconnecting.
 */
export function createRetryStrategy(config: RedisConfig): (times: number) => number | null {
  return (times: number): number | null => {
    if (times > config.maxRetries) {
      return null;
    }
    // Exponential backoff: initialDelay * 2^(attempt-1)
    // 1s, 2s, 4s
    return config.initialRetryDelay * Math.pow(2, times - 1);
  };
}

// --- Connection Options Builder ---

/**
 * Builds ioredis connection options from a Redis URL and config.
 */
export function buildRedisOptions(url: string, config: RedisConfig): RedisOptions {
  const parsedUrl = new URL(url);

  const options: RedisOptions = {
    host: parsedUrl.hostname,
    port: parseInt(parsedUrl.port || '6379', 10),
    password: parsedUrl.password || undefined,
    username: parsedUrl.username || undefined,
    connectTimeout: config.connectTimeout,
    maxRetriesPerRequest: config.maxRetries,
    retryStrategy: createRetryStrategy(config),
    enableReadyCheck: true,
    lazyConnect: true,
  };

  // Enable TLS only for rediss:// protocol (Upstash, production Redis with TLS)
  // Local redis:// connections should NOT use TLS
  if (parsedUrl.protocol === 'rediss:') {
    options.tls = {
      rejectUnauthorized: true,
    };
  }

  return options;
}

// --- Client Factory ---

/** Tracks whether the cache client is connected and healthy */
let cacheClientHealthy = false;
/** Tracks whether the pub/sub client is connected and healthy */
let pubsubClientHealthy = false;

/** Singleton cache client instance */
let cacheClient: Redis | null = null;
/** Singleton pub/sub client instance */
let pubsubClient: Redis | null = null;

/**
 * Creates a Redis client for caching operations.
 * Uses UPSTASH_REDIS_CACHE_URL environment variable.
 *
 * Returns null if the URL is not configured (non-production environments).
 */
export function createCacheClient(config?: Partial<RedisConfig>): Redis | null {
  const url = process.env.UPSTASH_REDIS_CACHE_URL;

  if (!url) {
    console.warn('[Redis] UPSTASH_REDIS_CACHE_URL not set. Cache operations will be bypassed.');
    return null;
  }

  const redisConfig = getRedisConfig(config);
  const options = buildRedisOptions(url, redisConfig);
  const client = new Redis(options);

  client.on('connect', () => {
    cacheClientHealthy = true;
    console.info('[Redis:Cache] Connected successfully.');
  });

  client.on('ready', () => {
    cacheClientHealthy = true;
  });

  client.on('error', (error: Error) => {
    cacheClientHealthy = false;
    console.error('[Redis:Cache] Connection error:', error.message);
  });

  client.on('close', () => {
    cacheClientHealthy = false;
    console.warn('[Redis:Cache] Connection closed.');
  });

  client.on('end', () => {
    cacheClientHealthy = false;
  });

  return client;
}

/**
 * Creates a Redis client for pub/sub operations (Socket.io adapter).
 * Uses UPSTASH_REDIS_PUBSUB_URL environment variable.
 *
 * Falls back to UPSTASH_REDIS_CACHE_URL if pub/sub URL is not configured.
 * This is acceptable for small-scale deployments (single event, ≤500 guests)
 * where cache and pub/sub can safely share one Redis instance without
 * memory pressure or eviction conflicts.
 *
 * For larger deployments (multiple concurrent events, 1000+ guests),
 * set UPSTASH_REDIS_PUBSUB_URL to a dedicated instance.
 */
export function createPubSubClient(config?: Partial<RedisConfig>): Redis | null {
  const url = process.env.UPSTASH_REDIS_PUBSUB_URL || process.env.UPSTASH_REDIS_CACHE_URL;

  if (!url) {
    console.warn(
      '[Redis] Neither UPSTASH_REDIS_PUBSUB_URL nor UPSTASH_REDIS_CACHE_URL is set. Pub/Sub operations will be unavailable.'
    );
    return null;
  }

  if (!process.env.UPSTASH_REDIS_PUBSUB_URL) {
    console.info(
      '[Redis:PubSub] Using shared cache instance (UPSTASH_REDIS_CACHE_URL). Suitable for ≤500 guests / single event.'
    );
  }

  const redisConfig = getRedisConfig(config);
  const options = buildRedisOptions(url, redisConfig);
  const client = new Redis(options);

  client.on('connect', () => {
    pubsubClientHealthy = true;
    console.info('[Redis:PubSub] Connected successfully.');
  });

  client.on('ready', () => {
    pubsubClientHealthy = true;
  });

  client.on('error', (error: Error) => {
    pubsubClientHealthy = false;
    console.error('[Redis:PubSub] Connection error:', error.message);
  });

  client.on('close', () => {
    pubsubClientHealthy = false;
    console.warn('[Redis:PubSub] Connection closed.');
  });

  client.on('end', () => {
    pubsubClientHealthy = false;
  });

  return client;
}

// --- Singleton Accessors ---

/**
 * Returns the singleton cache client, creating it if needed.
 */
export function getCacheClient(config?: Partial<RedisConfig>): Redis | null {
  if (!cacheClient) {
    cacheClient = createCacheClient(config);
  }
  return cacheClient;
}

/**
 * Returns the singleton pub/sub client, creating it if needed.
 */
export function getPubSubClient(config?: Partial<RedisConfig>): Redis | null {
  if (!pubsubClient) {
    pubsubClient = createPubSubClient(config);
  }
  return pubsubClient;
}

// --- Health Check ---

/**
 * Returns the current health status of Redis connections.
 */
export function getRedisHealth(): {
  cache: { healthy: boolean };
  pubsub: { healthy: boolean };
} {
  return {
    cache: { healthy: cacheClientHealthy },
    pubsub: { healthy: pubsubClientHealthy },
  };
}

// --- Graceful Cache Operations ---

/**
 * Gets a value from Redis cache with graceful degradation.
 * Returns { success: false, data: null } on connection failure instead of throwing.
 */
export async function cacheGet(key: string): Promise<CacheOperationResult<string | null>> {
  const client = getCacheClient();

  if (!client || !cacheClientHealthy) {
    return { success: false, data: null, error: 'Cache unavailable' };
  }

  try {
    const data = await client.get(key);
    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown cache error';
    console.error(`[Redis:Cache] GET failed for key "${key}":`, message);
    return { success: false, data: null, error: message };
  }
}

/**
 * Sets a value in Redis cache with graceful degradation.
 * Optionally accepts a TTL in seconds.
 * Returns { success: false } on connection failure instead of throwing.
 */
export async function cacheSet(
  key: string,
  value: string,
  ttlSeconds?: number
): Promise<CacheOperationResult<'OK' | null>> {
  const client = getCacheClient();

  if (!client || !cacheClientHealthy) {
    return { success: false, data: null, error: 'Cache unavailable' };
  }

  try {
    let result: 'OK' | null;
    if (ttlSeconds !== undefined && ttlSeconds > 0) {
      result = await client.set(key, value, 'EX', ttlSeconds);
    } else {
      result = await client.set(key, value);
    }
    return { success: true, data: result };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown cache error';
    console.error(`[Redis:Cache] SET failed for key "${key}":`, message);
    return { success: false, data: null, error: message };
  }
}

/**
 * Deletes a key from Redis cache with graceful degradation.
 * Returns { success: false } on connection failure instead of throwing.
 */
export async function cacheDel(key: string): Promise<CacheOperationResult<number | null>> {
  const client = getCacheClient();

  if (!client || !cacheClientHealthy) {
    return { success: false, data: null, error: 'Cache unavailable' };
  }

  try {
    const result = await client.del(key);
    return { success: true, data: result };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown cache error';
    console.error(`[Redis:Cache] DEL failed for key "${key}":`, message);
    return { success: false, data: null, error: message };
  }
}

// --- Cleanup ---

/**
 * Gracefully disconnects all Redis clients.
 * Call this during application shutdown.
 */
export async function disconnectRedis(): Promise<void> {
  const disconnections: Promise<void>[] = [];

  if (cacheClient) {
    disconnections.push(
      cacheClient.quit().then(() => {
        cacheClient = null;
        cacheClientHealthy = false;
      })
    );
  }

  if (pubsubClient) {
    disconnections.push(
      pubsubClient.quit().then(() => {
        pubsubClient = null;
        pubsubClientHealthy = false;
      })
    );
  }

  await Promise.allSettled(disconnections);
  console.info('[Redis] All clients disconnected.');
}

/**
 * Resets singleton state. Used for testing only.
 */
export function resetRedisClients(): void {
  cacheClient = null;
  pubsubClient = null;
  cacheClientHealthy = false;
  pubsubClientHealthy = false;
}
