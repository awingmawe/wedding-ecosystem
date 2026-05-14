import { Server as HttpServer } from 'http';
import { Server, type ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis, { type RedisOptions } from 'ioredis';

/**
 * Production configuration for Socket.io WebSocket server.
 *
 * Configures:
 * - Redis adapter for pub/sub (shared Upstash Redis instance via UPSTASH_REDIS_CACHE_URL fallback)
 * - Sticky session support for WebSocket connections on load balancer
 * - Idle timeout 60s with ping/pong keepalive every 25s
 * - Single instance deployment (sufficient for 1 event / ≤500 guests)
 *
 * Environment variables:
 *   UPSTASH_REDIS_PUBSUB_URL - Dedicated Redis URL for pub/sub (optional)
 *   UPSTASH_REDIS_CACHE_URL  - Shared Redis URL (fallback for pub/sub)
 *
 * Requirements: 13.1, 13.2, 13.3, 13.4
 */

// --- Types ---

export interface ProductionSocketConfig {
  /** Ping interval in milliseconds (keepalive) */
  pingInterval: number;
  /** Ping timeout in milliseconds (idle timeout) */
  pingTimeout: number;
  /** Allowed CORS origins */
  corsOrigins: string[];
  /** Whether to enable connection state recovery */
  connectionStateRecovery: boolean;
  /** Maximum number of disconnection duration for state recovery (ms) */
  connectionStateRecoveryMaxDisconnectionDuration: number;
  /** Transports to allow */
  transports: ('websocket' | 'polling')[];
  /** Whether to allow transport upgrades (polling → websocket) */
  allowUpgrades: boolean;
  /** HTTP compression for polling transport */
  httpCompression: boolean;
  /** Maximum buffer size per message (bytes) */
  maxHttpBufferSize: number;
}

export interface RedisAdapterConfig {
  /** Connection timeout in milliseconds */
  connectTimeout: number;
  /** Maximum retry attempts */
  maxRetries: number;
  /** Initial retry delay in milliseconds (doubles each attempt) */
  initialRetryDelay: number;
  /** Whether TLS is enabled */
  tls: boolean;
  /** Key prefix for Redis adapter channels */
  keyPrefix: string;
}

// --- Default Configuration ---

/**
 * Default production Socket.io configuration.
 *
 * - pingInterval: 25s — keepalive to detect dead connections before idle timeout
 * - pingTimeout: 60s — idle timeout; connection closed if no pong received
 * - Transports: websocket preferred, polling as fallback for initial handshake
 * - allowUpgrades: true — allows polling → websocket upgrade (needed for sticky sessions)
 * - connectionStateRecovery: enabled for brief disconnections (2 min window)
 */
const DEFAULT_SOCKET_CONFIG: ProductionSocketConfig = {
  pingInterval: 25_000, // 25 seconds keepalive
  pingTimeout: 60_000, // 60 seconds idle timeout
  corsOrigins: [], // Set from environment or passed explicitly
  connectionStateRecovery: true,
  connectionStateRecoveryMaxDisconnectionDuration: 120_000, // 2 minutes
  transports: ['websocket', 'polling'],
  allowUpgrades: true,
  httpCompression: true,
  maxHttpBufferSize: 1_048_576, // 1MB
};

const DEFAULT_REDIS_ADAPTER_CONFIG: RedisAdapterConfig = {
  connectTimeout: 5_000, // 5 seconds
  maxRetries: 3,
  initialRetryDelay: 1_000, // 1 second (1s, 2s, 4s)
  tls: true,
  keyPrefix: 'socket.io',
};

// --- Configuration Getters ---

/**
 * Returns the production Socket.io configuration.
 */
export function getProductionSocketConfig(
  overrides?: Partial<ProductionSocketConfig>
): ProductionSocketConfig {
  return { ...DEFAULT_SOCKET_CONFIG, ...overrides };
}

/**
 * Returns the Redis adapter configuration.
 */
export function getRedisAdapterConfig(overrides?: Partial<RedisAdapterConfig>): RedisAdapterConfig {
  return { ...DEFAULT_REDIS_ADAPTER_CONFIG, ...overrides };
}

// --- Redis Connection for Adapter ---

/**
 * Resolves the Redis URL for the Socket.io adapter.
 * Prefers UPSTASH_REDIS_PUBSUB_URL, falls back to UPSTASH_REDIS_CACHE_URL.
 *
 * At current scale (1 event / ≤500 guests), sharing the cache instance
 * for pub/sub is acceptable. Pub/sub traffic is negligible (~few KB/s peak).
 */
export function getRedisUrl(): string | null {
  const pubsubUrl = process.env.UPSTASH_REDIS_PUBSUB_URL;
  const cacheUrl = process.env.UPSTASH_REDIS_CACHE_URL;

  if (pubsubUrl) {
    return pubsubUrl;
  }

  if (cacheUrl) {
    console.info(
      '[Realtime:Redis] Using shared cache instance (UPSTASH_REDIS_CACHE_URL) for Socket.io adapter. ' +
        'Suitable for ≤500 guests / single event.'
    );
    return cacheUrl;
  }

  return null;
}

/**
 * Builds ioredis connection options from a Redis URL.
 * Configures TLS, timeout, and retry strategy for Upstash.
 */
export function buildAdapterRedisOptions(url: string, config: RedisAdapterConfig): RedisOptions {
  const parsedUrl = new URL(url);

  const options: RedisOptions = {
    host: parsedUrl.hostname,
    port: parseInt(parsedUrl.port || '6379', 10),
    password: parsedUrl.password || undefined,
    username: parsedUrl.username || undefined,
    connectTimeout: config.connectTimeout,
    maxRetriesPerRequest: config.maxRetries,
    retryStrategy: (times: number): number | null => {
      if (times > config.maxRetries) {
        return null;
      }
      // Exponential backoff: 1s, 2s, 4s
      return config.initialRetryDelay * Math.pow(2, times - 1);
    },
    enableReadyCheck: true,
    lazyConnect: true,
  };

  // Enable TLS for rediss:// protocol (Upstash default)
  if (parsedUrl.protocol === 'rediss:' || config.tls) {
    options.tls = {
      rejectUnauthorized: true,
    };
  }

  return options;
}

/**
 * Creates a pair of Redis clients for the Socket.io Redis adapter.
 * The adapter requires two separate connections: one for publishing, one for subscribing.
 *
 * Returns null if no Redis URL is configured (development/test without Redis).
 */
export function createAdapterRedisClients(
  config?: Partial<RedisAdapterConfig>
): { pubClient: Redis; subClient: Redis } | null {
  const url = getRedisUrl();

  if (!url) {
    console.warn(
      '[Realtime:Redis] No Redis URL configured. Socket.io will run without Redis adapter ' +
        '(single-instance mode only).'
    );
    return null;
  }

  const adapterConfig = getRedisAdapterConfig(config);
  const options = buildAdapterRedisOptions(url, adapterConfig);

  const pubClient = new Redis(options);
  const subClient = new Redis(options);

  // Logging for pub client
  pubClient.on('connect', () => {
    console.info('[Realtime:Redis:Pub] Connected successfully.');
  });
  pubClient.on('error', (error: Error) => {
    console.error('[Realtime:Redis:Pub] Connection error:', error.message);
  });
  pubClient.on('close', () => {
    console.warn('[Realtime:Redis:Pub] Connection closed.');
  });

  // Logging for sub client
  subClient.on('connect', () => {
    console.info('[Realtime:Redis:Sub] Connected successfully.');
  });
  subClient.on('error', (error: Error) => {
    console.error('[Realtime:Redis:Sub] Connection error:', error.message);
  });
  subClient.on('close', () => {
    console.warn('[Realtime:Redis:Sub] Connection closed.');
  });

  return { pubClient, subClient };
}

// --- Production Server Factory ---

export interface ProductionServerOptions {
  /** HTTP server to attach Socket.io to */
  httpServer: HttpServer;
  /** Override Socket.io configuration */
  socketConfig?: Partial<ProductionSocketConfig>;
  /** Override Redis adapter configuration */
  redisConfig?: Partial<RedisAdapterConfig>;
  /** CORS origins (overrides socketConfig.corsOrigins) */
  corsOrigins?: string[];
}

export interface ProductionServerResult {
  /** The configured Socket.io server instance */
  io: Server;
  /** Redis pub client (null if adapter not configured) */
  pubClient: Redis | null;
  /** Redis sub client (null if adapter not configured) */
  subClient: Redis | null;
  /** Gracefully disconnect Redis clients */
  disconnectRedis: () => Promise<void>;
}

/**
 * Creates a production-configured Socket.io server with Redis adapter.
 *
 * Features:
 * - Redis adapter for horizontal scaling readiness (single instance for now)
 * - Sticky session compatible (cookie-based session affinity)
 * - 60s idle timeout with 25s ping/pong keepalive
 * - Connection state recovery for brief disconnections
 * - TLS-encrypted Redis connections (Upstash rediss://)
 *
 * Load balancer requirements:
 * - Sticky sessions (session affinity) MUST be enabled on the load balancer
 *   for the WebSocket subdomain (ws.{domain})
 * - The `io` cookie is used for session affinity routing
 * - This ensures WebSocket upgrade requests reach the same instance
 *   that handled the initial polling handshake
 *
 * Requirements: 13.1, 13.2, 13.3, 13.4
 */
export function createProductionServer(options: ProductionServerOptions): ProductionServerResult {
  const { httpServer, socketConfig, redisConfig, corsOrigins } = options;

  const config = getProductionSocketConfig(socketConfig);
  const origins = corsOrigins ?? config.corsOrigins;

  // Build Socket.io server options
  const serverOptions: Partial<ServerOptions> = {
    // Transport configuration
    transports: config.transports,
    allowUpgrades: config.allowUpgrades,
    httpCompression: config.httpCompression,
    maxHttpBufferSize: config.maxHttpBufferSize,

    // Keepalive and timeout (Requirements: 13.3)
    pingInterval: config.pingInterval, // 25s keepalive
    pingTimeout: config.pingTimeout, // 60s idle timeout

    // CORS configuration
    cors: {
      origin: origins.length > 0 ? origins : '*',
      credentials: true,
    },

    // Sticky session support (Requirements: 13.2)
    // The `cookie` option sends a cookie that load balancers can use
    // for session affinity routing
    cookie: {
      name: 'io',
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
    },

    // Connection state recovery for brief disconnections
    connectionStateRecovery: config.connectionStateRecovery
      ? {
          maxDisconnectionDuration: config.connectionStateRecoveryMaxDisconnectionDuration,
          skipMiddlewares: false,
        }
      : undefined,
  };

  const io = new Server(httpServer, serverOptions);

  // Configure Redis adapter (Requirements: 13.1)
  let pubClient: Redis | null = null;
  let subClient: Redis | null = null;

  const redisClients = createAdapterRedisClients(redisConfig);

  if (redisClients) {
    pubClient = redisClients.pubClient;
    subClient = redisClients.subClient;

    // Connect both clients before attaching adapter
    Promise.all([pubClient.connect(), subClient.connect()])
      .then(() => {
        io.adapter(createAdapter(pubClient!, subClient!));
        console.info('[Realtime] Redis adapter attached. Ready for horizontal scaling.');
      })
      .catch((error: Error) => {
        console.error(
          '[Realtime] Failed to connect Redis adapter. Running in single-instance mode:',
          error.message
        );
        // Server continues without Redis adapter — acceptable for single instance
      });
  } else {
    console.info(
      '[Realtime] Running without Redis adapter (single-instance mode). ' +
        'Configure UPSTASH_REDIS_CACHE_URL for production.'
    );
  }

  // Graceful Redis disconnection
  async function disconnectRedisClients(): Promise<void> {
    const disconnections: Promise<void>[] = [];

    if (pubClient) {
      disconnections.push(
        pubClient.quit().then(() => {
          console.info('[Realtime:Redis:Pub] Disconnected.');
        })
      );
    }

    if (subClient) {
      disconnections.push(
        subClient.quit().then(() => {
          console.info('[Realtime:Redis:Sub] Disconnected.');
        })
      );
    }

    await Promise.allSettled(disconnections);
  }

  return {
    io,
    pubClient,
    subClient,
    disconnectRedis: disconnectRedisClients,
  };
}
