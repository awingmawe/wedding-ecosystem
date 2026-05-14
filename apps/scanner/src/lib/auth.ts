/**
 * Authentication module for Scanner PWA.
 * Handles login, token storage, refresh, and session management.
 *
 * Tokens are stored in localStorage for persistence across page reloads.
 * Access token is refreshed automatically before expiry.
 *
 * Scanner operators use the same /auth/login endpoint as other roles.
 * The API validates role-based access on protected routes.
 */

'use client';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Storage keys
const STORAGE_KEYS = {
  ACCESS_TOKEN: 'scanner_access_token',
  REFRESH_TOKEN: 'scanner_refresh_token',
  USER: 'scanner_user',
  TOKEN_EXPIRY: 'scanner_token_expiry',
  EVENT_ID: 'scanner_event_id',
  DEVICE_ID: 'scanner_device_id',
} as const;

// --- Types ---

export interface AuthUser {
  id: string;
  tenant_id: string;
  email: string;
  role: string;
  name: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface LoginResponse {
  user: AuthUser;
  tokens: AuthTokens;
}

export interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  accessToken: string | null;
}

export interface EventInfo {
  id: string;
  slug: string;
  bride_name: string;
  groom_name: string;
  event_date: string;
  venue_name: string;
  status: string;
}

// --- Token Management ---

/**
 * Store auth tokens and user info in localStorage.
 */
export function storeAuthData(user: AuthUser, tokens: AuthTokens): void {
  if (typeof window === 'undefined') return;

  localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, tokens.access_token);
  localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, tokens.refresh_token);
  localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));

  // Store expiry time (current time + expires_in seconds - 60s buffer for refresh)
  const expiryTime = Date.now() + (tokens.expires_in - 60) * 1000;
  localStorage.setItem(STORAGE_KEYS.TOKEN_EXPIRY, expiryTime.toString());
}

/**
 * Get the stored access token.
 */
export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
}

/**
 * Get the stored refresh token.
 */
export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
}

/**
 * Get the stored user info.
 */
export function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_KEYS.USER);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

/**
 * Check if the access token is expired or about to expire.
 */
export function isTokenExpired(): boolean {
  if (typeof window === 'undefined') return true;
  const expiry = localStorage.getItem(STORAGE_KEYS.TOKEN_EXPIRY);
  if (!expiry) return true;
  return Date.now() >= parseInt(expiry, 10);
}

/**
 * Clear all auth data from localStorage.
 */
export function clearAuthData(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.USER);
  localStorage.removeItem(STORAGE_KEYS.TOKEN_EXPIRY);
  localStorage.removeItem(STORAGE_KEYS.EVENT_ID);
  localStorage.removeItem(STORAGE_KEYS.DEVICE_ID);
}

/**
 * Get the stored event ID.
 */
export function getStoredEventId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEYS.EVENT_ID);
}

/**
 * Store the selected event ID.
 */
export function storeEventId(eventId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.EVENT_ID, eventId);
}

/**
 * Get the stored device ID.
 */
export function getStoredDeviceId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
}

/**
 * Store the registered device ID.
 */
export function storeDeviceId(deviceId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.DEVICE_ID, deviceId);
}

// --- API Calls ---

/**
 * Login with email and password.
 * Returns user info and tokens on success.
 */
export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new AuthError(
      error?.error?.message || 'Login gagal. Periksa email dan password.',
      error?.error?.code || 'AUTH_ERROR'
    );
  }

  const data = await response.json();

  // Validate role — only scanner and wo roles can use the scanner app
  const allowedRoles = ['scanner', 'wo', 'admin'];
  if (!allowedRoles.includes(data.user.role)) {
    throw new AuthError(
      'Akun Anda tidak memiliki akses ke Scanner. Hubungi admin.',
      'AUTH_ROLE_DENIED'
    );
  }

  // Store auth data
  storeAuthData(data.user, data.tokens);

  return data as LoginResponse;
}

/**
 * Refresh the access token using the stored refresh token.
 * Returns new tokens on success.
 */
export async function refreshAccessToken(): Promise<AuthTokens | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      // Refresh failed — clear auth and force re-login
      clearAuthData();
      return null;
    }

    const data = await response.json();
    const tokens: AuthTokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
    };

    // Update stored tokens
    const user = getStoredUser();
    if (user) {
      storeAuthData(user, tokens);
    }

    return tokens;
  } catch {
    return null;
  }
}

/**
 * Get a valid access token, refreshing if needed.
 * Returns null if no valid session exists.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const token = getAccessToken();
  if (!token) return null;

  if (!isTokenExpired()) {
    return token;
  }

  // Token expired — try to refresh
  const newTokens = await refreshAccessToken();
  return newTokens?.access_token ?? null;
}

/**
 * Fetch available events for the authenticated user.
 */
export async function fetchEvents(): Promise<EventInfo[]> {
  const token = await getValidAccessToken();
  if (!token) throw new AuthError('Sesi berakhir. Silakan login ulang.', 'AUTH_EXPIRED');

  const response = await fetch(`${API_BASE_URL}/events`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      clearAuthData();
      throw new AuthError('Sesi berakhir. Silakan login ulang.', 'AUTH_EXPIRED');
    }
    throw new AuthError('Gagal memuat daftar event.', 'FETCH_ERROR');
  }

  const data = await response.json();
  return data.data || data || [];
}

/**
 * Register this device as a scanner for the selected event.
 */
export async function registerDevice(eventId: string, deviceName: string): Promise<string> {
  const token = await getValidAccessToken();
  if (!token) throw new AuthError('Sesi berakhir. Silakan login ulang.', 'AUTH_EXPIRED');

  const response = await fetch(`${API_BASE_URL}/scanner/devices/register`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ event_id: eventId, device_name: deviceName }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new AuthError(
      error?.error?.message || 'Gagal mendaftarkan device.',
      error?.error?.code || 'DEVICE_ERROR'
    );
  }

  const device = await response.json();
  storeDeviceId(device.id);
  return device.id;
}

/**
 * Logout — clear all stored data.
 */
export function logout(): void {
  clearAuthData();
}

// --- Error Class ---

export class AuthError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}
