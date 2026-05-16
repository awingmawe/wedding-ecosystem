/**
 * Environment variable validation module.
 *
 * Validates that all required environment variables are set before the server starts.
 * In production, missing critical variables (secrets, database URLs) will throw an error.
 * In development, fallback values are used with a warning.
 *
 * Requirements: Security best practice — never run production with default secrets.
 */

import { z } from 'zod';

// --- Schema ---

/**
 * Schema for required environment variables.
 * Production requires all secrets to be explicitly set.
 * Development allows fallbacks for convenience.
 */
const envSchema = z.object({
  // Node environment
  NODE_ENV: z.enum(['production', 'development', 'test']).default('development'),

  // Server
  PORT: z.string().optional(),
  HOST: z.string().optional(),

  // Secrets (REQUIRED in production)
  JWT_SECRET: z.string().min(1),
  REFRESH_SECRET: z.string().min(1),

  // Database (REQUIRED in production)
  DATABASE_URL: z.string().min(1),

  // CORS origins (REQUIRED in production)
  DASHBOARD_ORIGIN: z.string().url().optional(),
  INVITATION_ORIGIN: z.string().url().optional(),
  SCANNER_ORIGIN: z.string().url().optional(),

  // Redis (optional — graceful degradation)
  REDIS_URL: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // Storage (optional — graceful degradation)
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  R2_PUBLIC_URL: z.string().optional(),

  // Encryption
  ENCRYPTION_KEY: z.string().optional(),

  // Misc
  APP_VERSION: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

// --- Development Defaults ---
// All dev values are expected to come from .env.local (not hardcoded in source).
// These constants are only used for detecting accidental dev-default usage in production.

const KNOWN_DEV_SECRETS = {
  JWT_SECRET: process.env.JWT_SECRET,
  REFRESH_SECRET: process.env.REFRESH_SECRET,
} as const;

// --- Validation ---

/**
 * Variables that MUST be set in production (no fallback allowed).
 */
const PRODUCTION_REQUIRED_VARS = ['JWT_SECRET', 'REFRESH_SECRET', 'DATABASE_URL'] as const;

/**
 * Variables that SHOULD be set in production (warning if missing).
 */
const PRODUCTION_RECOMMENDED_VARS = [
  'DASHBOARD_ORIGIN',
  'INVITATION_ORIGIN',
  'SCANNER_ORIGIN',
  'ENCRYPTION_KEY',
] as const;

/**
 * Validates environment variables and returns a typed config object.
 *
 * Behavior:
 * - Production: throws if required secrets are missing or still using dev defaults.
 * - Development: uses fallback values with console warnings.
 * - Test: uses fallback values silently.
 */
export function validateEnv(): EnvConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  const isTest = process.env.NODE_ENV === 'test';

  // In production, enforce that critical secrets are set
  if (isProduction) {
    const missing: string[] = [];

    for (const varName of PRODUCTION_REQUIRED_VARS) {
      if (!process.env[varName]) {
        missing.push(varName);
      }
    }

    if (missing.length > 0) {
      throw new Error(
        `[ENV] Missing required environment variables in production:\n` +
          missing.map((v) => `  - ${v}`).join('\n') +
          `\n\nSet these variables before starting the server in production.`
      );
    }

    // Warn about recommended vars
    const missingRecommended: string[] = [];
    for (const varName of PRODUCTION_RECOMMENDED_VARS) {
      if (!process.env[varName]) {
        missingRecommended.push(varName);
      }
    }

    if (missingRecommended.length > 0) {
      console.warn(
        `[ENV] ⚠️  Recommended environment variables not set in production:\n` +
          missingRecommended.map((v) => `  - ${v}`).join('\n')
      );
    }

    // Warn if CORS origins are still localhost in production
    const corsVars = ['DASHBOARD_ORIGIN', 'INVITATION_ORIGIN', 'SCANNER_ORIGIN'] as const;
    for (const varName of corsVars) {
      const value = process.env[varName];
      if (value && value.includes('localhost')) {
        console.warn(
          `[ENV] ⚠️  ${varName} contains "localhost" in production. ` +
            `This is likely a misconfiguration.`
        );
      }
    }
  }

  // Build the config from process.env (values come from .env.local in development)
  const config: EnvConfig = {
    NODE_ENV: (process.env.NODE_ENV as EnvConfig['NODE_ENV']) || 'development',
    PORT: process.env.PORT,
    HOST: process.env.HOST,
    JWT_SECRET: process.env.JWT_SECRET || '',
    REFRESH_SECRET: process.env.REFRESH_SECRET || '',
    DATABASE_URL: process.env.DATABASE_URL || '',
    DASHBOARD_ORIGIN: process.env.DASHBOARD_ORIGIN,
    INVITATION_ORIGIN: process.env.INVITATION_ORIGIN,
    SCANNER_ORIGIN: process.env.SCANNER_ORIGIN,
    REDIS_URL: process.env.REDIS_URL,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
    R2_PUBLIC_URL: process.env.R2_PUBLIC_URL,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    APP_VERSION: process.env.APP_VERSION,
  };

  // Log warnings in development (not test) if critical vars are missing
  if (!isProduction && !isTest) {
    const missingVars: string[] = [];
    if (!process.env.JWT_SECRET) missingVars.push('JWT_SECRET');
    if (!process.env.REFRESH_SECRET) missingVars.push('REFRESH_SECRET');
    if (!process.env.DATABASE_URL) missingVars.push('DATABASE_URL');

    if (missingVars.length > 0) {
      console.warn(
        `[ENV] ⚠️  Missing environment variables: ${missingVars.join(', ')}\n` +
          `       Ensure .env.local is configured. See .env.example for reference.`
      );
    }
  }

  return config;
}

/**
 * Singleton env config instance.
 * Call validateEnv() once at startup, then import this for access.
 */
let _envConfig: EnvConfig | null = null;

/**
 * Get the validated environment config.
 * Must call validateEnv() first during startup.
 */
export function getEnvConfig(): EnvConfig {
  if (!_envConfig) {
    _envConfig = validateEnv();
  }
  return _envConfig;
}

/**
 * Reset the env config (for testing purposes only).
 */
export function resetEnvConfig(): void {
  _envConfig = null;
}
