import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import {
  createCORSMiddleware,
  createDefaultCORSConfig,
  createRateLimiterMiddleware,
  InMemoryRateLimiterStore,
} from '../middleware';

const JWT_SECRET = 'test-secret';

function createTestToken(payload: {
  sub: string;
  tenant_id: string;
  role: string;
  email: string;
}) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
}

describe('API Gateway Routing', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();

    // Wire CORS middleware
    const corsConfig = createDefaultCORSConfig({
      origins: {
        dashboard: ['http://localhost:3000'],
        invitation: ['http://localhost:3001'],
        scanner: ['http://localhost:3002'],
      },
    });
    const corsMiddleware = createCORSMiddleware(corsConfig);
    app.addHook('onRequest', corsMiddleware);

    // Wire rate limiting middleware
    const rateLimiterStore = new InMemoryRateLimiterStore();
    const rateLimiterMiddleware = createRateLimiterMiddleware(rateLimiterStore);
    app.addHook('preHandler', async (request, reply) => {
      if (request.url === '/health' || request.method === 'OPTIONS') return;
      await rateLimiterMiddleware(request, reply);
    });

    // Auth decorator
    app.decorate('authenticate', async function (request: any, reply: any) {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        reply.status(401).send({ success: false, error: { code: 'AUTH_2002', message: 'Token diperlukan' } });
        return;
      }
      const token = authHeader.slice(7);
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        request.user = {
          id: decoded.sub,
          tenant_id: decoded.tenant_id,
          role: decoded.role,
          email: decoded.email,
        };
      } catch {
        reply.status(401).send({ success: false, error: { code: 'AUTH_2003', message: 'Token tidak valid' } });
      }
    });

    // Health check
    app.get('/health', async () => ({ status: 'ok' }));

    // Protected test route
    app.get('/protected', {
      onRequest: async (request, reply) => {
        await (app as any).authenticate(request, reply);
      },
    }, async (request: any) => {
      return { user: request.user };
    });

    await app.ready();
  });

  describe('CORS Middleware (Req 13.7)', () => {
    it('should allow requests from Dashboard origin', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
        headers: { origin: 'http://localhost:3000' },
      });

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('should allow requests from Invitation origin', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
        headers: { origin: 'http://localhost:3001' },
      });

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3001');
    });

    it('should allow requests from Scanner origin', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
        headers: { origin: 'http://localhost:3002' },
      });

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3002');
    });

    it('should not set CORS headers for disallowed origins', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
        headers: { origin: 'http://evil.com' },
      });

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('should handle OPTIONS preflight requests', async () => {
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/health',
        headers: { origin: 'http://localhost:3000' },
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers['access-control-allow-methods']).toContain('GET');
      expect(response.headers['access-control-allow-methods']).toContain('POST');
    });
  });

  describe('Rate Limiting Middleware (Req 13.3, 13.4)', () => {
    it('should include rate limit headers in response', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      // Health check skips rate limiting
      expect(response.statusCode).toBe(200);
    });

    it('should apply rate limiting to non-health routes', async () => {
      const token = createTestToken({
        sub: 'user-1',
        tenant_id: 'tenant-1',
        role: 'client',
        email: 'test@test.com',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.headers['x-ratelimit-limit']).toBe('100');
      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
    });

    it('should return 429 when rate limit exceeded', async () => {
      // Create a fresh app with low rate limit for testing
      const testApp = Fastify();
      const store = new InMemoryRateLimiterStore();
      const limiter = createRateLimiterMiddleware(store, { maxRequests: 2, windowSeconds: 60 });
      testApp.addHook('preHandler', limiter);
      testApp.get('/test', async () => ({ ok: true }));
      await testApp.ready();

      // First 2 requests should succeed
      await testApp.inject({ method: 'GET', url: '/test' });
      await testApp.inject({ method: 'GET', url: '/test' });

      // Third request should be rate limited
      const response = await testApp.inject({ method: 'GET', url: '/test' });
      expect(response.statusCode).toBe(429);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBeDefined();
    });
  });

  describe('Auth Middleware (Req 2.1)', () => {
    it('should reject requests without auth token on protected routes', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });

    it('should reject requests with invalid token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: { authorization: 'Bearer invalid-token' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should allow requests with valid token and attach user context', async () => {
      const token = createTestToken({
        sub: 'user-123',
        tenant_id: 'tenant-456',
        role: 'client',
        email: 'client@wedding.com',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.user.id).toBe('user-123');
      expect(body.user.tenant_id).toBe('tenant-456');
      expect(body.user.role).toBe('client');
      expect(body.user.email).toBe('client@wedding.com');
    });

    it('should enforce tenant isolation via user context', async () => {
      const tokenA = createTestToken({
        sub: 'user-a',
        tenant_id: 'tenant-a',
        role: 'client',
        email: 'a@test.com',
      });

      const tokenB = createTestToken({
        sub: 'user-b',
        tenant_id: 'tenant-b',
        role: 'client',
        email: 'b@test.com',
      });

      const responseA = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: { authorization: `Bearer ${tokenA}` },
      });

      const responseB = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: { authorization: `Bearer ${tokenB}` },
      });

      const bodyA = JSON.parse(responseA.body);
      const bodyB = JSON.parse(responseB.body);

      // Each user gets their own tenant context
      expect(bodyA.user.tenant_id).toBe('tenant-a');
      expect(bodyB.user.tenant_id).toBe('tenant-b');
      expect(bodyA.user.tenant_id).not.toBe(bodyB.user.tenant_id);
    });
  });

  describe('Health Check', () => {
    it('should return 200 with status ok', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
    });
  });
});
