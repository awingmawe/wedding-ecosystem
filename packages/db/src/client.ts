import * as os from 'node:os';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Production-ready Prisma client configuration for Supabase PostgreSQL.
 *
 * Features:
 * - Connection pooling via pg Pool (application-level) + Supabase PgBouncer (infra-level)
 * - SSL mode verify-full for production
 * - Query timeout of 30 seconds
 * - Pool size: (CPU cores × 2) + 1, minimum 10
 *
 * Requirements: 4.1, 4.2, 4.5, 4.8
 */

// --- Pool Size Calculation ---

/**
 * Calculates optimal connection pool size.
 * Formula: (CPU cores × 2) + 1, minimum 10 connections.
 */
export function calculatePoolSize(cpuCores?: number): number {
  const cores = cpuCores ?? os.cpus().length;
  const calculated = cores * 2 + 1;
  return Math.max(calculated, 10);
}

// --- SSL Configuration ---

function getSSLOptions(): { rejectUnauthorized: boolean } | false {
  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) {
    // In development, allow connections without strict SSL
    return false;
  }
  // Production: verify-full mode
  return { rejectUnauthorized: true };
}

// --- Connection Pool Configuration ---

export interface PrismaPoolOptions {
  /** Maximum pool connections */
  max: number;
  /** Minimum idle connections */
  min: number;
  /** Idle timeout in milliseconds */
  idleTimeoutMillis: number;
  /** Connection timeout in milliseconds */
  connectionTimeoutMillis: number;
  /** Statement timeout in milliseconds (30s) */
  statementTimeout: number;
}

/**
 * Returns pool configuration for the pg Pool instance.
 */
export function getPoolOptions(): PrismaPoolOptions {
  const poolSize = calculatePoolSize();
  return {
    max: poolSize,
    min: Math.min(2, poolSize),
    idleTimeoutMillis: 60_000,
    connectionTimeoutMillis: 10_000,
    statementTimeout: 30_000,
  };
}

// --- Prisma Client Factory ---

/**
 * Creates a production-configured Prisma client with:
 * - Connection pooling (pg Pool managed by PrismaPg adapter)
 * - SSL verify-full in production
 * - 30-second query timeout
 * - Optimized pool size based on CPU cores
 */
export function createProductionPrismaClient(): PrismaClient {
  // Use pooled URL for application queries (PgBouncer on port 6543)
  // Fall back to DATABASE_URL for development
  const connectionString = process.env.DATABASE_POOLED_URL ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL or DATABASE_POOLED_URL environment variable is required.');
  }

  const poolOptions = getPoolOptions();
  const ssl = getSSLOptions();

  // Pass PoolConfig to PrismaPg — it creates and manages the Pool internally
  const adapter = new PrismaPg({
    connectionString,
    max: poolOptions.max,
    min: poolOptions.min,
    idleTimeoutMillis: poolOptions.idleTimeoutMillis,
    connectionTimeoutMillis: poolOptions.connectionTimeoutMillis,
    statement_timeout: poolOptions.statementTimeout,
    ...(ssl !== false && { ssl }),
  });

  const client = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

  return client;
}

export { PrismaClient };
