'use client';

import { useState, useCallback, useEffect } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { DeliveryStatus } from '@wedding/shared';

// --- Types ---

interface NotificationGuest {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  email: string | null;
  delivery_status: DeliveryStatus;
  invitation_url: string | null;
}

type NotificationChannel = 'whatsapp' | 'email';

interface SendResult {
  guest_id: string;
  channel: NotificationChannel;
  success: boolean;
  error?: string;
}

interface BulkSendResult {
  total: number;
  sent: number;
  failed: number;
  results: SendResult[];
}

interface FailureNotification {
  id: string;
  guestName: string;
  channel: NotificationChannel;
  error: string;
  timestamp: Date;
}

// --- Constants ---

const MAX_BATCH_SIZE = 500;
const ITEMS_PER_PAGE = 50;

const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  [DeliveryStatus.NOT_SENT]: 'Belum Dikirim',
  [DeliveryStatus.SENT]: 'Terkirim',
  [DeliveryStatus.FAILED]: 'Gagal',
};

const DELIVERY_STATUS_STYLES: Record<DeliveryStatus, string> = {
  [DeliveryStatus.NOT_SENT]: 'bg-gray-100 text-gray-700',
  [DeliveryStatus.SENT]: 'bg-green-100 text-green-700',
  [DeliveryStatus.FAILED]: 'bg-red-100 text-red-700',
};

// --- Helper Functions ---

function canSendToGuest(guest: NotificationGuest): boolean {
  return !!(guest.phone || guest.email);
}

function getAvailableChannels(guest: NotificationGuest): NotificationChannel[] {
  const channels: NotificationChannel[] = [];
  if (guest.phone) channels.push('whatsapp');
  if (guest.email) channels.push('email');
  return channels;
}

// --- Component ---

