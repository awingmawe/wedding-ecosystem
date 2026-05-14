import { describe, it, expect } from 'vitest';
import { calculatePoolSize, getPoolOptions } from './client';

describe('Database Client Configuration', () => {
  describe('calculatePoolSize', () => {
    it('should apply formula: (CPU cores × 2) + 1', () => {
      expect(calculatePoolSize(5)).toBe(11); // (5 × 2) + 1 = 11
      expect(calculatePoolSize(8)).toBe(17); // (8 × 2) + 1 = 17
      expect(calculatePoolSize(16)).toBe(33); // (16 × 2) + 1 = 33
    });

    it('should enforce minimum of 10 connections', () => {
      expect(calculatePoolSize(1)).toBe(10); // (1 × 2) + 1 = 3, min 10
      expect(calculatePoolSize(2)).toBe(10); // (2 × 2) + 1 = 5, min 10
      expect(calculatePoolSize(3)).toBe(10); // (3 × 2) + 1 = 7, min 10
      expect(calculatePoolSize(4)).toBe(10); // (4 × 2) + 1 = 9, min 10
    });

    it('should return values above 10 when cores are sufficient', () => {
      expect(calculatePoolSize(5)).toBe(11);
      expect(calculatePoolSize(6)).toBe(13);
      expect(calculatePoolSize(10)).toBe(21);
    });

    it('should use system CPU count when no argument provided', () => {
      const result = calculatePoolSize();
      expect(result).toBeGreaterThanOrEqual(10);
    });
  });

  describe('getPoolOptions', () => {
    it('should return pool size >= 10', () => {
      const options = getPoolOptions();
      expect(options.max).toBeGreaterThanOrEqual(10);
    });

    it('should set statement timeout to 30 seconds (30000ms)', () => {
      const options = getPoolOptions();
      expect(options.statementTimeout).toBe(30_000);
    });

    it('should set idle timeout to 60 seconds', () => {
      const options = getPoolOptions();
      expect(options.idleTimeoutMillis).toBe(60_000);
    });

    it('should set connection timeout to 10 seconds', () => {
      const options = getPoolOptions();
      expect(options.connectionTimeoutMillis).toBe(10_000);
    });

    it('should have min connections <= max connections', () => {
      const options = getPoolOptions();
      expect(options.min).toBeLessThanOrEqual(options.max);
      expect(options.min).toBeGreaterThanOrEqual(1);
    });
  });
});
