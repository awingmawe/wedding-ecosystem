import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import {
  auditLogger,
  buildAuditEntry,
  matchAutoLogRoute,
  DEFAULT_AUTO_LOG_ROUTES,
} from './audit-logger';

describe('auditLogger', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
  });

  describe('decorator: fastify.auditLog()', () => {
    it('should register the auditLog decorator on the fastify instance', async () => {
      await app.register(auditLogger);
      await app.ready();

      expect(app.auditLog).toBeDefined();
      expect(typeof app.auditLog).toBe('function');
    });

    it('should log an audit entry when auditLog is called from a route handler', async () => {
      const logSpy = vi.fn();

      await app.register(auditLogger);

      app.get('/manual-audit', async (request) => {
        // Attach a spy to the request logger
        request.log.info = logSpy;
        request.requestId = 'req-123';
        (request as any).user = { id: 'user-1', tenant_id: 'tenant-1' };

        app.auditLog(request, 'data_export', { format: 'csv' });
        return { ok: true };
      });

      await app.ready();
      await app.inject({ method: 'GET', url: '/manual-audit' });

      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          audit: expect.objectContaining({
            user_id: 'user-1',
            tenant_id: 'tenant-1',
            action: 'data_export',
            request_id: 'req-123',
            metadata: { format: 'csv' },
          }),
        }),
        'audit: data_export'
      );
    });

    it('should handle unauthenticated requests with null user fields', async () => {
      const logSpy = vi.fn();

      await app.register(auditLogger);

      app.get('/anon-audit', async (request) => {
        request.log.info = logSpy;
        request.requestId = 'req-456';
        // No user attached

        app.auditLog(request, 'login');
        return { ok: true };
      });

      await app.ready();
      await app.inject({ method: 'GET', url: '/anon-audit' });

      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          audit: expect.objectContaining({
            user_id: null,
            tenant_id: null,
            action: 'login',
            request_id: 'req-456',
          }),
        }),
        'audit: login'
      );
    });
  });

  describe('automatic hook-based audit logging', () => {
    it('should automatically log login on POST /auth/login with 2xx response', async () => {
      const logEntries: any[] = [];

      await app.register(auditLogger);

      app.addHook('onRequest', async (request) => {
        request.requestId = 'req-auto-1';
        (request as any).user = { id: 'user-2', tenant_id: 'tenant-2' };
        // Spy on the logger
        const originalInfo = request.log.info.bind(request.log);
        request.log.info = ((...args: any[]) => {
          if (args[0]?.audit) {
            logEntries.push(args[0].audit);
          }
          return originalInfo(...args);
        }) as any;
      });

      app.post('/auth/login', async () => ({ token: 'abc' }));
      await app.ready();

      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {},
      });

      expect(logEntries).toHaveLength(1);
      expect(logEntries[0]).toMatchObject({
        user_id: 'user-2',
        tenant_id: 'tenant-2',
        action: 'login',
        request_id: 'req-auto-1',
      });
      expect(logEntries[0].timestamp).toBeDefined();
    });

    it('should automatically log logout on POST /auth/logout', async () => {
      const logEntries: any[] = [];

      await app.register(auditLogger);

      app.addHook('onRequest', async (request) => {
        request.requestId = 'req-auto-2';
        (request as any).user = { id: 'user-3', tenant_id: 'tenant-3' };
        const originalInfo = request.log.info.bind(request.log);
        request.log.info = ((...args: any[]) => {
          if (args[0]?.audit) {
            logEntries.push(args[0].audit);
          }
          return originalInfo(...args);
        }) as any;
      });

      app.post('/auth/logout', async () => ({ ok: true }));
      await app.ready();

      await app.inject({ method: 'POST', url: '/auth/logout', payload: {} });

      expect(logEntries).toHaveLength(1);
      expect(logEntries[0].action).toBe('logout');
    });

    it('should NOT log audit entry for non-matching routes', async () => {
      const logEntries: any[] = [];

      await app.register(auditLogger);

      app.addHook('onRequest', async (request) => {
        request.requestId = 'req-auto-3';
        const originalInfo = request.log.info.bind(request.log);
        request.log.info = ((...args: any[]) => {
          if (args[0]?.audit) {
            logEntries.push(args[0].audit);
          }
          return originalInfo(...args);
        }) as any;
      });

      app.get('/guests', async () => ({ guests: [] }));
      await app.ready();

      await app.inject({ method: 'GET', url: '/guests' });

      expect(logEntries).toHaveLength(0);
    });

    it('should NOT log audit entry for failed requests (4xx/5xx)', async () => {
      const logEntries: any[] = [];

      await app.register(auditLogger);

      app.addHook('onRequest', async (request) => {
        request.requestId = 'req-auto-4';
        const originalInfo = request.log.info.bind(request.log);
        request.log.info = ((...args: any[]) => {
          if (args[0]?.audit) {
            logEntries.push(args[0].audit);
          }
          return originalInfo(...args);
        }) as any;
      });

      app.post('/auth/login', async (_req, reply) => {
        reply.status(401).send({ error: 'Invalid credentials' });
      });
      await app.ready();

      await app.inject({ method: 'POST', url: '/auth/login', payload: {} });

      expect(logEntries).toHaveLength(0);
    });

    it('should log bulk operations on POST /bulk', async () => {
      const logEntries: any[] = [];

      await app.register(auditLogger);

      app.addHook('onRequest', async (request) => {
        request.requestId = 'req-bulk';
        (request as any).user = { id: 'user-5', tenant_id: 'tenant-5' };
        const originalInfo = request.log.info.bind(request.log);
        request.log.info = ((...args: any[]) => {
          if (args[0]?.audit) {
            logEntries.push(args[0].audit);
          }
          return originalInfo(...args);
        }) as any;
      });

      app.post('/bulk/guests/import', async () => ({ imported: 50 }));
      await app.ready();

      await app.inject({ method: 'POST', url: '/bulk/guests/import', payload: {} });

      expect(logEntries).toHaveLength(1);
      expect(logEntries[0].action).toBe('bulk_operation');
    });

    it('should log tenant config changes on PUT /tenant/config', async () => {
      const logEntries: any[] = [];

      await app.register(auditLogger);

      app.addHook('onRequest', async (request) => {
        request.requestId = 'req-config';
        (request as any).user = { id: 'user-6', tenant_id: 'tenant-6' };
        const originalInfo = request.log.info.bind(request.log);
        request.log.info = ((...args: any[]) => {
          if (args[0]?.audit) {
            logEntries.push(args[0].audit);
          }
          return originalInfo(...args);
        }) as any;
      });

      app.put('/tenant/config', async () => ({ updated: true }));
      await app.ready();

      await app.inject({ method: 'PUT', url: '/tenant/config', payload: {} });

      expect(logEntries).toHaveLength(1);
      expect(logEntries[0].action).toBe('tenant_config_change');
    });
  });

  describe('custom autoLogRoutes option', () => {
    it('should use custom routes when provided', async () => {
      const logEntries: any[] = [];

      await app.register(auditLogger, {
        autoLogRoutes: [{ method: 'POST', prefix: '/custom/action', action: 'custom_action' }],
      });

      app.addHook('onRequest', async (request) => {
        request.requestId = 'req-custom';
        const originalInfo = request.log.info.bind(request.log);
        request.log.info = ((...args: any[]) => {
          if (args[0]?.audit) {
            logEntries.push(args[0].audit);
          }
          return originalInfo(...args);
        }) as any;
      });

      app.post('/custom/action', async () => ({ ok: true }));
      // Default route should NOT be logged
      app.post('/auth/login', async () => ({ token: 'abc' }));
      await app.ready();

      await app.inject({ method: 'POST', url: '/custom/action', payload: {} });
      await app.inject({ method: 'POST', url: '/auth/login', payload: {} });

      expect(logEntries).toHaveLength(1);
      expect(logEntries[0].action).toBe('custom_action');
    });
  });
});

