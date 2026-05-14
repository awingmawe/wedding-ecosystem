'use client';

import { useEffect, useState } from 'react';
import { useSocket, type ConnectionStatus } from '@/hooks/use-socket';
import {
  useRealtimeStats,
  type EventStats,
  type RsvpTrackingItem,
} from '@/hooks/use-realtime-stats';
import { apiFetch } from '@/lib/api';

/** Map attendance type to Bahasa Indonesia label */
function getAttendanceLabel(attendance: string): string {
  switch (attendance) {
    case 'akad':
      return 'Akad';
    case 'resepsi':
      return 'Resepsi';
    case 'both':
      return 'Keduanya';
    case 'decline':
      return 'Menolak';
    default:
      return '-';
  }
}

/** Format timestamp to locale string */
function formatTimestamp(timestamp: string): string {
  if (!timestamp) return '-';
  const date = new Date(timestamp);
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Connection status badge component */
function ConnectionStatusBadge({ status }: { status: ConnectionStatus }) {
  const isConnected = status === 'terhubung';
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
        isConnected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
      }`}
      role="status"
      aria-live="polite"
      aria-label={`Status koneksi: ${status}`}
    >
      <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
      {status === 'terhubung' ? 'Terhubung' : 'Terputus'}
    </div>
  );
}

/** Statistics card component */
function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color || 'text-primary'}`}>{value}</p>
    </div>
  );
}

/** Attendance badge component */
function AttendanceBadge({ attendance }: { attendance: string }) {
  const styles: Record<string, string> = {
    akad: 'bg-purple-100 text-purple-700',
    resepsi: 'bg-blue-100 text-blue-700',
    both: 'bg-green-100 text-green-700',
    decline: 'bg-red-100 text-red-700',
  };

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
        styles[attendance] || 'bg-gray-100 text-gray-700'
      }`}
    >
      {getAttendanceLabel(attendance)}
    </span>
  );
}

export default function RsvpTrackingPage() {
  const [eventId, setEventId] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialStats, setInitialStats] = useState<EventStats>({
    total_guests: 0,
    total_rsvp: 0,
    total_checked_in: 0,
    total_go_show: 0,
  });
  const [initialRsvpList, setInitialRsvpList] = useState<RsvpTrackingItem[]>([]);

  // Fetch initial data and event ID
  useEffect(() => {
    async function fetchInitialData() {
      try {
        const eventData = await apiFetch<{ id: string }>('/events/current');
        setEventId(eventData.id);

        // Parallel fetching to avoid data waterfalls (Next.js best practice)
        const [statsData, rsvpData] = await Promise.all([
          apiFetch<EventStats>(`/events/${eventData.id}/stats`),
          apiFetch<{ data: RsvpTrackingItem[] }>(`/events/${eventData.id}/rsvp`),
        ]);

        setInitialStats(statsData);
        setInitialRsvpList(rsvpData.data);
      } catch {
        // If API is not available, use empty defaults
      } finally {
        setInitialLoading(false);
      }
    }

    fetchInitialData();
  }, []);

  // WebSocket connection
  const { socket, connectionStatus } = useSocket({
    eventId,
    autoConnect: true,
  });

  // Real-time stats and RSVP list
  const { stats, rsvpList } = useRealtimeStats({
    socket,
    initialStats,
    initialRsvpList,
  });

  return (
    <div className="space-y-6">
      {/* Page header with connection status */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Tracking RSVP</h1>
          <p className="mt-1 text-sm text-gray-500">
            Pantau konfirmasi kehadiran tamu secara real-time
          </p>
        </div>
        <ConnectionStatusBadge status={connectionStatus} />
      </div>

      {/* Real-time statistics panel */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Tamu" value={stats.total_guests} />
        <StatCard label="RSVP Masuk" value={stats.total_rsvp} color="text-blue-600" />
        <StatCard label="Check-in" value={stats.total_checked_in} color="text-green-600" />
        <StatCard label="Go-Show" value={stats.total_go_show} color="text-amber-600" />
      </div>

      {/* RSVP tracking table */}
      <div className="rounded-xl bg-white shadow-sm">
        <div className="border-b px-6 py-4">
          <h2 className="font-heading text-lg font-semibold">Daftar RSVP</h2>
        </div>

        {initialLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="mx-auto h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="mt-2 text-sm text-gray-500">Memuat data...</p>
            </div>
          </div>
        ) : rsvpList.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-gray-500">Belum ada RSVP yang masuk</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th scope="col" className="px-6 py-3">
                    Nama Tamu
                  </th>
                  <th scope="col" className="px-6 py-3">
                    Pilihan Kehadiran
                  </th>
                  <th scope="col" className="px-6 py-3">
                    Jumlah Tamu
                  </th>
                  <th scope="col" className="px-6 py-3">
                    Waktu Submission
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rsvpList.map((item) => (
                  <tr key={item.guest_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">{item.guest_name}</td>
                    <td className="px-6 py-4">
                      <AttendanceBadge attendance={item.attendance} />
                    </td>
                    <td className="px-6 py-4">
                      {item.attendance === 'decline' ? '-' : item.guest_count}
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {formatTimestamp(item.submitted_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
