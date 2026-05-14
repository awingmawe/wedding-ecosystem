import { describe, it, expect, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { cors, buildAllowedOriginPatterns, isOriginAllowed, CORS_CONSTANTS } from './cors';

const TEST_DOMAIN = 'weddingapp.com';

describe('cors plugin', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
  });

  describe('buildAllowedOriginPatterns', () => {
    it('should build exact origins for dashboard and scanner', () => {
      const { exactOrigins } = buildAllowedOriginPatterns(TEST_DOMAIN);
      expect(exactOrigins).toContain(`https://dashboard.${TEST_DOMAIN}`);
      expect(exactOrigins).toContain(`https://scanner.${TEST_DOMAIN}`);
    });

    it('should build wildcard suffix for subdomain matching', () => {
      const { wildcardSuffix } = buildAllowedOriginPatterns(TEST_DOMAIN);
      expect(wildcardSuffix).toBe(`.${TEST_DOMAIN}`);
    });
  });

  describe('isOriginAllowed', () => {
    const { exactOrigins, wildcardSuffix } = buildAllowedOriginPatterns(TEST_DOMAIN);

    it('should allow dashboard origin', () => {
      expect(
        isOriginAllowed(`https://dashboard.${TEST_DOMAIN}`, exactOrigins, wildcardSuffix, [], false)
      ).toBe(true);
    });

    it('should allow scanner origin', () => {
      expect(
        isOriginAllowed(`https://scanner.${TEST_DOMAIN}`, exactOrigins, wildcardSuffix, [], false)
      ).toBe(true);
    });

    it('should allow event-slug subdomain origin (invitation app)', () => {
      expect(
        isOriginAllowed(`https://john-jane.${TEST_DOMAIN}`, exactOrigins, wildcardSuffix, [], false)
      ).toBe(true);
    });

    it('should block unauthorized origins', () => {
      expect(isOriginAllowed('https://evil.com', exactOrigins, wildcardSuffix, [], false)).toBe(
        false
      );
    });

    it('should block multi-level subdomains', () => {
      expect(
        isOriginAllowed(`https://sub.evil.${TEST_DOMAIN}`, exactOrigins, wildcardSuffix, [], false)
      ).toBe(false);
    });

    it('should block HTTP origins (non-HTTPS)', () => {
      expect(
        isOriginAllowed(`http://dashboard.${TEST_DOMAIN}`, exactOrigins, wildcardSuffix, [], false)
      ).toBe(false);
    });

    it('should allow localhost in development mode', () => {
      expect(isOriginAllowed('http://localhost:3000', exactOrigins, wildcardSuffix, [], true)).toBe(
        true
      );
    });

    it('should block localhost in production mode', () => {
      expect(
        isOriginAllowed('http://localhost:3000', exactOrigins, wildcardSuffix, [], false)
      ).toBe(false);
    });

    it('should allow additional origins when specified', () => {
      expect(
        isOriginAllowed(
          'https://custom.example.com',
          exactOrigins,
          wildcardSuffix,
          ['https://custom.example.com'],
          false
        )
      ).toBe(true);
    });
  });

  describe('CORS headers for allowed origins (Req 11.6)', () => {
    beforeEach(async () => {
      await app.register(cors, {
        productionDomain: TEST_DOMAIN,
        isDevelopment: false,
      });
      app.get('/test', async () => ({ ok: true }));
      await app.ready();
    });

    it('should set Access-Control-Allow-Origin for allowed origin', async () => {
      const origin = `https://dashboard.${TEST_DOMAIN}`;
      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { origin },
      });
      expect(response.headers['access-control-allow-origin']).toBe(origin);
    });

    it('should set Vary: Origin header', async () => {
      const origin = `https://scanner.${TEST_DOMAIN}`;
      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { origin },
      });
      expect(response.headers['vary']).toBe('Origin');
    });

    it('should set Access-Control-Allow-Credentials header', async () => {
      const origin = `https://dashboard.${TEST_DOMAIN}`;
      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { origin },
      });
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('should allow event-slug subdomain origins', async () => {
      const origin = `https://wedding-john.${TEST_DOMAIN}`;
      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { origin },
      });
      expect(response.headers['access-control-allow-origin']).toBe(origin);
    });
  });

  describe('CORS blocking for unauthorized origins (Req 11.6)', () => {
    beforeEach(async () => {
      await app.register(cors, {
        productionDomain: TEST_DOMAIN,
        isDevelopment: false,
      });
      app.get('/test', async () => ({ ok: true }));
      await app.ready();
    });

    it('should not set CORS headers for unauthorized origins', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { origin: 'https://evil.com' },
      });
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('should return 403 for preflight from unauthorized origin', async () => {
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/test',
        headers: { origin: 'https://evil.com' },
      });
      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('CORS_ORIGIN_NOT_ALLOWED');
    });
  });

  describe('preflight (OPTIONS) handling', () => {
    beforeEach(async () => {
      await app.register(cors, {
        productionDomain: TEST_DOMAIN,
        isDevelopment: false,
      });
      app.get('/test', async () => ({ ok: true }));
      await app.ready();
    });

    it('should respond 204 to preflight from allowed origin', async () => {
      const origin = `https://dashboard.${TEST_DOMAIN}`;
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/test',
        headers: { origin },
      });
      expect(response.statusCode).toBe(204);
    });

    it('should include Access-Control-Allow-Methods in preflight response', async () => {
      const origin = `https://dashboard.${TEST_DOMAIN}`;
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/test',
        headers: { origin },
      });
      expect(response.headers['access-control-allow-methods']).toBe(
        CORS_CONSTANTS.DEFAULT_ALLOWED_METHODS.join(', ')
      );
    });

    it('should include Access-Control-Allow-Headers in preflight response', async () => {
      const origin = `https://dashboard.${TEST_DOMAIN}`;
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/test',
        headers: { origin },
      });
      expect(response.headers['access-control-allow-headers']).toBe(
        CORS_CONSTANTS.DEFAULT_ALLOWED_HEADERS.join(', ')
      );
    });

    it('should include Access-Control-Max-Age in preflight response', async () => {
      const origin = `https://dashboard.${TEST_DOMAIN}`;
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/test',
        headers: { origin },
      });
      expect(response.headers['access-control-max-age']).toBe(
        CORS_CONSTANTS.DEFAULT_MAX_AGE.toString()
      );
    });
  });

  describe('development mode', () => {
    beforeEach(async () => {
      await app.register(cors, {
        productionDomain: TEST_DOMAIN,
        isDevelopment: true,
      });
      app.get('/test', async () => ({ ok: true }));
      await app.ready();
    });

    it('should allow localhost:3000 in development mode', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { origin: 'http://localhost:3000' },
      });
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    });

    it('should still allow production origins in development mode', async () => {
      const origin = `https://dashboard.${TEST_DOMAIN}`;
      const response = await app.inject({
        method: 'GET',
        url: '/test',
        headers: { origin },
      });
      expect(response.headers['access-control-allow-origin']).toBe(origin);
    });
  });

  describe('same-origin requests (no Origin header)', () => {
    beforeEach(async () => {
      await app.register(cors, {
        productionDomain: TEST_DOMAIN,
        isDevelopment: false,
      });
      app.get('/test', async () => ({ ok: true }));
      await app.ready();
    });

    it('should allow requests without Origin header (same-origin or non-browser)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/test',
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
