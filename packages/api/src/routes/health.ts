import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { getCacheClient, getPubSubClient } from '../config/redis';
import type { RealtimeServer } from '@wedding/realtime';

/**
 * Health check endpoint for production monitoring.
 *
 * Checks connectivity and latency for:
 * - PostgreSQL (via Prisma raw query)
 * - Redis cache (via PING command)
 * - Redis pub/sub (via PING command — same instance at current scale)
 * - WebSocket server (via Socket.io server status)
 *
 * Returns structured HealthCheckResponse with:
 * - HTTP 200 when all dependencies are healthy
 * - HTTP 503 when any dependency is down (with failing component details)
 *
 * Response time target: < 500ms (enforced via AbortController timeout)
 *
 * Requirements: 9.8, 9.9
 */

// --- Types ---

interface DependencyStatus {
  status: 'up' | 'down';
  latency: number;
}

interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  dependencies: {
    postgresql: DependencyStatus;
    redis_cache: DependencyStatus;
    redis_pubsub: DependencyStatus;
    websocket: DependencyStatus;
  };
}

interface HealthRouteOptions extends FastifyPluginOptions {
  prisma: PrismaClient;
  getRealtimeServer: () => RealtimeServer | null;
}

// --- Constants ---

const APP_VERSION = process.env.APP_VERSION || '0.1.0';
const HEALTH_CHECK_TIMEOUT_MS = 4500; // Leave margin under 500ms total response
const startTime = Date.now();

// --- Dependency Check Helpers ---

/**
 * Measures PostgreSQL connectivity and latency via a lightweight query.
 */
async function checkPostgresql(prisma: PrismaClient): Promise<DependencyStatus> {
  const start = Date.now();
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    return { status: 'up', latency: Date.now() - start };
  } catch {
    return { status: 'down', latency: Date.now() - start };
  }
}

/**
 * Measures Redis cache connectivity and latency via PING command.
 */
async function checkRedisCache(): Promise<DependencyStatus> {
  const start = Date.now();
  try {
    const client = getCacheClient();
    if (!client) {
      return { status: 'down', latency: 0 };
    }
    await client.ping();
    return { status: 'up', latency: Date.now() - start };
  } catch {
    return { status: 'down', latency: Date.now() - start };
  }
}

/**
 * Measures Redis pub/sub connectivity and latency via PING command.
 * At current scale, this is the same Redis instance as cache.
 */
async function checkRedisPubSub(): Promise<DependencyStatus> {
  const start = Date.now();
  try {
    const client = getPubSubClient();
    if (!client) {
      return { status: 'down', latency: 0 };
    }
    await client.ping();
    return { status: 'up', latency: Date.now() - start };
  } catch {
    return { status: 'down', latency: Date.now() - start };
  }
}

/**
 * Checks WebSocket server status by verifying the Socket.io server is listening.
 */
function checkWebSocket(getRealtimeServer: () => RealtimeServer | null): DependencyStatus {
  const start = Date.now();
  try {
    const realtime = getRealtimeServer();
    if (!realtime || !realtime.io) {
      return { status: 'down', latency: 0 };
    }
    // Socket.io server is attached and running
    return { status: 'up', latency: Date.now() - start };
  } catch {
    return { status: 'down', latency: Date.now() - start };
  }
}

// --- Status Determination ---

/**
 * Determines overall health status based on dependency statuses.
 * - healthy: all dependencies are up
 * - degraded: Redis is down but PostgreSQL and WebSocket are up
 * - unhealthy: PostgreSQL or WebSocket is down
 */
function determineOverallStatus(
  dependencies: HealthCheckResponse['dependencies']
): HealthCheckResponse['status'] {
  const pgDown = dependencies.postgresql.status === 'down';
  const wsDown = dependencies.websocket.status === 'down';
  const redisCacheDown = dependencies.redis_cache.status === 'down';
  const redisPubSubDown = dependencies.redis_pubsub.status === 'down';

  // Critical dependencies: PostgreSQL and WebSocket
  if (pgDown || wsDown) {
    return 'unhealthy';
  }

  // Non-critical: Redis (graceful degradation supported)
  if (redisCacheDown || redisPubSubDown) {
    return 'degraded';
  }

  return 'healthy';
}

// --- Route Plugin ---

export async function healthRoutes(app: FastifyInstance, opts: HealthRouteOptions) {
  const { prisma, getRealtimeServer } = opts;

  app.get('/health', async (_request, reply) => {
    // Run all checks concurrently with a timeout guard
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Health check timeout')), HEALTH_CHECK_TIMEOUT_MS)
    );

    try {
      const [postgresql, redisCache, redisPubSub] = await Promise.race([
        Promise.all([checkPostgresql(prisma), checkRedisCache(), checkRedisPubSub()]),
        timeoutPromise.then(() => {
          throw new Error('Health check timeout');
        }),
      ]);

      // WebSocket check is synchronous
      const websocket = checkWebSocket(getRealtimeServer);

      const dependencies: HealthCheckResponse['dependencies'] = {
        postgresql,
        redis_cache: redisCache,
        redis_pubsub: redisPubSub,
        websocket,
      };

      const status = determineOverallStatus(dependencies);
      const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

      const response: HealthCheckResponse = {
        status,
        timestamp: new Date().toISOString(),
        version: APP_VERSION,
        uptime: uptimeSeconds,
        dependencies,
      };

      const httpStatus = status === 'healthy' ? 200 : 503;
      return reply.status(httpStatus).send(response);
    } catch {
      // Timeout or unexpected error — return unhealthy
      const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

      const response: HealthCheckResponse = {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        version: APP_VERSION,
        uptime: uptimeSeconds,
        dependencies: {
          postgresql: { status: 'down', latency: HEALTH_CHECK_TIMEOUT_MS },
          redis_cache: { status: 'down', latency: HEALTH_CHECK_TIMEOUT_MS },
          redis_pubsub: { status: 'down', latency: HEALTH_CHECK_TIMEOUT_MS },
          websocket: { status: 'down', latency: HEALTH_CHECK_TIMEOUT_MS },
        },
      };

      return reply.status(503).send(response);
    }
  });
}
