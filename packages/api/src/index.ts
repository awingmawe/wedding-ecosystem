import Fastify from 'fastify';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createRealtimeServer, type RealtimeServer } from '@wedding/realtime';
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
import {
  createCORSMiddleware,
  createDefaultCORSConfig,
  createRateLimiterMiddleware,
  InMemoryRateLimiterStore,
} from './middleware';

// --- Config ---
const JWT_SECRET = process.env.JWT_SECRET || 'wedding-dev-secret-key';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'wedding-dev-refresh-secret-key';
const PORT = parseInt(process.env.PORT || '4000', 10);
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/wedding_digital_saas?schema=public';

// CORS origins (configurable via env)
const DASHBOARD_ORIGIN = process.env.DASHBOARD_ORIGIN || 'http://localhost:3000';
const INVITATION_ORIGIN = process.env.INVITATION_ORIGIN || 'http://localhost:3001';
const SCANNER_ORIGIN = process.env.SCANNER_ORIGIN || 'http://localhost:3002';

// --- Prisma Client ---
const adapter = new PrismaPg({ connectionString: DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// --- Fastify Server ---
const app = Fastify({
  logger: true,
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

// --- Rate Limiting Middleware (Req 13.3, 13.4) ---
// 100 requests per minute per tenant, returns 429 on exceed
const rateLimiterStore = new InMemoryRateLimiterStore();
const rateLimiterMiddleware = createRateLimiterMiddleware(rateLimiterStore);

// Apply rate limiting to all routes except health check
app.addHook('preHandler', async (request, reply) => {
  // Skip rate limiting for health check and OPTIONS preflight
  if (request.url === '/health' || request.method === 'OPTIONS') {
    return;
  }
  await rateLimiterMiddleware(request, reply);
});

// --- Auth middleware decorator ---
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

/**
 * Authentication decorator (Req 2.1)
 * Verifies JWT access token and attaches user context to request.
 * Used by protected routes via onRequest hook.
 */
app.decorate('authenticate', async function (request: any, reply: any) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.status(401).send({
      success: false,
      error: { code: 'AUTH_2002', message: 'Token autentikasi diperlukan.' },
    });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      sub: string;
      tenant_id: string;
      role: string;
      email: string;
    };

    // Tenant isolation: attach tenant context (Req 1.2)
    request.user = {
      id: decoded.sub,
      tenant_id: decoded.tenant_id,
      role: decoded.role,
      email: decoded.email,
    };
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      reply.status(401).send({
        success: false,
        error: { code: 'AUTH_2002', message: 'Access token telah kedaluwarsa.' },
      });
    } else {
      reply.status(401).send({
        success: false,
        error: { code: 'AUTH_2003', message: 'Token tidak valid.' },
      });
    }
    return;
  }
});

// --- WebSocket / Realtime Server ---
let realtime: RealtimeServer | null = null;

// --- Register Routes ---

// Auth routes (public - login/refresh don't need auth)
app.register(authRoutes, { prefix: '/auth', prisma, jwtSecret: JWT_SECRET, refreshSecret: REFRESH_SECRET });

// Protected routes (require auth + tenant isolation)
app.register(guestRoutes, { prefix: '/guests', prisma });
app.register(eventRoutes, { prefix: '/events', prisma });
app.register(notificationRoutes, { prefix: '/notifications', prisma });
app.register(cmsRoutes, { prefix: '/cms', prisma });
app.register(scannerRoutes, { prefix: '/scanner', prisma });

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

// --- Health check ---
app.get('/health', async () => ({
  status: 'ok',
  version: '0.1.0',
  timestamp: new Date().toISOString(),
}));

// --- Start server ---
async function start() {
  try {
    await prisma.$connect();
    console.log('✅ Database connected');

    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`🚀 API server running on http://localhost:${PORT}`);

    // Attach Socket.io WebSocket server to the same HTTP server (Req 9.1, 9.2, 9.3)
    const httpServer = app.server as any;
    realtime = createRealtimeServer({
      httpServer,
      cors: {
        origin: [DASHBOARD_ORIGIN, INVITATION_ORIGIN, SCANNER_ORIGIN],
        credentials: true,
      },
    });
    console.log('🔌 WebSocket server attached');
    console.log(`   Allowed origins: ${DASHBOARD_ORIGIN}, ${INVITATION_ORIGIN}, ${SCANNER_ORIGIN}`);

  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();

export { app, prisma, realtime, JWT_SECRET, REFRESH_SECRET };
