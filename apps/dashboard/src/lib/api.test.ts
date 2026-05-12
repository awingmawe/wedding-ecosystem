import { describe, it, expect, beforeEach } from 'vitest';
import {
  setTokens,
  getAccessToken,
  getRefreshToken,
  clearTokens,
  isTokenExpiringSoon,
  ApiError,
} from './api';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });
Object.defineProperty(globalThis, 'window', { value: { localStorage: localStorageMock } });

describe('Token Management', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('stores and retrieves access token', () => {
    setTokens('access123', 'refresh456', 900);
    expect(getAccessToken()).toBe('access123');
  });

  it('stores and retrieves refresh token', () => {
    setTokens('access123', 'refresh456', 900);
    expect(getRefreshToken()).toBe('refresh456');
  });

  it('clears all tokens', () => {
    setTokens('access123', 'refresh456', 900);
    clearTokens();
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it('detects token expiring soon when no expiry stored', () => {
    expect(isTokenExpiringSoon()).toBe(true);
  });

  it('detects token not expiring soon when recently set', () => {
    // Set token with 900s expiry (minus 60s buffer = 840s from now)
    setTokens('access123', 'refresh456', 900);
    expect(isTokenExpiringSoon()).toBe(false);
  });

  it('detects token expiring soon when past expiry', () => {
    setTokens('access123', 'refresh456', 900);
    // Manually set expiry to past
    localStorageMock.setItem('wedding_token_expiry', (Date.now() - 1000).toString());
    expect(isTokenExpiringSoon()).toBe(true);
  });
});

describe('ApiError', () => {
  it('creates error with status and data', () => {
    const error = new ApiError(401, { message: 'Unauthorized' });
    expect(error.status).toBe(401);
    expect(error.data).toEqual({ message: 'Unauthorized' });
    expect(error.message).toBe('API Error: 401');
  });

  it('is an instance of Error', () => {
    const error = new ApiError(500, {});
    expect(error).toBeInstanceOf(Error);
  });
});