export default function NotificationsPage() {
  const [guests, setGuests] = useState<NotificationGuest[]>([]);
  const [selectedGuestIds, setSelectedGuestIds] = useState<Set<string>>(new Set());
  const [bulkChannel, setBulkChannel] = useState<NotificationChannel>('whatsapp');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [sendingGuestId, setSendingGuestId] = useState<string | null>(null);
  const [failures, setFailures] = useState<FailureNotification[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<DeliveryStatus | 'all'>('all');
  const [currentPage, setCurrentPage] = useState(1);

  // --- Data Fetching (useEffect instead of conditional render-time fetch) ---

  const loadGuests = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiFetch<{ guests: NotificationGuest[] }>(
        '/guests?include=delivery_status'
      );
      setGuests(data.guests);
    } catch (error) {
      if (error instanceof ApiError) {
        addFailure(
          'Sistem',
          'email',
          `Gagal memuat data tamu: ${(error.data as { message?: string })?.message || 'Unknown error'}`
        );
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGuests();
  }, [loadGuests]);

  // --- Filtering & Pagination ---

  const filteredGuests = guests.filter((guest) => {
    const matchesSearch = guest.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || guest.delivery_status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.ceil(filteredGuests.length / ITEMS_PER_PAGE);
  const paginatedGuests = filteredGuests.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // --- Selection ---

  const toggleSelectGuest = (guestId: string) => {
    setSelectedGuestIds((prev) => {
      const next = new Set(prev);
      if (next.has(guestId)) {
        next.delete(guestId);
      } else {
        next.add(guestId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    const sendableGuests = paginatedGuests.filter(canSendToGuest);
    const allSelected = sendableGuests.every((g) => selectedGuestIds.has(g.id));

    if (allSelected) {
      setSelectedGuestIds((prev) => {
        const next = new Set(prev);
        sendableGuests.forEach((g) => next.delete(g.id));
        return next;
      });
    } else {
      setSelectedGuestIds((prev) => {
        const next = new Set(prev);
        sendableGuests.forEach((g) => next.add(g.id));
        return next;
      });
    }
  };

  // --- Sending ---

  const addFailure = (guestName: string, channel: NotificationChannel, error: string) => {
    setFailures((prev) => [
      { id: `${Date.now()}-${Math.random()}`, guestName, channel, error, timestamp: new Date() },
      ...prev,
    ]);
  };

  const dismissFailure = (id: string) => {
    setFailures((prev) => prev.filter((f) => f.id !== id));
  };

  const sendIndividual = async (guest: NotificationGuest, channel: NotificationChannel) => {
    setSendingGuestId(guest.id);
    try {
      const result = await apiFetch<SendResult>('/notifications/send', {
        method: 'POST',
        body: { guest_id: guest.id, channel },
      });

      if (result.success) {
        setGuests((prev) =>
          prev.map((g) => (g.id === guest.id ? { ...g, delivery_status: DeliveryStatus.SENT } : g))
        );
      } else {
        setGuests((prev) =>
          prev.map((g) =>
            g.id === guest.id ? { ...g, delivery_status: DeliveryStatus.FAILED } : g
          )
        );
        addFailure(guest.name, channel, result.error || 'Pengiriman gagal');
      }
    } catch (error) {
      setGuests((prev) =>
        prev.map((g) => (g.id === guest.id ? { ...g, delivery_status: DeliveryStatus.FAILED } : g))
      );
      const errorMessage =
        error instanceof ApiError
          ? (error.data as { message?: string })?.message || 'Terjadi kesalahan'
          : 'Terjadi kesalahan jaringan';
      addFailure(guest.name, channel, errorMessage);
    } finally {
      setSendingGuestId(null);
    }
  };

  const sendBulk = async () => {
    if (selectedGuestIds.size === 0) return;
    if (selectedGuestIds.size > MAX_BATCH_SIZE) {
      addFailure('Bulk', bulkChannel, `Maksimal ${MAX_BATCH_SIZE} tamu per batch pengiriman`);
      return;
    }

    setIsSending(true);
    try {
      const result = await apiFetch<BulkSendResult>('/notifications/send-bulk', {
        method: 'POST',
        body: { guest_ids: Array.from(selectedGuestIds), channel: bulkChannel },
      });

      setGuests((prev) =>
        prev.map((g) => {
          const sendResult = result.results.find((r) => r.guest_id === g.id);
          if (sendResult) {
            return {
              ...g,
              delivery_status: sendResult.success ? DeliveryStatus.SENT : DeliveryStatus.FAILED,
            };
          }
          return g;
        })
      );

      result.results
        .filter((r) => !r.success)
        .forEach((r) => {
          const guest = guests.find((g) => g.id === r.guest_id);
          if (guest) addFailure(guest.name, r.channel, r.error || 'Pengiriman gagal');
        });

      setSelectedGuestIds(new Set());
    } catch (error) {
      const errorMessage =
        error instanceof ApiError
          ? (error.data as { message?: string })?.message || 'Terjadi kesalahan'
          : 'Terjadi kesalahan jaringan';
      addFailure('Bulk Send', bulkChannel, errorMessage);
    } finally {
      setIsSending(false);
    }
  };

  // --- Render ---

  const sendableSelectedCount = Array.from(selectedGuestIds).filter((id) => {
    const guest = guests.find((g) => g.id === id);
    return guest && canSendToGuest(guest);
  }).length;

  return (
    <div className="mx-auto max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold">Kirim Undangan</h1>
        <p className="mt-1 text-sm text-gray-600">
          Kirim undangan digital ke tamu melalui WhatsApp atau Email
        </p>
      </div>

      {/* Failure Notifications */}
      {failures.length > 0 && (
        <div className="mb-6 space-y-2" role="alert" aria-label="Notifikasi kegagalan pengiriman">
          {failures.slice(0, 5).map((failure) => (
            <div
              key={failure.id}
              className="flex items-start justify-between rounded-lg border border-red-200 bg-red-50 p-3"
            >
              <div>
                <p className="text-sm font-medium text-red-800">
                  Gagal mengirim ke {failure.guestName} (
                  {failure.channel === 'whatsapp' ? 'WhatsApp' : 'Email'})
                </p>
                <p className="text-xs text-red-600">{failure.error}</p>
              </div>
              <button
                onClick={() => dismissFailure(failure.id)}
                className="shrink-0 text-red-400 hover:text-red-600"
                aria-label="Tutup notifikasi"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Bulk Send Controls */}
      {selectedGuestIds.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <span className="text-sm font-medium text-blue-800">
            {selectedGuestIds.size} tamu dipilih
          </span>
          <div className="flex items-center gap-2">
            <label htmlFor="bulk-channel" className="text-sm text-blue-700">
              Kirim via:
            </label>
            <select
              id="bulk-channel"
              value={bulkChannel}
              onChange={(e) => setBulkChannel(e.target.value as NotificationChannel)}
              className="rounded-md border border-blue-300 bg-white px-2 py-1 text-sm"
            >
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
            </select>
          </div>
          <button
            onClick={sendBulk}
            disabled={isSending || sendableSelectedCount === 0}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {isSending ? 'Mengirim...' : `Kirim ke ${sendableSelectedCount} Tamu`}
          </button>
          <button
            onClick={() => setSelectedGuestIds(new Set())}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Batal
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Cari nama tamu..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            aria-label="Cari tamu"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as DeliveryStatus | 'all');
            setCurrentPage(1);
          }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          aria-label="Filter status pengiriman"
        >
          <option value="all">Semua Status</option>
          <option value={DeliveryStatus.NOT_SENT}>Belum Dikirim</option>
          <option value={DeliveryStatus.SENT}>Terkirim</option>
          <option value={DeliveryStatus.FAILED}>Gagal</option>
        </select>
      </div>

      {/* Guest Table */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="mt-3 text-sm text-gray-500">Memuat data tamu...</p>
            </div>
          </div>
        ) : paginatedGuests.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-gray-500">Tidak ada tamu ditemukan</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      onChange={toggleSelectAll}
                      checked={
                        paginatedGuests.filter(canSendToGuest).length > 0 &&
                        paginatedGuests
                          .filter(canSendToGuest)
                          .every((g) => selectedGuestIds.has(g.id))
                      }
                      className="h-4 w-4 rounded border-gray-300"
                      aria-label="Pilih semua tamu"
                    />
                  </th>
                  <th className="px-4 py-3">Nama</th>
                  <th className="px-4 py-3">Kontak</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {paginatedGuests.map((guest) => (
                  <GuestRow
                    key={guest.id}
                    guest={guest}
                    isSelected={selectedGuestIds.has(guest.id)}
                    isSending={sendingGuestId === guest.id}
                    onToggleSelect={() => toggleSelectGuest(guest.id)}
                    onSend={sendIndividual}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Menampilkan {(currentPage - 1) * ITEMS_PER_PAGE + 1}–
            {Math.min(currentPage * ITEMS_PER_PAGE, filteredGuests.length)} dari{' '}
            {filteredGuests.length} tamu
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Sebelumnya
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Selanjutnya
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Guest Row Component ---

interface GuestRowProps {
  guest: NotificationGuest;
  isSelected: boolean;
  isSending: boolean;
  onToggleSelect: () => void;
  onSend: (guest: NotificationGuest, channel: NotificationChannel) => void;
}

function GuestRow({ guest, isSelected, isSending, onToggleSelect, onSend }: GuestRowProps) {
  const canSend = canSendToGuest(guest);
  const availableChannels = getAvailableChannels(guest);

  return (
    <tr className={`transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
      <td className="px-4 py-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          disabled={!canSend}
          className="h-4 w-4 rounded border-gray-300 disabled:opacity-50"
          aria-label={`Pilih ${guest.name}`}
        />
      </td>
      <td className="px-4 py-3">
        <p className="font-medium text-gray-900">{guest.name}</p>
      </td>
      <td className="px-4 py-3">
        {canSend ? (
          <div className="space-y-0.5">
            {guest.phone && <p className="text-xs text-gray-600">{guest.phone}</p>}
            {guest.email && <p className="text-xs text-gray-600">{guest.email}</p>}
          </div>
        ) : (
          <p className="text-xs text-amber-600 font-medium">⚠ Data kontak harus dilengkapi</p>
        )}
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${DELIVERY_STATUS_STYLES[guest.delivery_status]}`}
        >
          {DELIVERY_STATUS_LABELS[guest.delivery_status]}
        </span>
      </td>
      <td className="px-4 py-3">
        {canSend ? (
          <div className="flex items-center gap-1">
            {availableChannels.includes('whatsapp') && (
              <button
                onClick={() => onSend(guest, 'whatsapp')}
                disabled={isSending}
                className="rounded-md bg-green-600 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                aria-label={`Kirim ke ${guest.name} via WhatsApp`}
              >
                {isSending ? '...' : 'WA'}
              </button>
            )}
            {availableChannels.includes('email') && (
              <button
                onClick={() => onSend(guest, 'email')}
                disabled={isSending}
                className="rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                aria-label={`Kirim ke ${guest.name} via Email`}
              >
                {isSending ? '...' : 'Email'}
              </button>
            )}
          </div>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </td>
    </tr>
  );
}
