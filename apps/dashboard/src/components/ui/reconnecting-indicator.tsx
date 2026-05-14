'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import type { ConnectionStatus } from '@/hooks/use-socket';

interface ReconnectingIndicatorProps {
  /** Current connection status from useSocket hook */
  status: ConnectionStatus;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Visual indicator shown when the WebSocket connection is lost.
 * Displays a banner with "Menghubungkan ulang..." message per Requirement 13.8.
 * Only visible when status is 'menghubungkan_ulang' (reconnecting).
 */
export function ReconnectingIndicator({ status, className }: ReconnectingIndicatorProps) {
  if (status !== 'menghubungkan_ulang') {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 border border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800',
        className
      )}
    >
      {/* Animated spinner */}
      <svg
        className="h-4 w-4 animate-spin text-amber-600 dark:text-amber-400"
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
      <span>Menghubungkan ulang...</span>
    </div>
  );
}
