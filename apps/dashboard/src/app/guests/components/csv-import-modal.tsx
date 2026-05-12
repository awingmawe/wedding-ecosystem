'use client';

import { useState, useRef } from 'react';
import { apiFetch, ApiError } from '@/lib/api';

interface CsvImportModalProps {
  onClose: () => void;
  onComplete: () => void;
}

interface ImportResult {
  total_rows: number;
  success_count: number;
  failed_count: number;
  failed_rows: { row_number: number; errors: string[] }[];
}

type ImportState = 'idle' | 'uploading' | 'done' | 'error';

export function CsvImportModal({ onClose, onComplete }: CsvImportModalProps) {
  const [state, setState] = useState<ImportState>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);

    // Validate file type
    if (!file.name.endsWith('.csv')) {
      setError('File harus berformat CSV (.csv)');
      setState('error');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Ukuran file maksimal 5MB');
      setState('error');
      return;
    }

    setState('uploading');
    setError('');
    setProgress(10);

    try {
      const csvText = await file.text();
      setProgress(30);

      // Count rows for progress estimation
      const rowCount = csvText.split('\n').filter((line) => line.trim()).length - 1;
      if (rowCount > 2000) {
        setError(`File CSV melebihi batas maksimal 2000 baris. Ditemukan: ${rowCount} baris`);
        setState('error');
        return;
      }

      setProgress(50);

      const importResult = await apiFetch<ImportResult>('/guests/import', {
        method: 'POST',
        body: { csv_text: csvText },
      });

      setProgress(100);
      setResult(importResult);
      setState('done');
    } catch (err) {
      if (err instanceof ApiError) {
        const data = err.data as { message?: string };
        setError(data.message || 'Gagal mengimport file CSV');
      } else {
        setError('Terjadi kesalahan saat mengimport file');
      }
      setState('error');
    }
  }

  function handleReset() {
    setState('idle');
    setProgress(0);
    setResult(null);
    setError('');
    setFileName('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-modal-title"
    >
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 id="import-modal-title" className="font-heading text-lg font-bold">
            Import Tamu dari CSV
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

        {/* Idle state - file upload */}
        {state === 'idle' && (
          <div>
            <div className="mb-4 rounded-lg border-2 border-dashed border-gray-300 p-8 text-center">
              <svg
                className="mx-auto h-10 w-10 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <p className="mt-3 text-sm text-gray-600">
                Pilih file CSV untuk diimport
              </p>
              <label
                htmlFor="csv-file-input"
                className="mt-3 inline-block cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                Pilih File
              </label>
              <input
                ref={fileInputRef}
                id="csv-file-input"
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            <div className="rounded-lg bg-gray-50 p-4">
              <p className="text-sm font-medium text-gray-700">Format CSV:</p>
              <ul className="mt-2 space-y-1 text-xs text-gray-600">
                <li>• Kolom wajib: <code className="rounded bg-gray-200 px-1">nama</code>, <code className="rounded bg-gray-200 px-1">grup</code></li>
                <li>• Kolom opsional: <code className="rounded bg-gray-200 px-1">phone</code>, <code className="rounded bg-gray-200 px-1">email</code>, <code className="rounded bg-gray-200 px-1">plus_one_count</code></li>
                <li>• Grup valid: family, friend, colleague, vip</li>
                <li>• Maksimal 2000 baris per file</li>
              </ul>
              <div className="mt-3 rounded bg-gray-200 p-2">
                <code className="text-xs text-gray-700">
                  nama,grup,phone,email,plus_one_count<br />
                  Budi Santoso,family,+6281234567,,1<br />
                  Ani Wijaya,friend,,ani@email.com,0
                </code>
              </div>
            </div>
          </div>
        )}

        {/* Uploading state */}
        {state === 'uploading' && (
          <div className="py-8 text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="mt-4 text-sm font-medium text-gray-700">
              Mengimport tamu...
            </p>
            <p className="mt-1 text-xs text-gray-500">{fileName}</p>
            <div className="mx-auto mt-4 h-2 w-64 overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${progress}%` }}
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
            <p className="mt-2 text-xs text-gray-500">{progress}%</p>
          </div>
        )}

        {/* Done state - results */}
        {state === 'done' && result && (
          <div>
            <div className="mb-4 rounded-lg bg-green-50 p-4">
              <div className="flex items-center gap-2">
                <svg className="h-5 w-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <p className="text-sm font-medium text-green-700">Import selesai</p>
              </div>
            </div>

            {/* Summary */}
            <div className="mb-4 grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-gray-50 p-3 text-center">
                <p className="text-lg font-bold text-gray-900">{result.total_rows}</p>
                <p className="text-xs text-gray-500">Total Baris</p>
              </div>
              <div className="rounded-lg bg-green-50 p-3 text-center">
                <p className="text-lg font-bold text-green-700">{result.success_count}</p>
                <p className="text-xs text-green-600">Berhasil</p>
              </div>
              <div className="rounded-lg bg-red-50 p-3 text-center">
                <p className="text-lg font-bold text-red-700">{result.failed_count}</p>
                <p className="text-xs text-red-600">Gagal</p>
              </div>
            </div>

            {/* Failed rows detail */}
            {result.failed_rows.length > 0 && (
              <div className="mb-4 max-h-48 overflow-y-auto rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="mb-2 text-xs font-medium text-red-700">
                  Baris yang gagal:
                </p>
                <ul className="space-y-1">
                  {result.failed_rows.map((row, idx) => (
                    <li key={idx} className="text-xs text-red-600">
                      Baris {row.row_number}: {row.errors.join(', ')}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={handleReset}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Import Lagi
              </button>
              <button
                onClick={onComplete}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                Selesai
              </button>
            </div>
          </div>
        )}

        {/* Error state */}
        {state === 'error' && (
          <div>
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="flex items-center gap-2">
                <svg className="h-5 w-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
                <p className="text-sm font-medium text-red-700">Import gagal</p>
              </div>
              <p className="mt-2 text-sm text-red-600">{error}</p>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={onClose}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Tutup
              </button>
              <button
                onClick={handleReset}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                Coba Lagi
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