describe('buildAuditEntry', () => {
  it('should build a complete audit entry with all fields', () => {
    const mockRequest = {
      requestId: 'req-build-1',
      user: { id: 'u1', tenant_id: 't1' },
    } as any;

    const entry = buildAuditEntry(mockRequest, 'login', { ip: '1.2.3.4' });

    expect(entry.user_id).toBe('u1');
    expect(entry.tenant_id).toBe('t1');
    expect(entry.action).toBe('login');
    expect(entry.request_id).toBe('req-build-1');
    expect(entry.metadata).toEqual({ ip: '1.2.3.4' });
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('should handle missing user gracefully', () => {
    const mockRequest = {
      requestId: 'req-build-2',
    } as any;

    const entry = buildAuditEntry(mockRequest, 'logout');

    expect(entry.user_id).toBeNull();
    expect(entry.tenant_id).toBeNull();
    expect(entry.action).toBe('logout');
    expect(entry.metadata).toBeUndefined();
  });

  it('should omit metadata field when empty object is provided', () => {
    const mockRequest = {
      requestId: 'req-build-3',
      user: { id: 'u2', tenant_id: 't2' },
    } as any;

    const entry = buildAuditEntry(mockRequest, 'data_export', {});

    expect(entry).not.toHaveProperty('metadata');
  });

  it('should use "unknown" when requestId is not set', () => {
    const mockRequest = {} as any;

    const entry = buildAuditEntry(mockRequest, 'login');

    expect(entry.request_id).toBe('unknown');
  });
});

describe('matchAutoLogRoute', () => {
  it('should match POST /auth/login to login action', () => {
    const result = matchAutoLogRoute('POST', '/auth/login', DEFAULT_AUTO_LOG_ROUTES);
    expect(result).toBe('login');
  });

  it('should match POST /auth/logout to logout action', () => {
    const result = matchAutoLogRoute('POST', '/auth/logout', DEFAULT_AUTO_LOG_ROUTES);
    expect(result).toBe('logout');
  });

  it('should match GET /export to data_export action', () => {
    const result = matchAutoLogRoute('GET', '/export/guests', DEFAULT_AUTO_LOG_ROUTES);
    expect(result).toBe('data_export');
  });

  it('should match POST /bulk to bulk_operation action', () => {
    const result = matchAutoLogRoute('POST', '/bulk/import', DEFAULT_AUTO_LOG_ROUTES);
    expect(result).toBe('bulk_operation');
  });

  it('should match PUT /tenant/config to tenant_config_change action', () => {
    const result = matchAutoLogRoute('PUT', '/tenant/config/theme', DEFAULT_AUTO_LOG_ROUTES);
    expect(result).toBe('tenant_config_change');
  });

  it('should return null for non-matching routes', () => {
    const result = matchAutoLogRoute('GET', '/guests', DEFAULT_AUTO_LOG_ROUTES);
    expect(result).toBeNull();
  });

  it('should return null for wrong HTTP method on matching prefix', () => {
    const result = matchAutoLogRoute('GET', '/auth/login', DEFAULT_AUTO_LOG_ROUTES);
    expect(result).toBeNull();
  });

  it('should be case-insensitive for HTTP method', () => {
    const result = matchAutoLogRoute('post', '/auth/login', DEFAULT_AUTO_LOG_ROUTES);
    expect(result).toBe('login');
  });
});
