// Database package - Prisma ORM client and utilities
// Re-exports Prisma client for use across the monorepo

import { PrismaClient } from '@prisma/client';
import {
  createProductionPrismaClient,
  calculatePoolSize,
  getPoolOptions,
  type PrismaPoolOptions,
} from './client';

export const DB_VERSION = '0.1.0';

// Singleton pattern for Prisma client to prevent multiple instances in development
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Singleton Prisma client instance.
 * Uses production-ready configuration with:
 * - Connection pooling (pool size: CPU cores × 2 + 1, min 10)
 * - SSL verify-full in production
 * - 30-second query timeout
 *
 * In development, reuses the same instance across hot reloads.
 * In production, creates a new instance per process.
 */
export const prisma = globalForPrisma.prisma ?? createProductionPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Re-export Prisma types, client class, and configuration utilities
export { PrismaClient, createProductionPrismaClient, calculatePoolSize, getPoolOptions };
export type { PrismaPoolOptions };
export * from '@prisma/client';
