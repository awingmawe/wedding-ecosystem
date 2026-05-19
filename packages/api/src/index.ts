import Fastify from 'fastify';
import { createProductionPrismaClient } from '@wedding/db';
import {
  createRealtimeServer,
  createAuthMiddleware as createWsAuthMiddleware,
  registerRoomAuthorization,
  type RealtimeServer,
  type EventAuthRepository,
} from '@wedding/realtime';
import { authRoutes } from './routes/auth';
import { guestRoutes } from './routes/guests';
import { eventRoutes } from './routes/events';
import { notificationRoutes } from './routes/notifications';
import { invitationRoutes } from './routes/invitations';
import { checkinRoutes } from './routes/checkin';
import { rsvpRoutes } from './routes/rsvp';
import { cmsRoutes } from './routes/cms';
import { scannerRoutes } from './routes/scanner';
import { messageRoutes } from './routes/messages';
import { healthRoutes } from './routes/health';
import { adminRoutes } from './routes/admin';
import {
  createAuthMiddleware,
  createCORSMiddleware,
  createDefaultCORSConfig,
  createRateLimiterMiddleware,
  RedisRateLimiterStore,
  InMemoryRateLimiterStore,
} from './middleware';
import { securityHeaders } from './plugins/security-headers';
import { auditLogger } from './plugins/audit-logger';
import {
  responseCache,
  DEFAULT_CACHE_ROUTES,
  DEFAULT_INVALIDATION_RULES,
} from './plugins/response-cache';
import { getFastifyLoggerConfig, createRequestLogger } from './config/logger';
import { getFastifyProductionOptions, getProductionConfig } from './config/production';
import { getCacheClient, disconnectRedis } from './config/redis';
import { validateEnv } from './config/env';

// --- Config (validated at startup) ---
const env = validateEnv();
const JWT_SECRET = env.JWT_SECRET;
const REFRESH_SECRET = env.REFRESH_SECRET;
const IS_PRODUCTION = env.NODE_ENV === 'production';

// Production config (body limits, timeouts, trust proxy)
const productionConfig = getProductionConfig();
const PORT = productionConfig.server.port;

// CORS origins (from validated env config, fallback only for bare-minimum local dev without .env.local)
const DASHBOARD_ORIGIN = env.DASHBOARD_ORIGIN || 'http://localhost:3000';
const INVITATION_ORIGIN = env.INVITATION_ORIGIN || 'http://localhost:3001';
const SCANNER_ORIGIN = env.SCANNER_ORIGIN || 'http://localhost:3002';

// --- Prisma Client (production-ready with pool, SSL, timeouts) ---
const prisma = createProductionPrismaClient();

// --- Fastify Server (with production options) ---
const app = Fastify({
  logger: getFastifyLoggerConfig(),
  ...getFastifyProductionOptions(productionConfig),
});

// --- Security Headers Plugin (Req 12.1, 12.2) ---
app.register(securityHeaders);

// --- Audit Logger Plugin (Req 12.10) ---
app.register(auditLogger, { prisma });

// --- Response Cache Plugin (Req 14.3) ---
// Gracefully degrades when Redis is unavailable
app.register(responseCache, {
  cacheRoutes: DEFAULT_CACHE_ROUTES,
  invalidationRules: DEFAULT_INVALIDATION_RULES,
});

// --- CORS Middleware (Req 13.7) ---
// Only allows requests from registered origins for Dashboard, Invitation, and Scanner
const corsConfig = createDefaultCORSConfig({
  origins: {
    dashboard: [DASHBOARD_ORIGIN],
    invitation: [INVITATION_ORIGIN],
    scanner: [SCANNER_ORIGIN],
  },
});
const corsMiddleware = createCORSMiddleware(corsConfig);
app.addHook('onRequest', corsMiddleware);

// --- Structured Logging Context (Req 9.2) ---
// Enrich request logger with request_id and tenant_id for structured tracing
app.addHook('onRequest', async (request) => {
  const requestId = request.requestId || request.headers['x-request-id'];
  if (requestId) {
    request.log = createRequestLogger(request.log, { request_id: requestId as string });
  }
});

// After authentication, enrich logger with tenant_id
app.addHook('preHandler', async (request) => {
  if (request.user?.tenant_id) {
    request.log = createRequestLogger(request.log, {
      request_id: request.requestId,
      tenant_id: request.user.tenant_id,
    });
  }
});

// --- Rate Limiting Middleware (Req 13.3, 13.4) ---
// Use Redis store in production for persistence across restarts, in-memory for dev
const redisClient = getCacheClient();
const rateLimiterStore = redisClient
  ? new RedisRateLimiterStore(redisClient as any)
  : new InMemoryRateLimiterStore();
const rateLimiterMiddleware = createRateLimiterMiddleware(rateLimiterStore);

// Apply rate limiting to all routes except health check
app.addHook('preHandler', async (request, reply) => {
  // Skip rate limiting for health check and OPTIONS preflight
  if (request.url === '/health' || request.method === 'OPTIONS') {
    return;
  }
  await rateLimiterMiddleware(request, reply);
});

