/**
 * Manual check-in page.
 * Provides search-based guest check-in and Go-Show registration.
 * Accessible from the scanner main navigation.
 */

'use client';

import { usePWA } from '@/components/pwa-provider';
import { ManualCheckIn } from '@/components/manual-checkin';
import Link from 'next/link';

export default function ManualCheckInPage() {
  const { eventId } = usePWA();

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Navigation header */}
      <header className="sticky top-10 z-40 border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg p-2 text-gray-600 hover:bg-gray-100"
            aria-label="Kembali ke beranda"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </Link>
          <h1 className="text-lg font-semibold text-gray-900">Check-in Manual</h1>
        </div>
      </header>

      {/* Manual check-in content */}
      <ManualCheckIn eventId={eventId} />
    </main>
  );
}
