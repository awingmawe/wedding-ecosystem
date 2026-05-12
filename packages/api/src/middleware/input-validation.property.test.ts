import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { z } from 'zod';
import {
  createValidationMiddleware,
  createGenericBodyValidationMiddleware,
  validateInput,
} from './input-validation.middleware';
import { ErrorCode, MAX_TEXT_LENGTH, createGuestSchema } from '@wedding/shared';
import type { FastifyRequest, FastifyReply } from 'fastify';

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

function createMockReply(): FastifyReply & { statusCode: number; body: unknown } {
  const state = { statusCode: 200, body: null as unknown };
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
    header() { return reply; },
  } as unknown as FastifyReply & { statusCode: number; body: unknown };
  return reply;
}

// --- Arbitraries ---

/** Generates strings that exceed the max text length (1000 chars) using printable ASCII */
const arbOverlengthString = fc
  .integer({ min: MAX_TEXT_LENGTH + 1, max: MAX_TEXT_LENGTH + 200 })
  .chain((len) =>
    fc.stringMatching(new RegExp(`^[a-zA-Z0-9]{${len}}$`))
  );

/** Generates invalid email formats (strings that are clearly not valid emails) */
const arbInvalidEmail = fc.oneof(
  // No @ sign at all
  fc.stringMatching(/^[a-z0-9]{5,20}$/),
  // Multiple @ signs
  fc.tuple(
    fc.stringMatching(/^[a-z]{3,8}$/),
    fc.stringMatching(/^[a-z]{3,8}$/),
    fc.stringMatching(/^[a-z]{3,5}\.[a-z]{2,3}$/)
  ).map(([a, b, c]) => `${a}@${b}@${c}`),
  // Missing domain part entirely
  fc.stringMatching(/^[a-z0-9]{3,10}$/).map((s) => `${s}@`),
  // Only special characters
  fc.constant('!!!@###.com'),
  // Spaces in local part
  fc.stringMatching(/^[a-z]{2,5}$/).map((s) => `${s} invalid@example.com`)
);

/** Generates valid email addresses */
const arbValidEmail = fc
  .tuple(
    fc.stringMatching(/^[a-z0-9]{1,15}$/),
    fc.constantFrom('gmail.com', 'yahoo.com', 'outlook.com', 'example.co.id')
  )
  .map(([local, domain]) => `${local}@${domain}`);

/** Generates invalid phone formats */
const arbInvalidPhone = fc.oneof(
  // Letters only (not matching phone regex)
  fc.stringMatching(/^[a-z]{5,15}$/),
  // Too short (less than 7 digits)
  fc.stringMatching(/^[0-9]{1,5}$/),
  // Too long (more than 20 chars)
  fc.stringMatching(/^[0-9]{21,25}$/),
  // Special characters not allowed in phone regex
  fc.stringMatching(/^[0-9]{3}[!@#$%]{2}[0-9]{5}$/)
);

/** Generates valid phone numbers (Indonesian format) */
const arbValidPhone = fc
  .tuple(
    fc.constantFrom('+62', '08'),
    fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 8, maxLength: 12 })
  )
  .map(([prefix, digits]) => `${prefix}${digits.join('')}`);

// --- Property Tests ---

