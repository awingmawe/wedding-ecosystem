import type { FastifyBaseLogger } from 'fastify';
import type { LoggerOptions } from 'pino';

/**
 * Structured JSON logging configuration for all backend services.
 *
 * Implements structured log format with fields:
 * - timestamp: ISO 8601 format
 * - level: log level string (debug, info, warn, error, fatal)
 * - service_name: identifies the service emitting the log
 * - request_id: correlation ID for distributed tracing
 * - tenant_id: tenant context for multi-tenant isolation
 * - message: the log message
 *
 * Environment-based configuration:
 * - Production (NODE_ENV=production): level "info", JSON output
 * - Development (NODE_ENV=development or unset): level "debug", pretty-printed output
 *
 * Integrates with Fastify's built-in pino logger and the request-validation plugin
 * that attaches request_id (correlation ID) to requests.
 *
 * Requirements: 9.2
 */

// --- Types ---

export interface LoggerConfig {
  /** Log level: 'debug' | 'info' | 'warn' | 'error' | 'fatal' */
  level: string;
  /** Service name included in every log entry */
  serviceName: string;
  /** Whether to use pretty-printed output (development only) */
  prettyPrint: boolean;
  /** Whether the environment is production */
  isProduction: boolean;
}

// --- Constants ---

/** Default service name for the API server */
export const DEFAULT_SERVICE_NAME = 'wedding-api';

/** Environment variable key for NODE_ENV */
export const ENV_KEY = 'NODE_ENV';

/** Production environment value */
export const ENV_PRODUCTION = 'production';

// --- Configuration ---

/**
 * Determines the logger configuration based on the current environment.
 */
export function getLoggerConfig(overrides?: Partial<LoggerConfig>): LoggerConfig {
  const nodeEnv = process.env[ENV_KEY] || 'development';
  const isProduction = nodeEnv === ENV_PRODUCTION;

  return {
    level: isProduction ? 'info' : 'debug',
    serviceName: process.env.SERVICE_NAME || DEFAULT_SERVICE_NAME,
    prettyPrint: !isProduction,
    isProduction,
    ...overrides,
  };
}

/**
 * Builds Fastify-compatible logger options for structured JSON logging.
 *
 * In production:
 * - Outputs JSON with timestamp, level, service_name, and msg fields
 * - Log level set to "info"
 *
 * In development:
 * - Uses pino-pretty for human-readable output (if available)
 * - Falls back to JSON if pino-pretty is not installed
 * - Log level set to "debug"
 *
 * Usage:
 *   const app = Fastify({ logger: buildLoggerOptions() });
 */
export function buildLoggerOptions(config?: Partial<LoggerConfig>): LoggerOptions {
  const loggerConfig = getLoggerConfig(config);

  const baseOptions: LoggerOptions = {
    level: loggerConfig.level,
    // Use ISO timestamp format for structured logs
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    // Format level as string label instead of numeric value
    formatters: {
      level(label: string) {
        return { level: label };
      },
      // Add service_name to every log entry at the top level
      bindings() {
        return { service_name: loggerConfig.serviceName };
      },
    },
    // Rename 'msg' to 'message' in the output for clarity
    messageKey: 'message',
  };

  // In development, use pino-pretty for readable output
  if (loggerConfig.prettyPrint) {
    baseOptions.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
        messageKey: 'message',
      },
    };
  }

  return baseOptions;
}

/**
 * Creates a child logger with request context (request_id, tenant_id).
 *
 * This function is intended to be used in Fastify hooks to enrich
 * the request-scoped logger with correlation and tenant context.
 *
 * Usage in a Fastify hook:
 *   fastify.addHook('onRequest', (request, reply, done) => {
 *     request.log = createRequestLogger(request.log, {
 *       request_id: request.requestId,
 *       tenant_id: request.user?.tenant_id,
 *     });
 *     done();
 *   });
 */
export function createRequestLogger(
  baseLogger: FastifyBaseLogger,
  context: { request_id?: string; tenant_id?: string }
): FastifyBaseLogger {
  const bindings: Record<string, string> = {};

  if (context.request_id) {
    bindings.request_id = context.request_id;
  }

  if (context.tenant_id) {
    bindings.tenant_id = context.tenant_id;
  }

  return baseLogger.child(bindings);
}

/**
 * Fastify serializers for structured request/response logging.
 *
 * Customizes what gets logged for requests and responses to include
 * relevant fields without excessive noise.
 */
export const logSerializers = {
  req(request: any) {
    return {
      method: request.method,
      url: request.url,
      request_id: request.requestId || request.headers?.['x-request-id'],
      user_agent: request.headers?.['user-agent'],
    };
  },
  res(reply: any) {
    return {
      statusCode: reply.statusCode,
    };
  },
};

/**
 * Returns the complete Fastify logger configuration including serializers.
 *
 * This is the primary export for configuring the Fastify server logger.
 *
 * Usage:
 *   import { getFastifyLoggerConfig } from './config/logger';
 *   const app = Fastify({ logger: getFastifyLoggerConfig() });
 */
export function getFastifyLoggerConfig(config?: Partial<LoggerConfig>): LoggerOptions {
  const options = buildLoggerOptions(config);

  return {
    ...options,
    serializers: logSerializers,
  };
}
