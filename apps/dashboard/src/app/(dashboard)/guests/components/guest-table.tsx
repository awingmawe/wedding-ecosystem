'use client';

import { GuestGroup } from '@wedding/shared';
import type { GuestListItem } from '../page';

interface GuestTableProps {
  guests: GuestListItem[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
  isLoading: boolean;
  onPageChange: (page: number) => void;
  onEdit: (guest: GuestListItem) => void;
  onShowQr: (guest: GuestListItem) => void;
  onRefresh: () => void;
}

const GROUP_LABELS: Record<GuestGroup, string> = {
  [GuestGroup.FAMILY]: 'Keluarga',
  [GuestGroup.FRIEND]: 'Teman',
  [GuestGroup.COLLEAGUE]: 'Rekan Kerja',
  [GuestGroup.VIP]: 'VIP',
};

const GROUP_COLORS: Record<GuestGroup, string> = {
  [GuestGroup.FAMILY]: 'bg-blue-100 text-blue-700',
  [GuestGroup.FRIEND]: 'bg-green-100 text-green-700',
  [GuestGroup.COLLEAGUE]: 'bg-purple-100 text-purple-700',
  [GuestGroup.VIP]: 'bg-amber-100 text-amber-700',
};

function getRsvpLabel(status: string | null): { label: string; className: string } {
  switch (status) {
    case 'akad':
      return { label: 'Hadir (Akad)', className: 'bg-green-100 text-green-700' };
    case 'resepsi':
      return { label: 'Hadir (Resepsi)', className: 'bg-green-100 text-green-700' };
    case 'both':
      return { label: 'Hadir (Keduanya)', className: 'bg-green-100 text-green-700' };
    case 'decline':
      return { label: 'Menolak', className: 'bg-red-100 text-red-700' };
    default:
      return { label: 'Belum RSVP', className: 'bg-gray-100 text-gray-600' };
  }
}

export function GuestTable({
  guests,
  pagination,
  isLoading,
  onPageChange,
  onEdit,
  onShowQr,
}: GuestTableProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="mt-3 text-sm text-gray-500">Memuat daftar tamu...</p>
        </div>
      </div>
    );
  }

  if (guests.length === 0) {
    return (
      <div className="rounded-xl bg-white p-12 text-center shadow-sm">
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
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
        <p className="mt-4 text-gray-600">Belum ada tamu terdaftar</p>
        <p className="mt-1 text-sm text-gray-500">Tambahkan tamu baru atau import dari file CSV</p>
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3">Grup</th>
              <th className="px-4 py-3">RSVP</th>
              <th className="px-4 py-3">Check-in</th>
              <th className="px-4 py-3">Plus One</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {guests.map((guest) => {
              const rsvp = getRsvpLabel(guest.rsvp_status);
              return (
                <tr key={guest.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-gray-900">{guest.name}</p>
                      {(guest.phone || guest.email) && (
                        <p className="text-xs text-gray-500">{guest.phone || guest.email}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${GROUP_COLORS[guest.group]}`}
                    >
                      {GROUP_LABELS[guest.group]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${rsvp.className}`}
                    >
                      {rsvp.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {guest.check_in_status ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clipRule="evenodd"
                          />
                        </svg>
                        Hadir
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-600">
                      {guest.plus_one_count > 0 ? `+${guest.plus_one_count}` : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onShowQr(guest)}
                        className="rounded p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                        title="Lihat QR Code"
                        aria-label={`Lihat QR Code ${guest.name}`}
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                          />
                        </svg>
                      </button>
                      <button
                        onClick={() => onEdit(guest)}
                        className="rounded p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                        title="Edit tamu"
                        aria-label={`Edit ${guest.name}`}
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.total_pages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-gray-600">
            Menampilkan {(pagination.page - 1) * pagination.per_page + 1}–
            {Math.min(pagination.page * pagination.per_page, pagination.total)} dari{' '}
            {pagination.total} tamu
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Halaman sebelumnya"
            >
              ←
            </button>
            <button
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.total_pages}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Halaman berikutnya"
            >
              →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
