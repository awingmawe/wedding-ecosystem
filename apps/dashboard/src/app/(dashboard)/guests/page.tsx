'use client';

import { useState, useEffect, useCallback } from 'react';
import { GuestTable } from './components/guest-table';
import { GuestFilters } from './components/guest-filters';
import { AddGuestModal } from './components/add-guest-modal';
import { CsvImportModal } from './components/csv-import-modal';
import { QrCodeModal } from './components/qr-code-modal';
import { apiFetch, ApiError } from '@/lib/api';
import type { GuestGroup } from '@wedding/shared';

export interface GuestListItem {
  id: string;
  name: string;
  slug: string;
  group: GuestGroup;
  type: string;
  plus_one_count: number;
  phone: string | null;
  email: string | null;
  delivery_status: string;
  rsvp_status: string | null;
  check_in_status: boolean;
  qr_active: boolean;
}

export interface PaginatedGuestList {
  data: GuestListItem[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

type GuestStatusFilter = 'belum_rsvp' | 'confirmed' | 'declined' | 'checked_in';

export default function GuestsPage() {
  const [guests, setGuests] = useState<GuestListItem[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    per_page: 50,
    total: 0,
    total_pages: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [groupFilter, setGroupFilter] = useState<GuestGroup | ''>('');
  const [statusFilter, setStatusFilter] = useState<GuestStatusFilter | ''>('');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingGuest, setEditingGuest] = useState<GuestListItem | null>(null);
  const [qrGuest, setQrGuest] = useState<GuestListItem | null>(null);

  const fetchGuests = useCallback(
    async (page = 1) => {
      setIsLoading(true);
      setError('');

      try {
        const params = new URLSearchParams({
          page: page.toString(),
          per_page: '50',
        });

        if (groupFilter) params.set('group', groupFilter);
        if (statusFilter) params.set('status', statusFilter);

        const result = await apiFetch<PaginatedGuestList>(`/guests?${params.toString()}`);

        setGuests(result.data);
        setPagination(result.pagination);
      } catch (err) {
        if (err instanceof ApiError) {
          const data = err.data as { message?: string };
          setError(data.message || 'Gagal memuat daftar tamu');
        } else {
          setError('Terjadi kesalahan saat memuat data');
        }
      } finally {
        setIsLoading(false);
      }
    },
    [groupFilter, statusFilter]
  );

  useEffect(() => {
    fetchGuests(1);
  }, [fetchGuests]);

  function handlePageChange(newPage: number) {
    fetchGuests(newPage);
  }

  function handleGuestSaved() {
    setShowAddModal(false);
    setEditingGuest(null);
    fetchGuests(pagination.page);
  }

  function handleImportComplete() {
    setShowImportModal(false);
    fetchGuests(1);
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Daftar Tamu</h1>
          <p className="mt-1 text-sm text-gray-600">Kelola tamu undangan pernikahan Anda</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImportModal(true)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Import CSV
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            + Tambah Tamu
          </button>
        </div>
      </div>

      {/* Filters */}
      <GuestFilters
        groupFilter={groupFilter}
        statusFilter={statusFilter}
        onGroupChange={setGroupFilter}
        onStatusChange={setStatusFilter}
      />

      {/* Error */}
      {error && (
        <div
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </div>
      )}

      {/* Guest Table */}
      <GuestTable
        guests={guests}
        pagination={pagination}
        isLoading={isLoading}
        onPageChange={handlePageChange}
        onEdit={(guest) => setEditingGuest(guest)}
        onShowQr={(guest) => setQrGuest(guest)}
        onRefresh={() => fetchGuests(pagination.page)}
      />

      {/* Add/Edit Guest Modal */}
      {(showAddModal || editingGuest) && (
        <AddGuestModal
          guest={editingGuest}
          onClose={() => {
            setShowAddModal(false);
            setEditingGuest(null);
          }}
          onSaved={handleGuestSaved}
        />
      )}

      {/* CSV Import Modal */}
      {showImportModal && (
        <CsvImportModal
          onClose={() => setShowImportModal(false)}
          onComplete={handleImportComplete}
        />
      )}

      {/* QR Code Modal */}
      {qrGuest && <QrCodeModal guest={qrGuest} onClose={() => setQrGuest(null)} />}
    </div>
  );
}
