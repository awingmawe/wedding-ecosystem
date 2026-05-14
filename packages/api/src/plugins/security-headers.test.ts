import { describe, it, expect, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { securityHeaders, SECURITY_HEADERS_CONSTANTS } from './security-headers';

describe('securityHeaders', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
  });

  describe('security headers presence (Req 12.1)', () => {
    beforeEach(async () => {
      await app.register(securityHeaders, { isProduction: false });
      app.get('/test', async () => ({ ok: true }));
      await app.ready();
    });

    it('should add Content-Security-Policy header', async () => {
      const response = await app.inject({ method: 'GET', url: '/test' });
      expect(response.headers['content-security-policy']).toBe(
        SECURITY_HEADERS_CONSTANTS.DEFAULT_CSP
      );
    });

    it('should add X-Content-Type-Options: nosniff header', async () => {
      const response = await app.inject({ method: 'GET', url: '/test' });
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    it('should add X-Frame-Options: DENY header', async () => {
      const response = await app.inject({ method: 'GET', url: '/test' });
      expect(response.headers['x-frame-options']).toBe('DENY');
    });

    it('should add Referrer-Policy: strict-origin-when-cross-origin header', async () => {
      const response = await app.inject({ method: 'GET', url: '/test' });
      expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    });

    it('should add Permissions-Policy header', async () => {
      const response = await app.inject({ method: 'GET', url: '/test' });
      expect(response.headers['permissions-policy']).toBe(
        SECURITY_HEADERS_CONSTANTS.DEFAULT_PERMISSIONS_POLICY
      );
    });
  });

  describe('removed headers (Req 12.2)', () => {
    beforeEach(async () => {
      await app.register(securityHeaders, { isProduction: false });
      app.get('/test', async () => ({ ok: true }));
      await app.ready();
    });

    it('should not include X-Powered-By header', async () => {
      const response = await app.inject({ method: 'GET', url: '/test' });
      expect(response.headers['x-powered-by']).toBeUndefined();
    });

    it('should not include Server header', async () => {
      const response = await app.inject({ method: 'GET', url: '/test' });
      expect(response.headers['server']).toBeUndefined();
    });
  });

  describe('production error handling (Req 12.2)', () => {
    it('should hide stack traces in production error responses', async () => {
      await app.register(securityHeaders, { isProduction: true });
      app.get('/error', async () => {
        throw new Error('Sensitive internal error details');
      });
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/error' });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(500);
      expect(body.success).toBe(false);
      expect(body.error.message).toBe('An internal server error occurred.');
      expect(body.error.message).not.toContain('Sensitive internal error details');
      expect(body).not.toHaveProperty('stack');
    });

    it('should preserve error message for client errors (4xx) in production', async () => {
      await app.register(securityHeaders, { isProduction: true });
      app.get('/bad-request', async (_req, reply) => {
        reply.status(400);
        throw Object.assign(new Error('Invalid input provided'), { statusCode: 400 });
      });
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/bad-request' });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.message).toBe('Invalid input provided');
    });

    it('should not override error handler in non-production mode', async () => {
      await app.register(securityHeaders, { isProduction: false });
      app.get('/error', async () => {
        throw new Error('Dev error with details');
      });
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/error' });
      const body = JSON.parse(response.body);

      // In non-production, Fastify's default error handler includes the message
      expect(response.statusCode).toBe(500);
      expect(body.message).toBe('Dev error with details');
    });
  });

  describe('custom options', () => {
    it('should accept custom Content-Security-Policy', async () => {
      const customCSP = "default-src 'self'; script-src 'self'";
      await app.register(securityHeaders, {
        isProduction: false,
        contentSecurityPolicy: customCSP,
      });
      app.get('/test', async () => ({ ok: true }));
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/test' });
      expect(response.headers['content-security-policy']).toBe(customCSP);
    });

    it('should accept custom Permissions-Policy', async () => {
      const customPolicy = 'camera=(self), microphone=()';
      await app.register(securityHeaders, {
        isProduction: false,
        permissionsPolicy: customPolicy,
      });
      app.get('/test', async () => ({ ok: true }));
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/test' });
      expect(response.headers['permissions-policy']).toBe(customPolicy);
    });
  });

  describe('headers applied to all response types', () => {
    beforeEach(async () => {
      await app.register(securityHeaders, { isProduction: false });
      app.get('/json', async () => ({ data: 'test' }));
      app.get('/text', async (_req, reply) => {
        reply.type('text/plain').send('hello');
      });
      await app.ready();
    });

    it('should add security headers to JSON responses', async () => {
      const response = await app.inject({ method: 'GET', url: '/json' });
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
    });

    it('should add security headers to text responses', async () => {
      const response = await app.inject({ method: 'GET', url: '/text' });
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
    });
  });
});
