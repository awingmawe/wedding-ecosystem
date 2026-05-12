import { describe, it, expect } from 'vitest';
import { FastifyRequest, FastifyReply } from 'fastify';
import {
  createCORSMiddleware,
  isOriginAllowed,
  createDefaultCORSConfig,
  CORSConfig,
} from './cors.middleware';

// --- Test Helpers ---

function createMockRequest(
  origin?: string,
  method = 'GET'
): FastifyRequest {
  return {
    headers: origin ? { origin } : {},
    method,
  } as unknown as FastifyRequest;
}

function createMockReply(): FastifyReply & {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  sent: boolean;
} {
  const state = {
    statusCode: 200,
    body: null as unknown,
    headers: {} as Record<string, string>,
    sent: false,
  };

  const reply = {
    get statusCode() { return state.statusCode; },
    get body() { return state.body; },
    get headers() { return state.headers; },
    get sent() { return state.sent; },
    status(code: number) {
      state.statusCode = code;
      return reply;
    },
    send(body?: unknown) {
      state.body = body ?? null;
      state.sent = true;
      return reply;
    },
    header(key: string, value: string) {
      state.headers[key] = value;
      return reply;
    },
  } as unknown as FastifyReply & {
    statusCode: number;
    body: unknown;
    headers: Record<string, string>;
    sent: boolean;
  };

  return reply;
}

// --- Test Config ---

const testConfig: CORSConfig = {
  origins: {
    dashboard: ['https://dashboard.wedding.com', 'http://localhost:3000'],
    invitation: ['https://invitation.wedding.com', 'http://localhost:3001'],
    scanner: ['https://scanner.wedding.com', 'http://localhost:3002'],
  },
  additionalOrigins: ['https://admin.wedding.com'],
};

// --- Tests ---

describe('CORS Middleware', () => {
  describe('createCORSMiddleware', () => {
    it('should set CORS headers for allowed origin', async () => {
      const middleware = createCORSMiddleware(testConfig);
      const request = createMockRequest('https://dashboard.wedding.com');
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.headers['Access-Control-Allow-Origin']).toBe(
        'https://dashboard.wedding.com'
      );
      expect(reply.headers['Access-Control-Allow-Credentials']).toBe('true');
      expect(reply.headers['Vary']).toBe('Origin');
    });

    it('should not set CORS headers for disallowed origin', async () => {
      const middleware = createCORSMiddleware(testConfig);
      const request = createMockRequest('https://evil.com');
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.headers['Access-Control-Allow-Origin']).toBeUndefined();
    });

    it('should not set CORS headers when no origin header', async () => {
      const middleware = createCORSMiddleware(testConfig);
      const request = createMockRequest(undefined);
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.headers['Access-Control-Allow-Origin']).toBeUndefined();
    });

    it('should handle preflight OPTIONS request for allowed origin', async () => {
      const middleware = createCORSMiddleware(testConfig);
      const request = createMockRequest('https://scanner.wedding.com', 'OPTIONS');
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.statusCode).toBe(204);
      expect(reply.headers['Access-Control-Allow-Origin']).toBe(
        'https://scanner.wedding.com'
      );
      expect(reply.headers['Access-Control-Allow-Methods']).toContain('GET');
      expect(reply.headers['Access-Control-Allow-Methods']).toContain('POST');
      expect(reply.headers['Access-Control-Allow-Headers']).toContain('Authorization');
      expect(reply.headers['Access-Control-Max-Age']).toBe('86400');
    });

    it('should handle preflight OPTIONS request for disallowed origin', async () => {
      const middleware = createCORSMiddleware(testConfig);
      const request = createMockRequest('https://evil.com', 'OPTIONS');
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.statusCode).toBe(204);
      expect(reply.headers['Access-Control-Allow-Origin']).toBeUndefined();
    });

    it('should allow additional origins', async () => {
      const middleware = createCORSMiddleware(testConfig);
      const request = createMockRequest('https://admin.wedding.com');
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.headers['Access-Control-Allow-Origin']).toBe(
        'https://admin.wedding.com'
      );
    });

    it('should expose rate limit headers', async () => {
      const middleware = createCORSMiddleware(testConfig);
      const request = createMockRequest('https://dashboard.wedding.com');
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.headers['Access-Control-Expose-Headers']).toContain(
        'X-RateLimit-Limit'
      );
      expect(reply.headers['Access-Control-Expose-Headers']).toContain(
        'Retry-After'
      );
    });

    it('should allow localhost origins for development', async () => {
      const middleware = createCORSMiddleware(testConfig);
      const request = createMockRequest('http://localhost:3000');
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.headers['Access-Control-Allow-Origin']).toBe(
        'http://localhost:3000'
      );
    });
  });

  describe('isOriginAllowed', () => {
    it('should return true for allowed dashboard origin', () => {
      expect(
        isOriginAllowed(testConfig, 'https://dashboard.wedding.com', 'dashboard')
      ).toBe(true);
    });

    it('should return false for wrong app origin', () => {
      expect(
        isOriginAllowed(testConfig, 'https://dashboard.wedding.com', 'scanner')
      ).toBe(false);
    });

    it('should return true when checking any app', () => {
      expect(
        isOriginAllowed(testConfig, 'https://invitation.wedding.com')
      ).toBe(true);
    });

    it('should return false for unknown origin', () => {
      expect(isOriginAllowed(testConfig, 'https://unknown.com')).toBe(false);
    });

    it('should check additional origins', () => {
      expect(
        isOriginAllowed(testConfig, 'https://admin.wedding.com')
      ).toBe(true);
    });
  });

  describe('createDefaultCORSConfig', () => {
    it('should create config with localhost origins', () => {
      const config = createDefaultCORSConfig();
      expect(config.origins.dashboard).toContain('http://localhost:3000');
      expect(config.origins.invitation).toContain('http://localhost:3001');
      expect(config.origins.scanner).toContain('http://localhost:3002');
    });

    it('should allow overrides', () => {
      const config = createDefaultCORSConfig({
        origins: {
          dashboard: ['https://prod.example.com'],
          invitation: ['https://invite.example.com'],
          scanner: ['https://scan.example.com'],
        },
      });
      expect(config.origins.dashboard).toContain('https://prod.example.com');
    });
  });
});