describe('Property 18: Server-Side Input Validation', () => {
  /**
   * **Validates: Requirements 13.5, 13.6**
   *
   * For any input submitted to the API, the server SHALL validate type, length
   * (max 1000 chars for text fields), and format (email, phone), and SHALL reject
   * invalid input with specific error messages indicating which field failed and why.
   */

  describe('Length validation: strings exceeding 1000 characters are rejected', () => {
    it('any text field exceeding 1000 characters is rejected by generic validation', async () => {
      const middleware = createGenericBodyValidationMiddleware();

      await fc.assert(
        fc.asyncProperty(
          fc.stringMatching(/^[a-z]{1,20}$/),
          arbOverlengthString,
          async (fieldName, longValue) => {
            const request = createMockRequest({
              body: { [fieldName]: longValue },
            });
            const reply = createMockReply();

            await middleware(request, reply);

            // Must be rejected with 400
            expect(reply.statusCode).toBe(400);
            const body = reply.body as {
              success: boolean;
              error: { code: string; details: Array<{ field: string; code: string }> };
            };
            expect(body.success).toBe(false);
            expect(body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
            // Error details must mention the field that failed
            expect(body.error.details.length).toBeGreaterThan(0);
            expect(body.error.details[0].code).toBe(ErrorCode.FIELD_TOO_LONG);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('schema-based validation rejects text fields exceeding max length', async () => {
      const schema = z.object({
        name: z.string().max(MAX_TEXT_LENGTH),
        description: z.string().max(MAX_TEXT_LENGTH),
      });
      const middleware = createValidationMiddleware({ bodySchema: schema });

      await fc.assert(
        fc.asyncProperty(arbOverlengthString, async (longValue) => {
          const request = createMockRequest({
            body: { name: longValue, description: 'valid' },
          });
          const reply = createMockReply();

          await middleware(request, reply);

          expect(reply.statusCode).toBe(400);
          const body = reply.body as {
            error: { details: Array<{ field: string; code: string }> };
          };
          expect(body.error.details.some((d) => d.field === 'name')).toBe(true);
          expect(
            body.error.details.some((d) => d.code === ErrorCode.FIELD_TOO_LONG)
          ).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Format validation: invalid email formats are rejected', () => {
    it('invalid email formats are rejected with specific field error', () => {
      fc.assert(
        fc.property(arbInvalidEmail, (invalidEmail) => {
          const result = validateInput(createGuestSchema, {
            name: 'Test Guest',
            group: 'family',
            email: invalidEmail,
          });

          expect(result.success).toBe(false);
          if (!result.success) {
            const emailError = result.errors.find((e) => e.field === 'email');
            expect(emailError).toBeDefined();
            expect(emailError!.message).toBeDefined();
            expect(emailError!.message.length).toBeGreaterThan(0);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Format validation: invalid phone formats are rejected', () => {
    it('invalid phone formats are rejected with specific field error', () => {
      fc.assert(
        fc.property(arbInvalidPhone, (invalidPhone) => {
          const result = validateInput(createGuestSchema, {
            name: 'Test Guest',
            group: 'family',
            phone: invalidPhone,
          });

          expect(result.success).toBe(false);
          if (!result.success) {
            const phoneError = result.errors.find((e) => e.field === 'phone');
            expect(phoneError).toBeDefined();
            expect(phoneError!.message).toBeDefined();
            expect(phoneError!.message.length).toBeGreaterThan(0);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Valid inputs within constraints are accepted', () => {
    it('valid guest inputs with proper name, email, and phone are accepted', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[A-Z][a-z]{2,20}( [A-Z][a-z]{2,15})?$/),
          arbValidEmail,
          arbValidPhone,
          fc.constantFrom('family', 'friend', 'colleague', 'vip'),
          fc.integer({ min: 0, max: 10 }),
          (name, email, phone, group, plusOne) => {
            const result = validateInput(createGuestSchema, {
              name,
              group,
              email,
              phone,
              plus_one_count: plusOne,
            });

            expect(result.success).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('strings within 1000 characters pass generic body validation', async () => {
      const middleware = createGenericBodyValidationMiddleware();

      await fc.assert(
        fc.asyncProperty(
          fc.stringMatching(/^[a-zA-Z0-9]{1,100}$/),
          fc.stringMatching(/^[a-zA-Z0-9]{1,100}$/),
          async (value1, value2) => {
            const request = createMockRequest({
              body: { field1: value1, field2: value2 },
            });
            const reply = createMockReply();

            await middleware(request, reply);

            // Valid-length strings should pass
            expect(reply.statusCode).toBe(200);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Error responses specify which field failed and why', () => {
    it('validation errors always include field name and descriptive message', () => {
      const schema = z.object({
        email: z.string().email({ message: 'Format email tidak valid' }),
        phone: z.string().regex(/^\+?[0-9\s\-()]{7,20}$/, {
          message: 'Format nomor telepon tidak valid',
        }),
        name: z.string().min(1, { message: 'Nama tidak boleh kosong' }).max(MAX_TEXT_LENGTH),
      });

      fc.assert(
        fc.property(
          arbInvalidEmail,
          arbInvalidPhone,
          (invalidEmail, invalidPhone) => {
            const result = validateInput(schema, {
              email: invalidEmail,
              phone: invalidPhone,
              name: 'Valid Name',
            });

            expect(result.success).toBe(false);
            if (!result.success) {
              // Must have at least one error
              expect(result.errors.length).toBeGreaterThan(0);

              // Each error must specify the field and a message
              for (const error of result.errors) {
                expect(error.field).toBeDefined();
                expect(error.field.length).toBeGreaterThan(0);
                expect(error.message).toBeDefined();
                expect(error.message.length).toBeGreaterThan(0);
                expect(error.code).toBeDefined();
                expect(error.code.length).toBeGreaterThan(0);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('middleware error response includes field-specific details for each invalid field', async () => {
      const schema = z.object({
        name: z.string().min(1).max(MAX_TEXT_LENGTH),
        email: z.string().email(),
      });
      const middleware = createValidationMiddleware({ bodySchema: schema });

      await fc.assert(
        fc.asyncProperty(arbInvalidEmail, async (invalidEmail) => {
          const request = createMockRequest({
            body: { name: 'Valid', email: invalidEmail },
          });
          const reply = createMockReply();

          await middleware(request, reply);

          expect(reply.statusCode).toBe(400);
          const body = reply.body as {
            success: boolean;
            error: {
              code: string;
              message: string;
              details: Array<{ field: string; message: string; code: string }>;
            };
          };
          expect(body.success).toBe(false);
          expect(body.error.message).toBeDefined();
          expect(body.error.details.length).toBeGreaterThan(0);

          // Each detail must specify which field failed
          for (const detail of body.error.details) {
            expect(detail.field).toBeDefined();
            expect(detail.field.length).toBeGreaterThan(0);
            // Must include a reason (message)
            expect(detail.message).toBeDefined();
            expect(detail.message.length).toBeGreaterThan(0);
          }
        }),
        { numRuns: 100 }
      );
    });
  });
});
