import { describe, it, expect } from 'vitest';
import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  createValidationMiddleware,
  createGenericBodyValidationMiddleware,
  validateInput,
} from './input-validation.middleware';
import { ErrorCode } from '@wedding/shared';
import { createGuestSchema } from '@wedding/shared';

// --- Test Helpers ---

function createMockRequest(options: {
  body?: unknown;
  query?: unknown;
  params?: unknown;
}): FastifyRequest {
  return {
    body: options.body,
    query: options.query ?? {},
    params: options.params ?? {},
    headers: {},
  } as unknown as FastifyRequest;
}

function createMockReply(): FastifyReply & {
  statusCode: number;
  body: unknown;
} {
  const state = {
    statusCode: 200,
    body: null as unknown,
  };

  const reply = {
    get statusCode() { return state.statusCode; },
    get body() { return state.body; },
    status(code: number) {
      state.statusCode = code;
      return reply;
    },
    send(body: unknown) {
      state.body = body;
      return reply;
    },
    header() {
      return reply;
    },
  } as unknown as FastifyReply & {
    statusCode: number;
    body: unknown;
  };

  return reply;
}

// --- Tests ---

describe('Input Validation Middleware', () => {
  describe('createValidationMiddleware', () => {
    const testSchema = z.object({
      name: z.string().min(1).max(100),
      email: z.string().email(),
      age: z.number().int().min(0),
    });

    it('should pass valid body data', async () => {
      const middleware = createValidationMiddleware({ bodySchema: testSchema });
      const request = createMockRequest({
        body: { name: 'John', email: 'john@example.com', age: 25 },
      });
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.statusCode).toBe(200);
      expect(reply.body).toBeNull();
    });

    it('should reject invalid body data with 400', async () => {
      const middleware = createValidationMiddleware({ bodySchema: testSchema });
      const request = createMockRequest({
        body: { name: '', email: 'invalid', age: -1 },
      });
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.statusCode).toBe(400);
      const body = reply.body as { success: boolean; error: { code: string; details: unknown[] } };
      expect(body.success).toBe(false);
      expect(body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(body.error.details).toBeDefined();
      expect(body.error.details.length).toBeGreaterThan(0);
    });

    it('should return specific field errors', async () => {
      const middleware = createValidationMiddleware({ bodySchema: testSchema });
      const request = createMockRequest({
        body: { name: 'John', email: 'not-an-email', age: 25 },
      });
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.statusCode).toBe(400);
      const body = reply.body as { error: { details: Array<{ field: string; message: string }> } };
      const emailError = body.error.details.find((d) => d.field === 'email');
      expect(emailError).toBeDefined();
      expect(emailError!.message).toBeDefined();
    });

    it('should validate query parameters', async () => {
      const querySchema = z.object({
        page: z.coerce.number().int().min(1),
      });
      const middleware = createValidationMiddleware({ querySchema });
      const request = createMockRequest({ query: { page: 0 } });
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.statusCode).toBe(400);
    });

    it('should validate route parameters', async () => {
      const paramsSchema = z.object({
        id: z.string().uuid(),
      });
      const middleware = createValidationMiddleware({ paramsSchema });
      const request = createMockRequest({ params: { id: 'not-a-uuid' } });
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.statusCode).toBe(400);
    });

    it('should skip body validation when body is undefined', async () => {
      const middleware = createValidationMiddleware({ bodySchema: testSchema });
      const request = createMockRequest({ body: undefined });
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.statusCode).toBe(200);
    });

    it('should work with the shared createGuestSchema', async () => {
      const middleware = createValidationMiddleware({ bodySchema: createGuestSchema });
      const request = createMockRequest({
        body: {
          name: 'Budi Santoso',
          group: 'family',
          phone: '+6281234567890',
          email: 'budi@example.com',
          plus_one_count: 2,
        },
      });
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.statusCode).toBe(200);
    });

    it('should reject invalid guest group', async () => {
      const middleware = createValidationMiddleware({ bodySchema: createGuestSchema });
      const request = createMockRequest({
        body: {
          name: 'Budi',
          group: 'invalid_group',
        },
      });
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.statusCode).toBe(400);
      const body = reply.body as { error: { details: Array<{ field: string }> } };
      expect(body.error.details.some((d) => d.field === 'group')).toBe(true);
    });
  });

  describe('createGenericBodyValidationMiddleware', () => {
    it('should pass body with strings under 1000 chars', async () => {
      const middleware = createGenericBodyValidationMiddleware();
      const request = createMockRequest({
        body: { name: 'Short string', description: 'Another short one' },
      });
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.statusCode).toBe(200);
    });

    it('should reject body with strings over 1000 chars', async () => {
      const middleware = createGenericBodyValidationMiddleware();
      const longString = 'a'.repeat(1001);
      const request = createMockRequest({
        body: { name: 'Valid', description: longString },
      });
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.statusCode).toBe(400);
      const body = reply.body as { error: { details: Array<{ field: string; code: string }> } };
      expect(body.error.details[0].field).toBe('description');
      expect(body.error.details[0].code).toBe(ErrorCode.FIELD_TOO_LONG);
    });

    it('should validate nested object fields', async () => {
      const middleware = createGenericBodyValidationMiddleware();
      const longString = 'x'.repeat(1001);
      const request = createMockRequest({
        body: { nested: { deep: { value: longString } } },
      });
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.statusCode).toBe(400);
      const body = reply.body as { error: { details: Array<{ field: string }> } };
      expect(body.error.details[0].field).toBe('nested.deep.value');
    });

    it('should validate array items', async () => {
      const middleware = createGenericBodyValidationMiddleware();
      const longString = 'y'.repeat(1001);
      const request = createMockRequest({
        body: { items: ['short', longString] },
      });
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.statusCode).toBe(400);
      const body = reply.body as { error: { details: Array<{ field: string }> } };
      expect(body.error.details[0].field).toBe('items[1]');
    });

    it('should skip validation when body is not an object', async () => {
      const middleware = createGenericBodyValidationMiddleware();
      const request = createMockRequest({ body: null });
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.statusCode).toBe(200);
    });

    it('should pass when body is empty object', async () => {
      const middleware = createGenericBodyValidationMiddleware();
      const request = createMockRequest({ body: {} });
      const reply = createMockReply();

      await middleware(request, reply);

      expect(reply.statusCode).toBe(200);
    });
  });

  describe('validateInput', () => {
    const schema = z.object({
      email: z.string().email(),
      name: z.string().min(1).max(100),
    });

    it('should return success for valid input', () => {
      const result = validateInput(schema, {
        email: 'test@example.com',
        name: 'Test User',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('test@example.com');
        expect(result.data.name).toBe('Test User');
      }
    });

    it('should return errors for invalid input', () => {
      const result = validateInput(schema, {
        email: 'not-email',
        name: '',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.length).toBeGreaterThan(0);
      }
    });

    it('should return field-specific error codes', () => {
      const result = validateInput(schema, {
        email: 'invalid',
        name: 'Valid Name',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const emailError = result.errors.find((e) => e.field === 'email');
        expect(emailError).toBeDefined();
        expect(emailError!.code).toBe(ErrorCode.INVALID_FORMAT);
      }
    });
  });
});
