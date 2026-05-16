/**
 * Scanner main page.
 * Combines QR scanner camera with verification result display.
 * Handles scan lifecycle: scan → verify → display result → return to scan.
 * UI labels in Bahasa Indonesia.
 */

'use client';

import { useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { usePWA } from '@/components/pwa-provider';
import { useAuth } from '@/components/auth-provider';
import { QRScanner } from '@/components/qr-scanner';
import { VerificationResultDisplay } from '@/components/verification-result';
import { verifyQRCode, type VerificationResult } from '@/lib/checkin-service';

export default function ScannerPage() {
  const { isOnline, apiBaseUrl, authToken, eventId, resetEvent } = usePWA();
  const { user, logout } = useAuth();
  const [isScanning, setIsScanning] = useState(true);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // Prevent duplicate scans of the same QR within a short window
  const lastScannedRef = useRef<string>('');
  const lastScanTimeRef = useRef<number>(0);

  const handleScan = useCallback(
    async (decodedText: string) => {
      // Debounce: ignore same QR scanned within 3 seconds
      const now = Date.now();
      if (decodedText === lastScannedRef.current && now - lastScanTimeRef.current < 3000) {
        return;
      }

      // Ignore if already verifying
      if (isVerifying) return;

      lastScannedRef.current = decodedText;
      lastScanTimeRef.current = now;

      // Pause scanning and start verification
      setIsScanning(false);
      setIsVerifying(true);

      try {
        const result = await verifyQRCode(decodedText, {
          isOnline,
          apiBaseUrl,
          authToken,
          eventId,
        });

        setVerificationResult(result);
      } catch {
        setVerificationResult({
          status: 'invalid',
          errorMessage: 'Terjadi kesalahan saat verifikasi',
        });
      } finally {
        setIsVerifying(false);
      }
    },
    [isOnline, apiBaseUrl, authToken, eventId, isVerifying]
  );

  const handleDismissResult = useCallback(() => {
    setVerificationResult(null);
    setIsScanning(true);
    // Reset last scanned to allow re-scanning same QR after dismiss
    lastScannedRef.current = '';
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center px-4 py-6">
      {/* Header */}
      <header className="mb-6 w-full max-w-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Wedding Scanner</h1>
            <p className="mt-0.5 text-xs text-gray-500">{user?.name || 'Scanner Operator'}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={resetEvent}
              className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
              title="Ganti Event"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                />
              </svg>
            </button>
            <button
              onClick={logout}
              className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
              title="Keluar"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* QR Scanner */}
      <div className="w-full max-w-sm">
        <QRScanner onScan={handleScan} isScanning={isScanning} />
      </div>

      {/* Verifying indicator */}
      {isVerifying && (
        <div className="mt-6 flex items-center gap-2 text-gray-600">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
          <span className="text-sm">Memverifikasi...</span>
        </div>
      )}

      {/* Status info */}
      <div className="mt-6 w-full max-w-sm rounded-lg border border-gray-200 p-3 text-center">
        <p className="text-xs text-gray-500">
          Mode:{' '}
          <span
            className={isOnline ? 'font-medium text-emerald-600' : 'font-medium text-amber-600'}
          >
            {isOnline ? 'Online' : 'Offline — Verifikasi Lokal'}
          </span>
        </p>
      </div>

      {/* Manual check-in link */}
      <Link
        href="/manual"
        className="mt-4 inline-flex w-full max-w-sm items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        Check-in Manual
      </Link>

      {/* Verification result overlay */}
      {verificationResult && (
        <VerificationResultDisplay result={verificationResult} onDismiss={handleDismissResult} />
      )}
    </main>
  );
}
