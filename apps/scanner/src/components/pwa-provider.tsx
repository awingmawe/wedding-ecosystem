/**
 * PWA Provider component.
 * Handles service worker registration and provides connectivity context.
 */

'use client';

import { useEffect, createContext, useContext, useState, type ReactNode } from 'react';
import { registerServiceWorker } from '@/lib/service-worker-registration';
import { useConnectivity, type ConnectivityState } from '@/lib/connectivity';
import { ConnectivityIndicator } from './connectivity-indicator';

// Default config — in production these would come from environment/auth
const DEFAULT_API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3100';
const DEFAULT_EVENT_ID = ''; // Set by scanner session

interface PWAContextValue extends ConnectivityState {
  apiBaseUrl: string;
  eventId: string;
  setEventId: (id: string) => void;
}

const PWAContext = createContext<PWAContextValue>({
  isOnline: true,
  syncStatus: 'idle',
  pendingCount: 0,
  lastSyncTime: null,
  apiBaseUrl: DEFAULT_API_BASE_URL,
  eventId: '',
  setEventId: () => {},
});

export function usePWA(): PWAContextValue {
  return useContext(PWAContext);
}

interface PWAProviderProps {
  children: ReactNode;
}

export function PWAProvider({ children }: PWAProviderProps) {
  const [eventId, setEventId] = useState(DEFAULT_EVENT_ID);
  const apiBaseUrl = DEFAULT_API_BASE_URL;
  // In production, authToken would come from auth context
  const authToken = '';

  const connectivity = useConnectivity({
    apiBaseUrl,
    authToken,
    eventId,
  });

  // Register service worker on mount
  useEffect(() => {
    registerServiceWorker();
  }, []);

  const contextValue: PWAContextValue = {
    ...connectivity,
    apiBaseUrl,
    eventId,
    setEventId,
  };

  return (
    <PWAContext.Provider value={contextValue}>
      <ConnectivityIndicator
        syncStatus={connectivity.syncStatus}
        pendingCount={connectivity.pendingCount}
      />
      {/* Add top padding to account for the fixed connectivity indicator */}
      <div className="pt-10">
        {children}
      </div>
    </PWAContext.Provider>
  );
}
