/**
 * QR Scanner component using html5-qrcode library.
 * Handles camera initialization, QR code detection, and scan lifecycle.
 * Pauses scanning during verification display and resumes after.
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';

interface QRScannerProps {
  onScan: (decodedText: string) => void;
  isScanning: boolean;
}

export function QRScanner({ onScan, isScanning }: QRScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const onScanRef = useRef(onScan);

  // Keep onScan ref up to date without triggering re-renders
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const startScanner = useCallback(async () => {
    if (!scannerRef.current) return;

    try {
      const state = scannerRef.current.getState();
      if (state === Html5QrcodeScannerState.SCANNING) return;

      await scannerRef.current.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1,
        },
        (decodedText) => {
          onScanRef.current(decodedText);
        },
        () => {
          // QR code not detected in this frame — no action needed
        }
      );
      setError(null);
      setIsInitializing(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Gagal mengakses kamera';
      setError(message);
      setIsInitializing(false);
    }
  }, []);

  const stopScanner = useCallback(async () => {
    if (!scannerRef.current) return;
    try {
      const state = scannerRef.current.getState();
      if (state === Html5QrcodeScannerState.SCANNING) {
        await scannerRef.current.stop();
      }
    } catch {
      // Ignore stop errors
    }
  }, []);

  // Initialize scanner on mount
  useEffect(() => {
    const elementId = 'qr-scanner-region';

    // Small delay to ensure DOM element is ready
    const initTimeout = setTimeout(() => {
      scannerRef.current = new Html5Qrcode(elementId);
      startScanner();
    }, 100);

    return () => {
      clearTimeout(initTimeout);
      if (scannerRef.current) {
        const scanner = scannerRef.current;
        try {
          const state = scanner.getState();
          if (state === Html5QrcodeScannerState.SCANNING) {
            scanner.stop().then(() => scanner.clear()).catch(() => {});
          } else {
            scanner.clear();
          }
        } catch {
          // Ignore cleanup errors
        }
        scannerRef.current = null;
      }
    };
  }, [startScanner]);

  // Pause/resume scanning based on isScanning prop
  useEffect(() => {
    if (isScanning) {
      startScanner();
    } else {
      stopScanner();
    }
  }, [isScanning, startScanner, stopScanner]);

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Scanner viewport */}
      <div
        id="qr-scanner-region"
        className="mx-auto w-full max-w-sm overflow-hidden rounded-xl"
      />

      {/* Loading state */}
      {isInitializing && !error && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-gray-900/80">
          <div className="text-center text-white">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
            <p className="text-sm">Memulai kamera...</p>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="mt-4 rounded-lg bg-red-50 p-4 text-center">
          <p className="text-sm font-medium text-red-800">
            Tidak dapat mengakses kamera
          </p>
          <p className="mt-1 text-xs text-red-600">{error}</p>
          <button
            onClick={() => {
              setError(null);
              setIsInitializing(true);
              startScanner();
            }}
            className="mt-3 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {/* Scan ready indicator */}
      {!isInitializing && !error && isScanning && (
        <p className="mt-3 text-center text-sm text-gray-500">
          Arahkan kamera ke QR code tamu
        </p>
      )}
    </div>
  );
}
