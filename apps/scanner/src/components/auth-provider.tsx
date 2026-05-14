/**
 * Authentication Provider for Scanner PWA.
 * Manages auth state, auto-refresh, and provides auth context to the app.
 * Shows login screen when not authenticated.
 * UI labels in Bahasa Indonesia.
 */

'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import {
  type AuthUser,
  type AuthState,
  getStoredUser,
  getAccessToken,
  isTokenExpired,
  refreshAccessToken,
  logout as authLogout,
  getValidAccessToken,
  getStoredEventId,
  getStoredDeviceId,
} from '@/lib/auth';
import { LoginScreen } from './login-screen';

// --- Context ---

interface AuthContextValue extends AuthState {
  /** Get a valid access token (auto-refreshes if expired) */
  getToken: () => Promise<string | null>;
  /** Logout and clear session */
  logout: () => void;
  /** Stored event ID from previous session */
  storedEventId: string | null;
  /** Stored device ID from previous session */
  storedDeviceId: string | null;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isAuthenticated: false,
  accessToken: null,
  getToken: async () => null,
  logout: () => {},
  storedEventId: null,
  storedDeviceId: null,
});

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

// --- Provider ---

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize auth state from localStorage
  useEffect(() => {
    const storedUser = getStoredUser();
    const storedToken = getAccessToken();

    if (storedUser && storedToken) {
      setUser(storedUser);
      setAccessToken(storedToken);

      // If token is expired, try to refresh
      if (isTokenExpired()) {
        refreshAccessToken().then((newTokens) => {
          if (newTokens) {
            setAccessToken(newTokens.access_token);
          } else {
            // Refresh failed — clear state
            setUser(null);
            setAccessToken(null);
          }
          setIsLoading(false);
        });
      } else {
        setIsLoading(false);
        // Schedule refresh before expiry
        scheduleTokenRefresh();
      }
    } else {
      setIsLoading(false);
    }

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  // Schedule automatic token refresh
  const scheduleTokenRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }

    // Refresh 60 seconds before expiry (token is 15 min, refresh at 14 min)
    const refreshInterval = 13 * 60 * 1000; // 13 minutes

    refreshTimerRef.current = setTimeout(async () => {
      const newTokens = await refreshAccessToken();
      if (newTokens) {
        setAccessToken(newTokens.access_token);
        scheduleTokenRefresh(); // Schedule next refresh
      } else {
        // Refresh failed — force re-login
        handleLogout();
      }
    }, refreshInterval);
  }, []);

  const getToken = useCallback(async (): Promise<string | null> => {
    const token = await getValidAccessToken();
    if (token && token !== accessToken) {
      setAccessToken(token);
    }
    return token;
  }, [accessToken]);

  const handleLogout = useCallback(() => {
    authLogout();
    setUser(null);
    setAccessToken(null);
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
  }, []);

  const handleLoginSuccess = useCallback(
    (loggedInUser: AuthUser, token: string) => {
      setUser(loggedInUser);
      setAccessToken(token);
      scheduleTokenRefresh();
    },
    [scheduleTokenRefresh]
  );

  const isAuthenticated = !!user && !!accessToken;

  // Show loading spinner while checking auth state
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-gray-300 border-t-emerald-600" />
          <p className="text-sm text-gray-500">Memuat...</p>
        </div>
      </div>
    );
  }

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  const contextValue: AuthContextValue = {
    user,
    isAuthenticated,
    accessToken,
    getToken,
    logout: handleLogout,
    storedEventId: getStoredEventId(),
    storedDeviceId: getStoredDeviceId(),
  };

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}
