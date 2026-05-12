'use client';

import { useState, useEffect } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import type { GuestListItem } from '../page';

interface QrCodeModalProps {
  guest: GuestListItem;
  onClose: () => void;
}

interface GuestQrData {
  qr_image_url: string | null;
  qr_payload: string;
  is_active: boolean;
}

export function QrCodeModal({ guest, onClose }: QrCodeModalProps) {
  const [qrData, setQrData] = useState<GuestQrData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchQrCode() {
      try {
        const data = await apiFetch<GuestQrData>(`/guests/${guest.id}/qr`);
        setQrData(data);
      } catch (err) {
        if (err instanceof ApiError) {
          const errData = err.data as { message?: string };
          setError(errData.message || 'Gagal memuat QR code');
        } else {
          setError('Terjadi kesalahan saat memuat QR code');
        }
      } finally {
        setIsLoading(false);
      }
    }

    fetchQrCode();
  }, [guest.id]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-modal-title"
    >
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 id="qr-modal-title" className="font-heading text-lg font-bold">
            QR Code
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:text-gray-600"
            aria-label="Tutup"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Guest info */}
        <div className="mb-4 text-center">
          <p className="text-lg font-medium text-gray-900">{guest.name}</p>
          <p className="text-sm text-gray-500 capitalize">{guest.group}</p>
        </div>

        {/* QR Code display */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-700">
            {error}
          </div>
        )}

        {!isLoading && !error && qrData && (
          <div className="text-center">
            {qrData.qr_image_url ? (
              <div className="mx-auto inline-block rounded-lg border-2 border-gray-200 p-4">
                <img
                  src={qrData.qr_image_url}
                  alt={`QR Code untuk ${guest.name}`}
                  className="h-48 w-48"
                />
              </div>
            ) : (
              <div className="mx-auto flex h-48 w-48 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50">
                <div className="text-center">
                  <svg
                    className="mx-auto h-12 w-12 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                    />
                  </svg>
                  <p className="mt-2 text-xs text-gray-500">QR Code tersedia</p>
                </div>
              </div>
            )}

            {/* Status */}
            <div className="mt-4">
              {qrData.is_active ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 8 8">
                    <circle cx="4" cy="4" r="3" />
                  </svg>
                  Aktif
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 8 8">
                    <circle cx="4" cy="4" r="3" />
                  </svg>
                  Nonaktif
                </span>
              )}
            </div>

            {/* QR payload (truncated) */}
            <div className="mt-3 rounded-lg bg-gray-50 p-2">
              <p className="text-xs text-gray-500">Payload ID:</p>
              <p className="mt-0.5 truncate font-mono text-xs text-gray-700">
                {qrData.qr_payload.substring(0, 32)}...
              </p>
            </div>
          </div>
        )}

        {/* Close button */}
        <div className="mt-5 flex justify-center">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-6 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
