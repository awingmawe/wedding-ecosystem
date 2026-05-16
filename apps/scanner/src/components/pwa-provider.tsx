/**
 * PWA Provider component.
 * Handles service worker registration, connectivity, and event selection.
 * Integrates with AuthProvider for token management.
 */

'use client';

import { useEffect, createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { registerServiceWorker } from '@/lib/service-worker-registration';
import { useConnectivity, type ConnectivityState } from '@/lib/connectivity';
import { ConnectivityIndicator } from './connectivity-indicator';
import { useAuth } from './auth-provider';
import { EventSelector } from './event-selector';
import { getStoredEventId } from '@/lib/auth';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface PWAContextValue extends ConnectivityState {
  apiBaseUrl: string;
  authToken: string;
  eventId: string;
  setEventId: (id: string) => void;
  /** Reset event selection (go back to event picker) */
  resetEvent: () => void;
}

const PWAContext = createContext<PWAContextValue>({
  isOnline: true,
  syncStatus: 'idle',
  pendingCount: 0,
  lastSyncTime: null,
  apiBaseUrl: API_BASE_URL,
  authToken: '',
  eventId: '',
  setEventId: () => {},
  resetEvent: () => {},
});

export function usePWA(): PWAContextValue {
  return useContext(PWAContext);
}

interface PWAProviderProps {
  children: ReactNode;
}

export function PWAProvider({ children }: PWAProviderProps) {
  const { accessToken, storedEventId } = useAuth();
  const [eventId, setEventId] = useState('');
  const [eventSelected, setEventSelected] = useState(false);

  const authToken = accessToken || '';
  const apiBaseUrl = API_BASE_URL;

  // Try to restore event from previous session
  useEffect(() => {
    const stored = storedEventId || getStoredEventId();
    if (stored) {
      setEventId(stored);
      setEventSelected(true);
    }
  }, [storedEventId]);

  const connectivity = useConnectivity({
    apiBaseUrl,
    authToken,
    eventId,
  });

  // Register service worker on mount
  useEffect(() => {
    registerServiceWorker();
  }, []);

  const handleEventSelected = useCallback((selectedEventId: string) => {
    setEventId(selectedEventId);
    setEventSelected(true);
  }, []);

  const resetEvent = useCallback(() => {
    setEventId('');
    setEventSelected(false);
  }, []);

  // Show event selector if no event is selected
  if (!eventSelected || !eventId) {
    return <EventSelector onEventSelected={handleEventSelected} initialEventId={storedEventId} />;
  }

  const contextValue: PWAContextValue = {
    ...connectivity,
    apiBaseUrl,
    authToken,
    eventId,
    setEventId,
    resetEvent,
  };

  return (
    <PWAContext.Provider value={contextValue}>
      <ConnectivityIndicator
        syncStatus={connectivity.syncStatus}
        pendingCount={connectivity.pendingCount}
      />
      {/* Add top padding to account for the fixed connectivity indicator */}
      <div className="pt-10">{children}</div>
    </PWAContext.Provider>
  );
}
