/**
 * Go-Show registration form component.
 * Allows usher to register walk-in guests not found in the guest list.
 * Field: nama (required).
 * UI labels in Bahasa Indonesia.
 */

'use client';

import { useState, type FormEvent } from 'react';

interface GoShowFormProps {
  onSubmit: (nama: string) => Promise<void>;
  onCancel: () => void;
  isLoading: boolean;
  error: string | null;
  /** Pre-filled search query as initial name value */
  initialName?: string;
}

export function GoShowForm({ onSubmit, onCancel, isLoading, error, initialName = '' }: GoShowFormProps) {
  const [nama, setNama] = useState(initialName);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const trimmedName = nama.trim();
    if (!trimmedName) {
      setValidationError('Nama tamu wajib diisi');
      return;
    }

    await onSubmit(trimmedName);
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900">Tambah Tamu Go-Show</h3>
      <p className="mt-1 text-sm text-gray-500">
        Daftarkan tamu walk-in yang belum terdaftar
      </p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        {/* Nama field */}
        <div>
          <label htmlFor="go-show-nama" className="block text-sm font-medium text-gray-700">
            Nama Tamu <span className="text-red-500">*</span>
          </label>
          <input
            id="go-show-nama"
            type="text"
            value={nama}
            onChange={(e) => {
              setNama(e.target.value);
              setValidationError(null);
            }}
            placeholder="Masukkan nama tamu"
            className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-3 text-base text-gray-900 placeholder-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            disabled={isLoading}
            autoFocus
            aria-required="true"
            aria-invalid={!!validationError}
            aria-describedby={validationError ? 'go-show-error' : undefined}
          />
          {validationError && (
            <p id="go-show-error" className="mt-1.5 text-sm text-red-600" role="alert">
              {validationError}
            </p>
          )}
        </div>

        {/* Server error */}
        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="flex-1 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {isLoading ? 'Mendaftarkan...' : 'Daftarkan'}
          </button>
        </div>
      </form>
    </div>
  );
}
