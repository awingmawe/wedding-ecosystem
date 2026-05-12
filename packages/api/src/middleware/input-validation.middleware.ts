import { FastifyRequest, FastifyReply } from 'fastify';
import { z, ZodError, ZodSchema } from 'zod';
import { ErrorCode } from '@wedding/shared';
import type { ValidationErrorDetail } from '@wedding/shared';
import { MAX_TEXT_LENGTH } from '@wedding/shared';

// --- Types ---

export interface ValidationMiddlewareConfig {
  /** Zod schema to validate the request body against */
  bodySchema?: ZodSchema;
  /** Zod schema to validate query parameters against */
  querySchema?: ZodSchema;
  /** Zod schema to validate route parameters against */
  paramsSchema?: ZodSchema;
}

// --- Input Validation Middleware ---

/**
 * Creates a Fastify preHandler hook that validates incoming request data
 * against provided Zod schemas.
 *
 * - Validates type, length (max 1000 chars), and format (Req 13.5)
 * - Returns specific error messages for validation failures (Req 13.6)
 *
 * Validates: Requirements 13.5, 13.6
 */
export function createValidationMiddleware(config: ValidationMiddlewareConfig) {
  return async function validationHook(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const errors: ValidationErrorDetail[] = [];

    // Validate request body
    if (config.bodySchema && request.body !== undefined) {
      const bodyResult = config.bodySchema.safeParse(request.body);
      if (!bodyResult.success) {
        errors.push(...formatZodErrors(bodyResult.error, 'body'));
      }
    }

    // Validate query parameters
    if (config.querySchema && request.query) {
      const queryResult = config.querySchema.safeParse(request.query);
      if (!queryResult.success) {
        errors.push(...formatZodErrors(queryResult.error, 'query'));
      }
    }

    // Validate route parameters
    if (config.paramsSchema && request.params) {
      const paramsResult = config.paramsSchema.safeParse(request.params);
      if (!paramsResult.success) {
        errors.push(...formatZodErrors(paramsResult.error, 'params'));
      }
    }

    if (errors.length > 0) {
      reply.status(400).send({
        success: false,
        error: {
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Validasi input gagal',
          details: errors,
        },
      });
      return;
    }
  };
}

/**
 * Generic request body validation middleware.
 * Validates all string fields in the body against max length (1000 chars).
 * Use this as a catch-all for routes without specific schemas.
 *
 * Validates: Requirement 13.5
 */
export function createGenericBodyValidationMiddleware() {
  return async function genericValidationHook(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    if (!request.body || typeof request.body !== 'object') {
      return;
    }

    const errors = validateObjectFields(request.body as Record<string, unknown>, '');

    if (errors.length > 0) {
      reply.status(400).send({
        success: false,
        error: {
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Validasi input gagal',
          details: errors,
        },
      });
      return;
    }
  };
}

// --- Helper Functions ---

/**
 * Recursively validate all string fields in an object for max length.
 */
function validateObjectFields(
  obj: Record<string, unknown>,
  prefix: string
): ValidationErrorDetail[] {
  const errors: ValidationErrorDetail[] = [];

  for (const [key, value] of Object.entries(obj)) {
    const fieldPath = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'string') {
      if (value.length > MAX_TEXT_LENGTH) {
        errors.push({
          field: fieldPath,
          message: `Field '${fieldPath}' melebihi batas maksimal ${MAX_TEXT_LENGTH} karakter`,
          code: ErrorCode.FIELD_TOO_LONG,
        });
      }
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      errors.push(
        ...validateObjectFields(value as Record<string, unknown>, fieldPath)
      );
    } else if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (typeof item === 'string') {
          if (item.length > MAX_TEXT_LENGTH) {
            errors.push({
              field: `${fieldPath}[${i}]`,
              message: `Field '${fieldPath}[${i}]' melebihi batas maksimal ${MAX_TEXT_LENGTH} karakter`,
              code: ErrorCode.FIELD_TOO_LONG,
            });
          }
        } else if (item !== null && typeof item === 'object') {
          errors.push(
            ...validateObjectFields(
              item as Record<string, unknown>,
              `${fieldPath}[${i}]`
            )
          );
        }
      }
    }
  }

  return errors;
}

/**
 * Format Zod validation errors into our standard ValidationErrorDetail format.
 */
function formatZodErrors(
  error: ZodError,
  source: 'body' | 'query' | 'params'
): ValidationErrorDetail[] {
  return error.issues.map((issue) => {
    const fieldPath = issue.path.length > 0 ? issue.path.join('.') : source;

    let code: string;
    switch (issue.code) {
      case 'too_big':
        code = ErrorCode.FIELD_TOO_LONG;
        break;
      case 'invalid_type':
        if (issue.received === 'undefined') {
          code = ErrorCode.FIELD_REQUIRED;
        } else {
          code = ErrorCode.INVALID_INPUT;
        }
        break;
      case 'invalid_string':
        code = ErrorCode.INVALID_FORMAT;
        break;
      default:
        code = ErrorCode.INVALID_INPUT;
    }

    return {
      field: fieldPath,
      message: issue.message,
      code,
    };
  });
}

/**
 * Validate a single value against a Zod schema.
 * Useful for inline validation in route handlers.
 */
export function validateInput<T>(
  schema: ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: ValidationErrorDetail[] } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: formatZodErrors(result.error, 'body') };
}

// --- Exported constants for testing ---

export const VALIDATION_CONSTANTS = {
  MAX_TEXT_LENGTH,
} as const;
