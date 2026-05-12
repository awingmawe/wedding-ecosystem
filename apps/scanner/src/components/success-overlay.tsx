/**
 * Success overlay component.
 * Displays a GREEN confirmation screen for 3 seconds after successful check-in or Go-Show.
 * UI labels in Bahasa Indonesia.
 */

'use client';

import { useEffect } from 'react';

interface SuccessOverlayProps {
  guestName: string;
  onDismiss: () => void;
  /** Duration in ms before auto-dismiss. Default 3000ms. */
  duration?: number;
}

export function SuccessOverlay({ guestName, onDismiss, duration = 3000 }: SuccessOverlayProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [onDismiss, duration]);

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-emerald-600 text-white"
      role="alert"
      aria-live="assertive"
      onClick={onDismiss}
    >
      {/* Checkmark icon */}
      <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-white/20">
        <svg
          className="h-14 w-14 text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>

      {/* Guest name */}
      <h2 className="text-3xl font-bold">{guestName}</h2>

      {/* Confirmation text */}
      <p className="mt-3 text-lg text-emerald-100">Check-in Berhasil</p>

      {/* Dismiss hint */}
      <p className="mt-8 text-sm text-emerald-200">
        Otomatis tertutup dalam {Math.round(duration / 1000)} detik
      </p>
    </div>
  );
}
