/**
 * Production-specific configuration for the Fastify API server.
 *
 * This module defines settings optimized for production deployment as a single
 * Fastify process. At the current scale (1 event, ≤500 guests), a single process
 * is sufficient — clustering and auto-scaling are documented as future scaling paths.
 *
 * Requirements: 14.1, 14.5
 */

// --- Types ---

export interface ProductionServerConfig {
  /** Server host binding (0.0.0.0 for container environments) */
  host: string;
  /** Server port */
  port: number;
  /** Request body size limit for JSON payloads (bytes) */
  bodyLimitJson: number;
  /** Request body size limit for file uploads (bytes) */
  bodyLimitUpload: number;
  /** Whether to trust the proxy (X-Forwarded-* headers) */
  trustProxy: boolean;
  /** Maximum number of parameters in a URL */
  maxParamLength: number;
  /** Connection timeout in milliseconds */
  connectionTimeout: number;
  /** Keep-alive timeout in milliseconds */
  keepAliveTimeout: number;
  /** Request timeout in milliseconds (0 = disabled, rely on query timeout) */
  requestTimeout: number;
  /** Whether to disable request logging for specific paths (e.g., health checks) */
  disableRequestLogging: boolean;
}

export interface ProductionProcessConfig {
  /** Node.js environment */
  nodeEnv: string;
  /** Whether clustering is enabled (false for current scale) */
  clusteringEnabled: boolean;
  /** Number of worker processes (1 = single process) */
  workers: number;
  /** Graceful shutdown timeout in milliseconds */
  gracefulShutdownTimeout: number;
  /** Whether to enable core dumps on crash */
  enableCoreDumps: boolean;
}

export interface ProductionPerformanceConfig {
  /** Database query timeout in milliseconds */
  queryTimeout: number;
  /** Database connection pool size */
  connectionPoolSize: number;
  /** Redis connection timeout in milliseconds */
  redisConnectionTimeout: number;
  /** Redis max retry attempts */
  redisMaxRetries: number;
  /** Maximum concurrent requests before backpressure */
  maxConcurrentRequests: number;
}

export interface ProductionConfig {
  server: ProductionServerConfig;
  process: ProductionProcessConfig;
  performance: ProductionPerformanceConfig;
}

// --- Constants ---

/** 1 MB in bytes */
const ONE_MB = 1024 * 1024;

/** 10 MB in bytes */
const TEN_MB = 10 * ONE_MB;

/** Default port for the API server */
const DEFAULT_PORT = 4000;

/** Graceful shutdown timeout: 30 seconds */
const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 30_000;

/** Connection timeout: 30 seconds */
const CONNECTION_TIMEOUT_MS = 30_000;

/** Keep-alive timeout: 72 seconds (slightly above typical LB idle timeout of 60s) */
const KEEP_ALIVE_TIMEOUT_MS = 72_000;

/** Request timeout: 60 seconds */
const REQUEST_TIMEOUT_MS = 60_000;

/** Database query timeout: 30 seconds */
const QUERY_TIMEOUT_MS = 30_000;

/** Redis connection timeout: 5 seconds */
const REDIS_CONNECTION_TIMEOUT_MS = 5_000;

/** Redis max retries with exponential backoff */
const REDIS_MAX_RETRIES = 3;

/** Database connection pool size (sufficient for 1 event / ≤500 guests) */
const CONNECTION_POOL_SIZE = 10;

/**
 * Maximum concurrent requests before applying backpressure.
 * At 500 guests with peak ~50 concurrent users, 200 is generous headroom.
 */
const MAX_CONCURRENT_REQUESTS = 200;

// --- Configuration ---

/**
 * Returns the production server configuration.
 *
 * Reads from environment variables with sensible defaults for a containerized
 * single-process deployment (Railway, Docker, etc.).
 */
export function getProductionServerConfig(
  overrides?: Partial<ProductionServerConfig>
): ProductionServerConfig {
  return {
    host: process.env.HOST || '0.0.0.0',
    port: parseInt(process.env.PORT || String(DEFAULT_PORT), 10),
    bodyLimitJson: ONE_MB,
    bodyLimitUpload: TEN_MB,
    trustProxy: process.env.TRUST_PROXY === 'true' || true,
    maxParamLength: 200,
    connectionTimeout: CONNECTION_TIMEOUT_MS,
    keepAliveTimeout: KEEP_ALIVE_TIMEOUT_MS,
    requestTimeout: REQUEST_TIMEOUT_MS,
    disableRequestLogging: false,
    ...overrides,
  };
}

/**
 * Returns the production process configuration.
 *
 * Single-process mode is the default and sufficient for the current scale.
 * Clustering is documented but disabled.
 */
export function getProductionProcessConfig(
  overrides?: Partial<ProductionProcessConfig>
): ProductionProcessConfig {
  return {
    nodeEnv: process.env.NODE_ENV || 'production',
    clusteringEnabled: false,
    workers: 1,
    gracefulShutdownTimeout: GRACEFUL_SHUTDOWN_TIMEOUT_MS,
    enableCoreDumps: false,
    ...overrides,
  };
}

/**
 * Returns the production performance configuration.
 *
 * Tuned for 1 event / ≤500 guests with comfortable headroom.
 */
