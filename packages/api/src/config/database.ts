import * as os from 'node:os';

/**
 * Production database configuration for Supabase PostgreSQL.
 *
 * Connection pooling uses Supabase's built-in PgBouncer (port 6543).
 * Direct connections use port 5432.
 *
 * Pool size formula: (CPU cores × 2) + 1, minimum 10 connections.
 * SSL mode: verify-full for all production connections.
 * Query timeout: 30 seconds.
 *
 * Requirements: 4.1, 4.2, 4.5, 4.8
 */

// --- Pool Size Calculation ---

/**
 * Calculates optimal connection pool size based on available CPU cores.
 * Formula: (CPU cores × 2) + 1, with a minimum of 10 connections.
 */
export function calculatePoolSize(cpuCores?: number): number {
  const cores = cpuCores ?? os.cpus().length;
  const calculated = cores * 2 + 1;
  return Math.max(calculated, 10);
}

// --- Connection URL Helpers ---

export interface DatabaseUrls {
  /** Direct connection URL (port 5432) - for migrations and schema changes */
  directUrl: string;
  /** Pooled connection URL (port 6543 via PgBouncer) - for application queries */
  pooledUrl: string;
}

/**
 * Resolves database connection URLs from environment variables.
 * Supabase provides two connection modes:
 * - Direct (port 5432): Used for migrations, schema changes
 * - Pooled via PgBouncer (port 6543): Used for application queries
 */
export function getDatabaseUrls(): DatabaseUrls {
  const directUrl = process.env.DATABASE_URL;
  const pooledUrl = process.env.DATABASE_POOLED_URL ?? process.env.DATABASE_URL;

  if (!directUrl) {
    throw new Error(
      'DATABASE_URL environment variable is required. ' +
        'Set it to the Supabase direct connection string (port 5432).'
    );
  }

  if (!pooledUrl) {
    throw new Error(
      'DATABASE_POOLED_URL environment variable is required for production. ' +
        'Set it to the Supabase pooled connection string (port 6543).'
    );
  }

  return { directUrl, pooledUrl };
}

// --- SSL Configuration ---

export interface SSLConfig {
  /** SSL mode for database connections */
  mode: 'verify-full' | 'verify-ca' | 'require' | 'prefer' | 'disable';
  /** Whether to reject unauthorized certificates */
  rejectUnauthorized: boolean;
}

/**
 * Returns SSL configuration for production database connections.
 * Uses verify-full mode which validates both the server certificate
 * and that the server hostname matches the certificate.
 */
export function getSSLConfig(): SSLConfig {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    mode: isProduction ? 'verify-full' : 'prefer',
    rejectUnauthorized: isProduction,
  };
}

// --- Database Configuration ---

export interface DatabaseConfig {
  /** Connection pool size */
  poolSize: number;
  /** Query timeout in milliseconds */
  queryTimeout: number;
  /** Idle connection timeout in milliseconds */
  idleTimeout: number;
  /** Connection timeout in milliseconds */
  connectionTimeout: number;
  /** SSL configuration */
  ssl: SSLConfig;
  /** Database URLs */
  urls: DatabaseUrls;
}

/**
 * Returns the complete production database configuration.
 * Combines pool sizing, timeouts, SSL, and connection URLs.
 */
export function getDatabaseConfig(): DatabaseConfig {
  const poolSize = calculatePoolSize();
  const ssl = getSSLConfig();
  const urls = getDatabaseUrls();

  return {
    poolSize,
    queryTimeout: 30_000, // 30 seconds
    idleTimeout: 60_000, // 60 seconds
    connectionTimeout: 10_000, // 10 seconds
    ssl,
    urls,
  };
}

// --- PgBouncer / Connection Pool Settings ---

export interface PoolConfig {
  /** Maximum number of connections in the pool */
  max: number;
  /** Minimum number of idle connections to maintain */
  min: number;
  /** Time (ms) a client can sit idle before being closed */
  idleTimeoutMillis: number;
  /** Time (ms) to wait for a connection from the pool */
  connectionTimeoutMillis: number;
  /** Statement timeout (ms) applied to each query */
  statementTimeout: number;
  /** SSL configuration for pool connections */
  ssl: SSLConfig;
}

/**
 * Returns connection pool configuration for the `pg` driver.
 * Used when creating the PrismaClient with the pg adapter.
 */
export function getPoolConfig(): PoolConfig {
  const poolSize = calculatePoolSize();
  const ssl = getSSLConfig();

  return {
    max: poolSize,
    min: Math.min(2, poolSize),
    idleTimeoutMillis: 60_000,
    connectionTimeoutMillis: 10_000,
    statementTimeout: 30_000,
    ssl,
  };
}

export default getDatabaseConfig;
