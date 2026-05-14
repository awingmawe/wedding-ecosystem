import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getLoggerConfig,
  buildLoggerOptions,
  createRequestLogger,
  getFastifyLoggerConfig,
  logSerializers,
  DEFAULT_SERVICE_NAME,
  ENV_KEY,
  ENV_PRODUCTION,
} from './logger';

describe('Logger Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getLoggerConfig', () => {
    it('returns debug level and prettyPrint in development', () => {
      process.env[ENV_KEY] = 'development';
      const config = getLoggerConfig();

      expect(config.level).toBe('debug');
      expect(config.prettyPrint).toBe(true);
      expect(config.isProduction).toBe(false);
    });

    it('returns info level and no prettyPrint in production', () => {
      process.env[ENV_KEY] = ENV_PRODUCTION;
      const config = getLoggerConfig();

      expect(config.level).toBe('info');
      expect(config.prettyPrint).toBe(false);
      expect(config.isProduction).toBe(true);
    });

    it('defaults to development when NODE_ENV is not set', () => {
      delete process.env[ENV_KEY];
      const config = getLoggerConfig();

      expect(config.level).toBe('debug');
      expect(config.prettyPrint).toBe(true);
      expect(config.isProduction).toBe(false);
    });

    it('uses default service name when SERVICE_NAME is not set', () => {
      delete process.env.SERVICE_NAME;
      const config = getLoggerConfig();

      expect(config.serviceName).toBe(DEFAULT_SERVICE_NAME);
    });

    it('uses SERVICE_NAME environment variable when set', () => {
      process.env.SERVICE_NAME = 'wedding-websocket';
      const config = getLoggerConfig();

      expect(config.serviceName).toBe('wedding-websocket');
    });

    it('allows overrides', () => {
      process.env[ENV_KEY] = ENV_PRODUCTION;
      const config = getLoggerConfig({ level: 'warn', serviceName: 'custom-service' });

      expect(config.level).toBe('warn');
      expect(config.serviceName).toBe('custom-service');
      expect(config.isProduction).toBe(true);
    });
  });

  describe('buildLoggerOptions', () => {
    it('includes timestamp formatter in production', () => {
      process.env[ENV_KEY] = ENV_PRODUCTION;
      const options = buildLoggerOptions();

      expect(options.level).toBe('info');
      expect(options.timestamp).toBeDefined();
      expect(typeof options.timestamp).toBe('function');
      // Verify timestamp produces ISO format
      const timestampFn = options.timestamp as () => string;
      const result = timestampFn();
      expect(result).toMatch(/^,"timestamp":"\d{4}-\d{2}-\d{2}T/);
    });

    it('includes pino-pretty transport in development', () => {
      process.env[ENV_KEY] = 'development';
      const options = buildLoggerOptions();

      expect(options.level).toBe('debug');
      expect(options.transport).toBeDefined();
      expect((options.transport as any)?.target).toBe('pino-pretty');
    });

    it('does not include transport in production', () => {
      process.env[ENV_KEY] = ENV_PRODUCTION;
      const options = buildLoggerOptions();

      expect(options.transport).toBeUndefined();
    });

    it('uses messageKey "message" for structured output', () => {
      process.env[ENV_KEY] = ENV_PRODUCTION;
      const options = buildLoggerOptions();

      expect(options.messageKey).toBe('message');
    });

    it('formats level as string label', () => {
      process.env[ENV_KEY] = ENV_PRODUCTION;
      const options = buildLoggerOptions();

      const levelFormatter = options.formatters?.level;
      expect(levelFormatter).toBeDefined();
      expect(levelFormatter!('info', 30)).toEqual({ level: 'info' });
      expect(levelFormatter!('error', 50)).toEqual({ level: 'error' });
    });

    it('includes service_name in bindings formatter', () => {
      process.env[ENV_KEY] = ENV_PRODUCTION;
      process.env.SERVICE_NAME = 'test-service';
      const options = buildLoggerOptions();

      const bindingsFormatter = options.formatters?.bindings;
      expect(bindingsFormatter).toBeDefined();
      const result = bindingsFormatter!({ pid: 123, hostname: 'test' });
      expect(result).toEqual({ service_name: 'test-service' });
    });
  });

  describe('createRequestLogger', () => {
    it('creates a child logger with request_id', () => {
      const childBindings: Record<string, string> = {};
      const mockLogger = {
        child: vi.fn((bindings) => {
          Object.assign(childBindings, bindings);
          return mockLogger;
        }),
      } as any;

      createRequestLogger(mockLogger, { request_id: 'req-123' });

      expect(mockLogger.child).toHaveBeenCalledWith({ request_id: 'req-123' });
    });

    it('creates a child logger with tenant_id', () => {
      const mockLogger = {
        child: vi.fn().mockReturnThis(),
      } as any;

      createRequestLogger(mockLogger, { tenant_id: 'tenant-456' });

      expect(mockLogger.child).toHaveBeenCalledWith({ tenant_id: 'tenant-456' });
    });

    it('creates a child logger with both request_id and tenant_id', () => {
      const mockLogger = {
        child: vi.fn().mockReturnThis(),
      } as any;

      createRequestLogger(mockLogger, {
        request_id: 'req-789',
        tenant_id: 'tenant-abc',
      });

      expect(mockLogger.child).toHaveBeenCalledWith({
        request_id: 'req-789',
        tenant_id: 'tenant-abc',
      });
    });

    it('omits undefined fields from bindings', () => {
      const mockLogger = {
        child: vi.fn().mockReturnThis(),
      } as any;

      createRequestLogger(mockLogger, { request_id: undefined, tenant_id: undefined });

      expect(mockLogger.child).toHaveBeenCalledWith({});
    });
  });

  describe('logSerializers', () => {
    it('serializes request with method, url, request_id, and user_agent', () => {
      const mockRequest = {
        method: 'POST',
        url: '/guests',
        requestId: 'req-serial-1',
        headers: { 'user-agent': 'Mozilla/5.0' },
      };

      const result = logSerializers.req(mockRequest);

      expect(result).toEqual({
        method: 'POST',
        url: '/guests',
        request_id: 'req-serial-1',
        user_agent: 'Mozilla/5.0',
      });
    });

    it('falls back to x-request-id header when requestId is not set', () => {
      const mockRequest = {
        method: 'GET',
        url: '/health',
        headers: { 'x-request-id': 'header-id-1', 'user-agent': 'curl/7.0' },
      };

      const result = logSerializers.req(mockRequest);

      expect(result).toEqual({
        method: 'GET',
        url: '/health',
        request_id: 'header-id-1',
        user_agent: 'curl/7.0',
      });
    });

    it('serializes response with statusCode', () => {
      const mockReply = { statusCode: 200 };

      const result = logSerializers.res(mockReply);

      expect(result).toEqual({ statusCode: 200 });
    });
  });

  describe('getFastifyLoggerConfig', () => {
    it('includes serializers in the returned config', () => {
      process.env[ENV_KEY] = ENV_PRODUCTION;
      const config = getFastifyLoggerConfig();

      expect(config.serializers).toBeDefined();
      expect(config.serializers?.req).toBe(logSerializers.req);
      expect(config.serializers?.res).toBe(logSerializers.res);
    });

    it('includes all base logger options', () => {
      process.env[ENV_KEY] = ENV_PRODUCTION;
      const config = getFastifyLoggerConfig();

      expect(config.level).toBe('info');
      expect(config.messageKey).toBe('message');
      expect(config.formatters).toBeDefined();
      expect(config.timestamp).toBeDefined();
    });
  });
});
