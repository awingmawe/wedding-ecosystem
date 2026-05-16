'use client';

import { useState } from 'react';
import { GuestGroup } from '@wedding/shared';
import { apiFetch, ApiError } from '@/lib/api';
import type { GuestListItem } from '../page';

interface AddGuestModalProps {
  guest: GuestListItem | null;
  onClose: () => void;
  onSaved: () => void;
}

const GROUP_OPTIONS: { value: GuestGroup; label: string }[] = [
  { value: GuestGroup.FAMILY, label: 'Keluarga' },
  { value: GuestGroup.FRIEND, label: 'Teman' },
  { value: GuestGroup.COLLEAGUE, label: 'Rekan Kerja' },
  { value: GuestGroup.VIP, label: 'VIP' },
];

export function AddGuestModal({ guest, onClose, onSaved }: AddGuestModalProps) {
  const isEditing = !!guest;

  const [name, setName] = useState(guest?.name || '');
  const [group, setGroup] = useState<GuestGroup>(guest?.group || GuestGroup.FAMILY);
  const [phone, setPhone] = useState(guest?.phone || '');
  const [email, setEmail] = useState(guest?.email || '');
  const [plusOneCount, setPlusOneCount] = useState(guest?.plus_one_count ?? 0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    const payload = {
      name: name.trim(),
      group,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      plus_one_count: plusOneCount,
    };

    try {
      if (isEditing) {
        await apiFetch(`/guests/${guest.id}`, {
          method: 'PUT',
          body: payload,
        });
      } else {
        await apiFetch('/guests', {
          method: 'POST',
          body: payload,
        });
      }
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) {
        const data = err.data as { message?: string };
        setError(data.message || 'Gagal menyimpan data tamu');
      } else {
        setError('Terjadi kesalahan. Silakan coba lagi.');
      }
    } finally {
      setIsSubmitting(false);
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
      aria-labelledby="guest-modal-title"
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 id="guest-modal-title" className="font-heading text-lg font-bold">
            {isEditing ? 'Edit Tamu' : 'Tambah Tamu Baru'}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:text-gray-600"
            aria-label="Tutup"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div
            className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            role="alert"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="guest-name" className="mb-1.5 block text-sm font-medium text-gray-700">
              Nama <span className="text-red-500">*</span>
            </label>
            <input
              id="guest-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nama lengkap tamu"
              required
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label htmlFor="guest-group" className="mb-1.5 block text-sm font-medium text-gray-700">
              Grup <span className="text-red-500">*</span>
            </label>
            <select
              id="guest-group"
              value={group}
              onChange={(e) => setGroup(e.target.value as GuestGroup)}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {GROUP_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="guest-phone" className="mb-1.5 block text-sm font-medium text-gray-700">
              Nomor Telepon
            </label>
            <input
              id="guest-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+62812345678"
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label htmlFor="guest-email" className="mb-1.5 block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              id="guest-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tamu@email.com"
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label
              htmlFor="guest-plus-one"
              className="mb-1.5 block text-sm font-medium text-gray-700"
            >
              Jumlah Tamu Tambahan (Plus One)
            </label>
            <input
              id="guest-plus-one"
              type="number"
              min={0}
              max={10}
              value={plusOneCount}
              onChange={(e) => setPlusOneCount(parseInt(e.target.value, 10) || 0)}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <p className="mt-1 text-xs text-gray-500">
              Jumlah orang tambahan yang boleh dibawa tamu (0–10)
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isSubmitting ? 'Menyimpan...' : isEditing ? 'Simpan Perubahan' : 'Tambah Tamu'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
