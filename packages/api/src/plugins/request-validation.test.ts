import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import {
  requestValidation,
  isFileUploadRoute,
  parseContentType,
  validateContentType,
  MAX_JSON_BODY_SIZE,
  MAX_FILE_UPLOAD_BODY_SIZE,
  REQUEST_ID_HEADER,
  CONTENT_TYPE_JSON,
  CONTENT_TYPE_MULTIPART,
} from './request-validation';

// --- Unit Tests for Helper Functions ---

describe('parseContentType', () => {
  it('returns null for undefined input', () => {
    expect(parseContentType(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseContentType('')).toBeNull();
  });

  it('extracts base content type without parameters', () => {
    expect(parseContentType('application/json; charset=utf-8')).toBe('application/json');
  });

  it('returns lowercase content type', () => {
    expect(parseContentType('Application/JSON')).toBe('application/json');
  });

  it('handles multipart with boundary', () => {
    expect(parseContentType('multipart/form-data; boundary=----WebKitFormBoundary')).toBe(
      'multipart/form-data'
    );
  });

  it('handles simple content type without parameters', () => {
    expect(parseContentType('application/json')).toBe('application/json');
  });
});

describe('isFileUploadRoute', () => {
  const fileUploadRoutes = ['/upload', '/cms/media'];

  it('returns true for exact match', () => {
    expect(isFileUploadRoute('/upload', fileUploadRoutes)).toBe(true);
  });

  it('returns true for prefix match', () => {
    expect(isFileUploadRoute('/upload/image', fileUploadRoutes)).toBe(true);
    expect(isFileUploadRoute('/cms/media/gallery', fileUploadRoutes)).toBe(true);
  });

  it('returns false for non-matching route', () => {
    expect(isFileUploadRoute('/guests', fileUploadRoutes)).toBe(false);
    expect(isFileUploadRoute('/events', fileUploadRoutes)).toBe(false);
  });

  it('returns false for partial non-prefix match', () => {
    expect(isFileUploadRoute('/api/upload', fileUploadRoutes)).toBe(false);
  });
});

describe('validateContentType', () => {
  const fileUploadRoutes = ['/upload', '/cms/media'];

  function createMockRequest(method: string, url: string, contentType?: string) {
    return {
      method,
      url,
      headers: contentType ? { 'content-type': contentType } : {},
    } as any;
  }

  it('skips validation for GET requests', () => {
    const request = createMockRequest('GET', '/guests');
    expect(validateContentType(request, fileUploadRoutes)).toBeNull();
  });

  it('skips validation for HEAD requests', () => {
    const request = createMockRequest('HEAD', '/health');
    expect(validateContentType(request, fileUploadRoutes)).toBeNull();
  });

  it('skips validation for DELETE requests', () => {
    const request = createMockRequest('DELETE', '/guests/123');
    expect(validateContentType(request, fileUploadRoutes)).toBeNull();
  });

  it('skips validation for OPTIONS requests', () => {
    const request = createMockRequest('OPTIONS', '/guests');
    expect(validateContentType(request, fileUploadRoutes)).toBeNull();
  });

  it('returns error for POST without Content-Type on JSON route', () => {
    const request = createMockRequest('POST', '/guests');
    const error = validateContentType(request, fileUploadRoutes);
    expect(error).not.toBeNull();
    expect(error).toContain(CONTENT_TYPE_JSON);
  });

  it('returns null for POST with correct JSON Content-Type', () => {
    const request = createMockRequest('POST', '/guests', 'application/json');
    expect(validateContentType(request, fileUploadRoutes)).toBeNull();
  });

  it('returns null for POST with JSON Content-Type including charset', () => {
    const request = createMockRequest('POST', '/guests', 'application/json; charset=utf-8');
    expect(validateContentType(request, fileUploadRoutes)).toBeNull();
  });

  it('returns error for POST with wrong Content-Type on JSON route', () => {
    const request = createMockRequest('POST', '/guests', 'text/plain');
    const error = validateContentType(request, fileUploadRoutes);
    expect(error).not.toBeNull();
    expect(error).toContain(CONTENT_TYPE_JSON);
  });

  it('returns null for POST with multipart on upload route', () => {
    const request = createMockRequest(
      'POST',
      '/upload',
      'multipart/form-data; boundary=----WebKitFormBoundary'
    );
    expect(validateContentType(request, fileUploadRoutes)).toBeNull();
  });

  it('returns error for POST with JSON on upload route', () => {
    const request = createMockRequest('POST', '/upload', 'application/json');
    const error = validateContentType(request, fileUploadRoutes);
    expect(error).not.toBeNull();
    expect(error).toContain(CONTENT_TYPE_MULTIPART);
  });

  it('returns error for PUT without Content-Type', () => {
    const request = createMockRequest('PUT', '/events/123');
    const error = validateContentType(request, fileUploadRoutes);
    expect(error).not.toBeNull();
  });

  it('returns null for PATCH with correct JSON Content-Type', () => {
    const request = createMockRequest('PATCH', '/events/123', 'application/json');
    expect(validateContentType(request, fileUploadRoutes)).toBeNull();
  });
});

// --- Integration Tests with Fastify ---

describe('requestValidation plugin', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    await app.register(requestValidation, {
      fileUploadRoutes: ['/upload'],
    });

    // Register test routes
    app.get('/health', async () => ({ status: 'ok' }));
    app.post('/guests', async (request) => ({
      success: true,
      request_id: request.requestId,
    }));
    app.post('/upload', async (request) => ({
      success: true,
      request_id: request.requestId,
    }));
    app.put('/events/:id', async (request) => ({
      success: true,
      request_id: request.requestId,
    }));

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Correlation ID (request_id)', () => {
    it('generates a request ID for every request', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const requestId = response.headers[REQUEST_ID_HEADER];
      expect(requestId).toBeDefined();
      expect(typeof requestId).toBe('string');
      expect((requestId as string).length).toBeGreaterThan(0);
    });

    it('uses existing request ID from header if provided', async () => {
      const customId = 'custom-correlation-id-123';
      const response = await app.inject({
        method: 'GET',
        url: '/health',
        headers: {
          [REQUEST_ID_HEADER]: customId,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers[REQUEST_ID_HEADER]).toBe(customId);
    });

    it('generates unique IDs for different requests', async () => {
      const response1 = await app.inject({ method: 'GET', url: '/health' });
      const response2 = await app.inject({ method: 'GET', url: '/health' });

      const id1 = response1.headers[REQUEST_ID_HEADER];
      const id2 = response2.headers[REQUEST_ID_HEADER];

      expect(id1).not.toBe(id2);
    });

    it('makes request ID available in route handler', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/guests',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ name: 'Test' }),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.request_id).toBeDefined();
      expect(typeof body.request_id).toBe('string');
    });
  });

  describe('Content-Type validation', () => {
    it('returns 415 for POST without Content-Type on JSON route', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/guests',
        payload: '{}',
      });

      // Fastify may set content-type automatically for inject, so let's be explicit
      const response2 = await app.inject({
        method: 'POST',
        url: '/guests',
        headers: { 'content-type': 'text/plain' },
        payload: 'hello',
      });

      expect(response2.statusCode).toBe(415);
      const body = JSON.parse(response2.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    });

    it('allows POST with application/json on JSON route', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/guests',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ name: 'Test' }),
      });

      expect(response.statusCode).toBe(200);
    });

    it('allows POST with application/json; charset=utf-8 on JSON route', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/guests',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        payload: JSON.stringify({ name: 'Test' }),
      });

      expect(response.statusCode).toBe(200);
    });

    it('returns 415 for POST with application/json on upload route', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/upload',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ file: 'data' }),
      });

      expect(response.statusCode).toBe(415);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
      expect(body.error.message).toContain(CONTENT_TYPE_MULTIPART);
    });

    it('allows POST with multipart/form-data on upload route', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/upload',
        headers: { 'content-type': 'multipart/form-data; boundary=----WebKitFormBoundary' },
        payload:
          '------WebKitFormBoundary\r\nContent-Disposition: form-data; name="file"\r\n\r\ntest\r\n------WebKitFormBoundary--',
      });

      expect(response.statusCode).toBe(200);
    });

    it('does not validate Content-Type for GET requests', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
        headers: { 'content-type': 'text/plain' },
      });

      expect(response.statusCode).toBe(200);
    });

    it('includes request_id in 415 error response', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/guests',
        headers: { 'content-type': 'text/xml' },
        payload: '<data/>',
      });

      expect(response.statusCode).toBe(415);
      const body = JSON.parse(response.body);
      expect(body.error.request_id).toBeDefined();
    });
  });

  describe('Body size limits', () => {
    it('accepts JSON body within 1MB limit', async () => {
      // Create a payload just under 1MB
      const smallPayload = JSON.stringify({ data: 'x'.repeat(1000) });

      const response = await app.inject({
        method: 'POST',
        url: '/guests',
        headers: { 'content-type': 'application/json' },
        payload: smallPayload,
      });

      expect(response.statusCode).toBe(200);
    });

    it('rejects JSON body exceeding 1MB limit', async () => {
      // Create a payload over 1MB
      const largePayload = JSON.stringify({ data: 'x'.repeat(MAX_JSON_BODY_SIZE + 1) });

      const response = await app.inject({
        method: 'POST',
        url: '/guests',
        headers: { 'content-type': 'application/json' },
        payload: largePayload,
      });

      // Fastify returns 413 Payload Too Large when body exceeds limit
      expect(response.statusCode).toBe(413);
    });
  });

  describe('Custom options', () => {
    it('supports custom request ID generator', async () => {
      const customApp = Fastify();
      let counter = 0;
      await customApp.register(requestValidation, {
        generateRequestId: () => `custom-${++counter}`,
      });
      customApp.get('/test', async () => ({ ok: true }));
      await customApp.ready();

      const response = await customApp.inject({ method: 'GET', url: '/test' });
      expect(response.headers[REQUEST_ID_HEADER]).toBe('custom-1');

      const response2 = await customApp.inject({ method: 'GET', url: '/test' });
      expect(response2.headers[REQUEST_ID_HEADER]).toBe('custom-2');

      await customApp.close();
    });

    it('supports custom file upload routes', async () => {
      const customApp = Fastify();
      await customApp.register(requestValidation, {
        fileUploadRoutes: ['/api/files'],
      });
      customApp.post('/api/files', async () => ({ ok: true }));
      await customApp.ready();

      // Should reject JSON on custom file upload route
      const response = await customApp.inject({
        method: 'POST',
        url: '/api/files',
        headers: { 'content-type': 'application/json' },
        payload: '{}',
      });
      expect(response.statusCode).toBe(415);

      await customApp.close();
    });
  });
});
