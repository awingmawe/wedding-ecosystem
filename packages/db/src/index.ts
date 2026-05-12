// Database package - Prisma ORM client and utilities
// Re-exports Prisma client for use across the monorepo

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

export const DB_VERSION = '0.1.0';

// Singleton pattern for Prisma client to prevent multiple instances in development
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Creates a PrismaClient instance using the pg driver adapter.
 * Requires DATABASE_URL environment variable to be set.
 */
function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL environment variable is required. Set it in packages/db/.env or your environment.',
    );
  }

  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });
}

/**
 * Singleton Prisma client instance.
 * In development, reuses the same instance across hot reloads.
 * In production, creates a new instance per process.
 */
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Re-export Prisma types and client class
export { PrismaClient };
export * from '@prisma/client';
