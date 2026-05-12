/**
 * Connectivity indicator component.
 * Displays clear visual distinction between online and offline modes.
 * UI labels in Bahasa Indonesia.
 */

'use client';

import { useOnlineStatus } from '@/lib/connectivity';
import { type SyncStatus } from '@/lib/sync-manager';

interface ConnectivityIndicatorProps {
  syncStatus?: SyncStatus;
  pendingCount?: number;
}

export function ConnectivityIndicator({
  syncStatus = 'idle',
  pendingCount = 0,
}: ConnectivityIndicatorProps) {
  const isOnline = useOnlineStatus();

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-2 text-sm font-medium transition-colors duration-300 ${
        isOnline
          ? 'bg-emerald-600 text-white'
          : 'bg-amber-500 text-white'
      }`}
      role="status"
      aria-live="polite"
      aria-label={isOnline ? 'Mode online' : 'Mode offline'}
    >
      <div className="flex items-center gap-2">
        {/* Status dot */}
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${
            isOnline ? 'bg-emerald-200 animate-pulse' : 'bg-amber-200'
          }`}
          aria-hidden="true"
        />

        {/* Status text */}
        <span>
          {isOnline ? 'Online' : 'Offline'}
          {!isOnline && ' — Mode Lokal'}
        </span>
      </div>

      {/* Sync status and pending count */}
      <div className="flex items-center gap-2">
        {syncStatus === 'syncing' && (
          <span className="flex items-center gap-1">
            <SyncSpinner />
            <span>Menyinkronkan...</span>
          </span>
        )}

        {!isOnline && pendingCount > 0 && (
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">
            {pendingCount} antrian
          </span>
        )}

        {syncStatus === 'success' && isOnline && (
          <span className="text-emerald-100">✓ Tersinkronisasi</span>
        )}

        {syncStatus === 'error' && (
          <span className="text-red-100">⚠ Gagal sinkronisasi</span>
        )}
      </div>
    </div>
  );
}

function SyncSpinner() {
  return (
    <svg
      className="h-3.5 w-3.5 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
