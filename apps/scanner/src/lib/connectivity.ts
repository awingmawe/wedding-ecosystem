/**
 * Connectivity detection and management.
 * Provides hooks and utilities for detecting online/offline state.
 * Triggers sync on reconnect.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { scheduleSync, cancelSync, type SyncStatus } from './sync-manager';

export interface ConnectivityState {
  isOnline: boolean;
  syncStatus: SyncStatus;
  pendingCount: number;
  lastSyncTime: string | null;
}

interface UseConnectivityOptions {
  apiBaseUrl: string;
  authToken: string;
  eventId: string;
  onSyncComplete?: () => void;
}

/**
 * Hook for monitoring connectivity and triggering auto-sync.
 */
export function useConnectivity(options: UseConnectivityOptions): ConnectivityState {
  const { apiBaseUrl, authToken, eventId, onSyncComplete } = options;
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const wasOfflineRef = useRef(false);

  const handleOnline = useCallback(() => {
    setIsOnline(true);

    // Only trigger sync if we were previously offline
    if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      scheduleSync(apiBaseUrl, authToken, eventId, {
        onStatusChange: setSyncStatus,
        onProgress: (synced, total) => {
          setPendingCount(total - synced);
        },
        onComplete: (result) => {
          setPendingCount(0);
          setLastSyncTime(new Date().toISOString());
          if (result.synced > 0 || result.duplicatesIgnored > 0) {
            onSyncComplete?.();
          }
        },
        onError: () => {
          // Will retry on next connectivity event
        },
      });
    }
  }, [apiBaseUrl, authToken, eventId, onSyncComplete]);

  const handleOffline = useCallback(() => {
    setIsOnline(false);
    wasOfflineRef.current = true;
    cancelSync();
    setSyncStatus('idle');
  }, []);

  useEffect(() => {
    // Set initial state
    setIsOnline(navigator.onLine);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      cancelSync();
    };
  }, [handleOnline, handleOffline]);

  // Periodic connectivity check (every 10 seconds) as fallback
  useEffect(() => {
    const interval = setInterval(() => {
      const currentlyOnline = navigator.onLine;
      if (currentlyOnline && !isOnline) {
        handleOnline();
      } else if (!currentlyOnline && isOnline) {
        handleOffline();
      }
    }, 10_000);

    return () => clearInterval(interval);
  }, [isOnline, handleOnline, handleOffline]);

  return {
    isOnline,
    syncStatus,
    pendingCount,
    lastSyncTime,
  };
}

/**
 * Simple hook for just the online/offline state without sync management.
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