export function getProductionPerformanceConfig(
  overrides?: Partial<ProductionPerformanceConfig>
): ProductionPerformanceConfig {
  return {
    queryTimeout: QUERY_TIMEOUT_MS,
    connectionPoolSize: parseInt(
      process.env.DATABASE_POOL_SIZE || String(CONNECTION_POOL_SIZE),
      10
    ),
    redisConnectionTimeout: REDIS_CONNECTION_TIMEOUT_MS,
    redisMaxRetries: REDIS_MAX_RETRIES,
    maxConcurrentRequests: MAX_CONCURRENT_REQUESTS,
    ...overrides,
  };
}

/**
 * Returns the complete production configuration.
 *
 * Usage:
 *   import { getProductionConfig } from './config/production';
 *   const config = getProductionConfig();
 *   const app = Fastify({
 *     bodyLimit: config.server.bodyLimitJson,
 *     connectionTimeout: config.server.connectionTimeout,
 *     keepAliveTimeout: config.server.keepAliveTimeout,
 *     requestTimeout: config.server.requestTimeout,
 *     trustProxy: config.server.trustProxy,
 *   });
 */
export function getProductionConfig(): ProductionConfig {
  return {
    server: getProductionServerConfig(),
    process: getProductionProcessConfig(),
    performance: getProductionPerformanceConfig(),
  };
}

/**
 * Returns Fastify server options derived from production config.
 *
 * This is a convenience function that maps ProductionConfig to the
 * options object Fastify's constructor expects.
 */
export function getFastifyProductionOptions(config?: ProductionConfig) {
  const { server } = config || getProductionConfig();

  return {
    bodyLimit: server.bodyLimitJson,
    connectionTimeout: server.connectionTimeout,
    keepAliveTimeout: server.keepAliveTimeout,
    requestTimeout: server.requestTimeout,
    trustProxy: server.trustProxy,
    maxParamLength: server.maxParamLength,
    disableRequestLogging: server.disableRequestLogging,
  };
}

// --- Scaling Documentation ---

/**
 * ## Scaling Path: From Single Process to Clustered / Auto-Scaled
 *
 * ### Current State (1 event, ≤500 guests)
 * - Single Fastify process handles all requests
 * - No clustering, no auto-scaling
 * - Single Redis instance for cache + pub/sub
 * - Single WebSocket instance (~50 peak concurrent connections)
 * - Database pool size: 10 connections
 *
 * ### When to Scale
 * Revisit this configuration when ANY of the following occur:
 * 1. Multiple concurrent events (>1 active event)
 * 2. Guest count exceeds 1000 per event
 * 3. Observed p95 latency exceeds performance targets:
 *    - API response time > 2s
 *    - QR scan verification > 2s
 *    - WebSocket broadcast > 500ms
 * 4. CPU utilization consistently above 70% on the single instance
 *
 * ### Scaling Steps
 *
 * #### Step 1: Node.js Clustering (Vertical Scaling)
 * Use Node.js `cluster` module to fork workers matching CPU cores:
 * ```
 * import cluster from 'node:cluster';
 * import os from 'node:os';
 *
 * if (cluster.isPrimary) {
 *   const numWorkers = os.availableParallelism();
 *   for (let i = 0; i < numWorkers; i++) cluster.fork();
 *   cluster.on('exit', (worker) => cluster.fork()); // auto-restart
 * } else {
 *   // start Fastify server in each worker
 * }
 * ```
 * - Update `workers` config to `os.availableParallelism()`
 * - Increase database pool size: (CPU cores × 2) + 1
 * - Rate limiter MUST use Redis-backed store (not in-memory)
 *
 * #### Step 2: Horizontal Scaling (Multiple Instances)
 * - Deploy multiple container instances behind load balancer
 * - Enable sticky sessions for WebSocket connections
 * - Separate Redis instance for pub/sub (Socket.io adapter)
 * - Use Redis-backed session store for shared state
 * - Configure health check on load balancer (10s interval, 3 failures threshold)
 *
 * #### Step 3: Auto-Scaling
 * - Configure auto-scaling rules based on:
 *   - CPU utilization > 70% → scale up
 *   - CPU utilization < 30% → scale down
 *   - Request queue depth > 100 → scale up
 * - Set min instances: 2 (for availability)
 * - Set max instances: based on budget and expected peak load
 * - Configure scale-down cooldown: 5 minutes
 *
 * #### Step 4: Database Scaling
 * - Increase connection pool: (instances × workers × 2) + 1
 * - Add read replicas for read-heavy queries (guest list, CMS)
 * - Consider connection pooler (PgBouncer) at infrastructure level
 *
 * ### Infrastructure Changes Required per Step
 * | Step | Redis | Database | Load Balancer | Monitoring |
 * |------|-------|----------|---------------|------------|
 * | 1    | Same  | Increase pool | Same | Add per-worker metrics |
 * | 2    | Separate pub/sub | Increase pool | Sticky sessions | Per-instance dashboards |
 * | 3    | Same as 2 | Read replicas | Auto-scaling rules | Scaling event alerts |
 * | 4    | Same as 2 | PgBouncer + replicas | Same | Connection pool alerts |
 */