// --- Auth Middleware (Single Seam) ---
// All auth logic lives in createAuthMiddleware — no other auth implementation exists.
declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      tenant_id: string;
      role: string;
      email: string;
    };
  }
}

const authenticate = createAuthMiddleware(JWT_SECRET);

// Decorate app so routes can access via app.authenticate (backward compatible)
app.decorate('authenticate', authenticate);

// --- WebSocket / Realtime Server ---
let realtime: RealtimeServer | null = null;

// --- Register Routes ---

// Auth routes (public - login/refresh don't need auth)
app.register(authRoutes, {
  prefix: '/auth',
  prisma,
  jwtSecret: JWT_SECRET,
  refreshSecret: REFRESH_SECRET,
});

// Protected routes (require auth + tenant isolation)
app.register(guestRoutes, { prefix: '/guests', prisma });
app.register(eventRoutes, { prefix: '/events', prisma });
app.register(notificationRoutes, { prefix: '/notifications', prisma });
app.register(cmsRoutes, { prefix: '/cms', prisma });
app.register(scannerRoutes, { prefix: '/scanner', prisma });
app.register(adminRoutes, { prefix: '/admin', prisma });

// Routes that need realtime broadcasting
app.register(async (instance) => {
  instance.register(checkinRoutes, { prefix: '/checkin', prisma, realtime });
}, {});

app.register(async (instance) => {
  instance.register(rsvpRoutes, { prefix: '/rsvp', prisma, realtime });
}, {});

// Public routes (no auth required)
app.register(invitationRoutes, { prefix: '/invitations', prisma });
app.register(messageRoutes, { prefix: '/messages', prisma });

// --- Health check (Req 9.8, 9.9) ---
app.register(healthRoutes, {
  prisma,
  getRealtimeServer: () => realtime,
});

// --- Event Auth Repository for WebSocket authorization ---
const eventAuthRepository: EventAuthRepository = {
  async isEventOwnedByTenant(eventId: string, tenantId: string): Promise<boolean> {
    const event = await prisma.event.findFirst({
      where: { id: eventId, tenant_id: tenantId },
      select: { id: true },
    });
    return event !== null;
  },
};

// --- Start server ---
async function start() {
  try {
    await prisma.$connect();
    console.log('✅ Database connected');

    // Connect Redis (lazy connect)
    const redis = getCacheClient();
    if (redis) {
      await redis.connect().catch((err: Error) => {
        console.warn('⚠️  Redis connection failed (graceful degradation):', err.message);
      });
    }

    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`🚀 API server running on http://localhost:${PORT}`);
    console.log(`   Environment: ${IS_PRODUCTION ? 'production' : 'development'}`);

    // Attach Socket.io WebSocket server to the same HTTP server (Req 9.1, 9.2, 9.3)
    const httpServer = app.server as any;
    realtime = createRealtimeServer({
      httpServer,
      cors: {
        origin: [DASHBOARD_ORIGIN, INVITATION_ORIGIN, SCANNER_ORIGIN],
        credentials: true,
      },
    });

    // --- WebSocket Authentication Middleware (Req 13.6) ---
    // Validates JWT token on handshake — rejects unauthenticated connections
    const wsAuthMiddleware = createWsAuthMiddleware({
      jwtSecret: JWT_SECRET,
      eventAuthRepository,
    });
    realtime.io.use(wsAuthMiddleware);

    // --- WebSocket Room Authorization (Req 13.7) ---
    // Enforces tenant-scoped room access on join_event
    realtime.io.on('connection', (socket) => {
      registerRoomAuthorization(socket, eventAuthRepository);
    });

    console.log('🔌 WebSocket server attached (with auth middleware)');
    console.log(`   Allowed origins: ${DASHBOARD_ORIGIN}, ${INVITATION_ORIGIN}, ${SCANNER_ORIGIN}`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

// --- Graceful Shutdown (Req 13.5) ---
async function shutdown(signal: string) {
  console.log(`\n[Shutdown] Received ${signal}. Starting graceful shutdown...`);

  const shutdownTimeout = productionConfig.process.gracefulShutdownTimeout;
  const timer = setTimeout(() => {
    console.error('[Shutdown] Timeout reached, forcing exit.');
    process.exit(1);
  }, shutdownTimeout);

  try {
    // 1. Stop accepting new HTTP connections
    await app.close();
    console.log('[Shutdown] HTTP server closed.');

    // 2. Close WebSocket connections gracefully
    if (realtime) {
      realtime.io.emit('server_shutting_down', {
        reason: 'Server is shutting down for maintenance or deployment',
      });
      // Give clients 2 seconds to receive the message
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await realtime.close();
      console.log('[Shutdown] WebSocket server closed.');
    }

    // 3. Disconnect Redis
    await disconnectRedis();
    console.log('[Shutdown] Redis disconnected.');

    // 4. Disconnect database
    await prisma.$disconnect();
    console.log('[Shutdown] Database disconnected.');

    clearTimeout(timer);
    console.log('[Shutdown] Graceful shutdown complete.');
    process.exit(0);
  } catch (err) {
    console.error('[Shutdown] Error during shutdown:', err);
    clearTimeout(timer);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();

export { app, prisma, realtime, JWT_SECRET, REFRESH_SECRET };
