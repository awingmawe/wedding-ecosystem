/**
 * Redis adapter for CheckInService's RedisClient interface.
 *
 * Wraps the ioredis client to satisfy the minimal interface
 * needed for atomic duplicate detection (SET NX EX).
 *
 * Falls back to a no-op implementation when Redis is unavailable,
 * which means duplicate detection degrades to DB-level checks only.
 */

import type Redis from 'ioredis';
import type { RedisClient } from '../services/checkin.service';

/**
 * Production Redis adapter — uses real ioredis client.
 */
export class IoRedisCheckInClient implements RedisClient {
  constructor(private readonly redis: Redis) {}

  async set(
    key: string,
    value: string,
    mode: 'EX',
    ttl: number,
    flag: 'NX'
  ): Promise<string | null> {
    return this.redis.set(key, value, mode, ttl, flag);
  }

  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }
}

/**
 * No-op Redis adapter for graceful degradation.
 * When Redis is unavailable, SET NX always returns 'OK' (no duplicate detection via Redis).
 * The service will still check DB for duplicates as a fallback.
 */
export class NoOpRedisCheckInClient implements RedisClient {
  async set(): Promise<string | null> {
    // Always return 'OK' — means "key was set" (no duplicate detected)
    // Duplicate detection falls back to DB-level findCheckInByGuestId()
    return 'OK';
  }

  async get(): Promise<string | null> {
    return null;
  }
}
