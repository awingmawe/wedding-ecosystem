import path from 'path';
import { defineConfig } from 'prisma/config';

// Load .env file only if it exists (development). In CI/production, env vars are injected directly.
try {
  const dotenv = await import('dotenv');
  dotenv.config({ path: path.resolve(process.cwd(), '../../.env.local') });
  dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
} catch {
  // dotenv not available or .env files don't exist — that's fine in CI/production
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('[Prisma] DATABASE_URL environment variable is not set.');
  console.error('  - In development: ensure .env.local exists at project root');
  console.error('  - In CI: ensure DATABASE_URL is set as a secret/env var');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: databaseUrl ?? '',
  },
});
