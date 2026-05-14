import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { healthRoutes } from './health';

// Mock the Redis config module
vi.mock('../config/redis', () => ({
  getCacheClient: vi.fn(),
  getPubSubClient: vi.fn(),
}));

import { getCacheClient, getPubSubClient } from '../config/redis';

// Mock PrismaClient
function createMockPrisma(options?: { queryFails?: boolean; queryDelay?: number }) {
  return {
    $queryRawUnsafe: vi.fn(async () => {
      if (options?.queryDelay) {
        await new Promise((resolve) => setTimeout(resolve, options.queryDelay));
      }
      if (options?.queryFails) {
        throw new Error('Connection refused');
      }
      return [{ '?column?': 1 }];
    }),
  } as any;
}

// Mock RealtimeServer
function createMockRealtimeServer(options?: { isNull?: boolean }) {
  if (options?.isNull) return null;
  return {
    io: { engine: { clientsCount: 5 } },
    connections: new Map(),
    broadcastCheckIn: vi.fn(),
    broadcastRsvpUpdate: vi.fn(),
    broadcastGoShow: vi.fn(),
    broadcastStats: vi.fn(),
    getConnectionCount: vi.fn(() => 0),
    close: vi.fn(),
  };
}

describe('healthRoutes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    vi.clearAllMocks();
  });

  describe('GET /health - all dependencies healthy', () => {
    beforeEach(async () => {
      const mockPrisma = createMockPrisma();
      const mockRealtime = createMockRealtimeServer();

      // Mock Redis clients that respond to ping
      const mockRedisClient = { ping: vi.fn().mockResolvedValue('PONG') };
      vi.mocked(getCacheClient).mockReturnValue(mockRedisClient as any);
      vi.mocked(getPubSubClient).mockReturnValue(mockRedisClient as any);

      await app.register(healthRoutes, {
        prisma: mockPrisma,
        getRealtimeServer: () => mockRealtime as any,
      });
      await app.ready();
    });

    it('should return HTTP 200 with healthy status', async () => {
      const response = await app.inject({ method: 'GET', url: '/health' });
      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.status).toBe('healthy');
    });

    it('should return structured HealthCheckResponse', async () => {
      const response = await app.inject({ method: 'GET', url: '/health' });
      const body = JSON.parse(response.body);

      expect(body).toHaveProperty('status');
      expect(body).toHaveProperty('timestamp');
      expect(body).toHaveProperty('version');
      expect(body).toHaveProperty('uptime');
      expect(body).toHaveProperty('dependencies');
      expect(body.dependencies).toHaveProperty('postgresql');
      expect(body.dependencies).toHaveProperty('redis_cache');
      expect(body.dependencies).toHaveProperty('redis_pubsub');
      expect(body.dependencies).toHaveProperty('websocket');
    });

    it('should report all dependencies as up', async () => {
      const response = await app.inject({ method: 'GET', url: '/health' });
      const body = JSON.parse(response.body);

      expect(body.dependencies.postgresql.status).toBe('up');
      expect(body.dependencies.redis_cache.status).toBe('up');
      expect(body.dependencies.redis_pubsub.status).toBe('up');
      expect(body.dependencies.websocket.status).toBe('up');
    });

    it('should include latency values for each dependency', async () => {
      const response = await app.inject({ method: 'GET', url: '/health' });
      const body = JSON.parse(response.body);

      expect(typeof body.dependencies.postgresql.latency).toBe('number');
      expect(typeof body.dependencies.redis_cache.latency).toBe('number');
      expect(typeof body.dependencies.redis_pubsub.latency).toBe('number');
      expect(typeof body.dependencies.websocket.latency).toBe('number');
    });

    it('should include a valid ISO timestamp', async () => {
      const response = await app.inject({ method: 'GET', url: '/health' });
      const body = JSON.parse(response.body);

      const parsed = new Date(body.timestamp);
      expect(parsed.toISOString()).toBe(body.timestamp);
    });

    it('should include version string', async () => {
      const response = await app.inject({ method: 'GET', url: '/health' });
      const body = JSON.parse(response.body);

      expect(typeof body.version).toBe('string');
      expect(body.version.length).toBeGreaterThan(0);
    });

    it('should include uptime in seconds', async () => {
      const response = await app.inject({ method: 'GET', url: '/health' });
      const body = JSON.parse(response.body);

      expect(typeof body.uptime).toBe('number');
      expect(body.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('GET /health - PostgreSQL down', () => {
    it('should return HTTP 503 with unhealthy status', async () => {
      const mockPrisma = createMockPrisma({ queryFails: true });
      const mockRealtime = createMockRealtimeServer();
      const mockRedisClient = { ping: vi.fn().mockResolvedValue('PONG') };
      vi.mocked(getCacheClient).mockReturnValue(mockRedisClient as any);
      vi.mocked(getPubSubClient).mockReturnValue(mockRedisClient as any);

      await app.register(healthRoutes, {
        prisma: mockPrisma,
        getRealtimeServer: () => mockRealtime as any,
      });
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/health' });
      expect(response.statusCode).toBe(503);

      const body = JSON.parse(response.body);
      expect(body.status).toBe('unhealthy');
      expect(body.dependencies.postgresql.status).toBe('down');
    });
  });

  describe('GET /health - Redis down (degraded)', () => {
    it('should return HTTP 503 with degraded status when Redis cache is down', async () => {
      const mockPrisma = createMockPrisma();
      const mockRealtime = createMockRealtimeServer();

      // Cache client returns null (not configured)
      vi.mocked(getCacheClient).mockReturnValue(null);
      vi.mocked(getPubSubClient).mockReturnValue({
        ping: vi.fn().mockResolvedValue('PONG'),
      } as any);

      await app.register(healthRoutes, {
        prisma: mockPrisma,
        getRealtimeServer: () => mockRealtime as any,
      });
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/health' });
      expect(response.statusCode).toBe(503);

      const body = JSON.parse(response.body);
      expect(body.status).toBe('degraded');
      expect(body.dependencies.redis_cache.status).toBe('down');
      expect(body.dependencies.postgresql.status).toBe('up');
    });

    it('should return degraded when Redis ping throws', async () => {
      const mockPrisma = createMockPrisma();
      const mockRealtime = createMockRealtimeServer();

      const failingClient = { ping: vi.fn().mockRejectedValue(new Error('Connection refused')) };
      vi.mocked(getCacheClient).mockReturnValue(failingClient as any);
      vi.mocked(getPubSubClient).mockReturnValue(failingClient as any);

      await app.register(healthRoutes, {
        prisma: mockPrisma,
        getRealtimeServer: () => mockRealtime as any,
      });
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/health' });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(503);
      expect(body.status).toBe('degraded');
      expect(body.dependencies.redis_cache.status).toBe('down');
      expect(body.dependencies.redis_pubsub.status).toBe('down');
    });
  });

  describe('GET /health - WebSocket server down', () => {
    it('should return HTTP 503 with unhealthy status when realtime is null', async () => {
      const mockPrisma = createMockPrisma();
      const mockRedisClient = { ping: vi.fn().mockResolvedValue('PONG') };
      vi.mocked(getCacheClient).mockReturnValue(mockRedisClient as any);
      vi.mocked(getPubSubClient).mockReturnValue(mockRedisClient as any);

      await app.register(healthRoutes, {
        prisma: mockPrisma,
        getRealtimeServer: () => null,
      });
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/health' });
      expect(response.statusCode).toBe(503);

      const body = JSON.parse(response.body);
      expect(body.status).toBe('unhealthy');
      expect(body.dependencies.websocket.status).toBe('down');
    });
  });

  describe('GET /health - response time', () => {
    it('should respond within 500ms under normal conditions', async () => {
      const mockPrisma = createMockPrisma();
      const mockRealtime = createMockRealtimeServer();
      const mockRedisClient = { ping: vi.fn().mockResolvedValue('PONG') };
      vi.mocked(getCacheClient).mockReturnValue(mockRedisClient as any);
      vi.mocked(getPubSubClient).mockReturnValue(mockRedisClient as any);

      await app.register(healthRoutes, {
        prisma: mockPrisma,
        getRealtimeServer: () => mockRealtime as any,
      });
      await app.ready();

      const start = Date.now();
      await app.inject({ method: 'GET', url: '/health' });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(500);
    });
  });
});
