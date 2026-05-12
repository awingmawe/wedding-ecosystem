// Authentication utilities for dashboard

import { apiFetch, setTokens, clearTokens, startAutoRefresh, stopAutoRefresh, getAccessToken } from './api';

export interface AuthUser {
  id: string;
  tenant_id: string;
  email: string;
  role: string;
  name: string;
}

export interface LoginResponse {
  user: AuthUser;
  tokens: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
}

/**
 * Login with email and password
 */
export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    body: { email, password },
    skipAuth: true,
  });

  // Store tokens and start auto-refresh
  setTokens(
    response.tokens.access_token,
    response.tokens.refresh_token,
    response.tokens.expires_in
  );
  startAutoRefresh();

  // Store user info
  if (typeof window !== 'undefined') {
    localStorage.setItem('wedding_user', JSON.stringify(response.user));
  }

  return response;
}

/**
 * Logout - clear tokens and stop auto-refresh
 */
export function logout(): void {
  clearTokens();
  stopAutoRefresh();
  if (typeof window !== 'undefined') {
    localStorage.removeItem('wedding_user');
    window.location.href = '/login';
  }
}

/**
 * Get stored user info
 */
export function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem('wedding_user');
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

/**
 * Check if user is authenticated (has valid access token)
 */
export function isAuthenticated(): boolean {
  return !!getAccessToken();
}
