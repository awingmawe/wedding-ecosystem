/**
 * Route-level validation helper.
 *
 * Provides a concise way to validate request body/query/params against Zod schemas
 * directly inside route handlers. Returns typed data on success, sends 400 on failure.
 *
 * Usage:
 *   const body = validate(request.body, qrCheckInSchema, reply);
 *   if (!body) return; // reply already sent with 400
 *   // body is now typed as QrCheckInInput
 */

import { FastifyReply } from 'fastify';
import { ZodSchema } from 'zod';
import { ErrorCode } from '@wedding/shared';

/**
 * Validate data against a Zod schema. On failure, sends a 400 response and returns null.
 * On success, returns the parsed (typed) data.
 *
 * @param data - The raw data to validate (request.body, request.query, etc.)
 * @param schema - The Zod schema to validate against
 * @param reply - Fastify reply object (used to send 400 on failure)
 * @returns Parsed data on success, null on failure (reply already sent)
 */
export function validate<T>(data: unknown, schema: ZodSchema<T>, reply: FastifyReply): T | null {
  const result = schema.safeParse(data);

  if (result.success) {
    return result.data;
  }

  const details = result.error.issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.join('.') : 'body',
    message: issue.message,
  }));

  reply.status(400).send({
    success: false,
    error: {
      code: ErrorCode.VALIDATION_FAILED,
      message: details[0]?.message || 'Validasi input gagal',
      details,
    },
  });

  return null;
}
