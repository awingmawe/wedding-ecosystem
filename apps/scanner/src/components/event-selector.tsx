/**
 * Event selector screen for Scanner PWA.
 * Shows after login — user picks which event to scan for.
 * Also handles device registration.
 * UI labels in Bahasa Indonesia.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchEvents, registerDevice, storeEventId, type EventInfo, AuthError } from '@/lib/auth';
import { useAuth } from './auth-provider';

interface EventSelectorProps {
  onEventSelected: (eventId: string) => void;
  initialEventId?: string | null;
}

export function EventSelector({ onEventSelected, initialEventId }: EventSelectorProps) {
  const { user, logout } = useAuth();
  const [events, setEvents] = useState<EventInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchEvents();
      setEvents(data);

      // If there's a stored event ID and it's in the list, auto-select it
      if (initialEventId) {
        const found = data.find((e) => e.id === initialEventId);
        if (found && found.status === 'published') {
          await handleSelectEvent(found.id);
          return;
        }
      }
    } catch (err) {
      if (err instanceof AuthError && err.code === 'AUTH_EXPIRED') {
        logout();
        return;
      }
      setError(err instanceof Error ? err.message : 'Gagal memuat daftar event.');
    } finally {
      setIsLoading(false);
    }
  }, [initialEventId, logout]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const handleSelectEvent = async (eventId: string) => {
    setIsRegistering(true);
    setError(null);

    try {
      // Generate a device name based on user and timestamp
      const deviceName = `${user?.name || 'Scanner'} - ${new Date().toLocaleDateString('id-ID')}`;
      await registerDevice(eventId, deviceName);
      storeEventId(eventId);
      onEventSelected(eventId);
    } catch (err) {
      if (err instanceof AuthError) {
        if (err.code === 'AUTH_EXPIRED') {
          logout();
          return;
        }
        setError(err.message);
      } else {
        setError('Gagal mendaftarkan device. Coba lagi.');
      }
    } finally {
      setIsRegistering(false);
    }
  };

  // Format date to Indonesian format
  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-gray-300 border-t-emerald-600" />
          <p className="text-sm text-gray-500">Memuat daftar event...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Pilih Event</h1>
          <p className="text-sm text-gray-500">Halo, {user?.name || 'Scanner Operator'}</p>
        </div>
        <button
          onClick={logout}
          className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100"
        >
          Keluar
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={loadEvents} className="mt-2 text-xs font-medium text-red-600 underline">
            Coba lagi
          </button>
        </div>
      )}

      {/* Registering overlay */}
      {isRegistering && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400 border-t-emerald-700" />
          <p className="text-sm text-emerald-700">Mendaftarkan device...</p>
        </div>
      )}

      {/* Event list */}
      {events.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
            <svg
              className="h-6 w-6 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <p className="text-sm text-gray-500">Belum ada event yang tersedia.</p>
          <p className="mt-1 text-xs text-gray-400">Hubungi admin untuk menambahkan event.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {events
            .filter((event) => event.status === 'published')
            .map((event) => (
              <button
                key={event.id}
                onClick={() => handleSelectEvent(event.id)}
                disabled={isRegistering}
                className="w-full rounded-xl border border-gray-200 bg-white p-4 text-left transition-all hover:border-emerald-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">
                      {event.bride_name} & {event.groom_name}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">{formatDate(event.event_date)}</p>
                    <p className="mt-0.5 text-xs text-gray-400">{event.venue_name}</p>
                  </div>
                  <div className="ml-3 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50">
                    <svg
                      className="h-4 w-4 text-emerald-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </div>
              </button>
            ))}

          {/* Show draft events as disabled */}
          {events
            .filter((event) => event.status !== 'published')
            .map((event) => (
              <div
                key={event.id}
                className="w-full rounded-xl border border-gray-100 bg-gray-50 p-4 opacity-60"
              >
                <h3 className="font-semibold text-gray-600">
                  {event.bride_name} & {event.groom_name}
                </h3>
                <p className="mt-1 text-sm text-gray-400">{formatDate(event.event_date)}</p>
                <span className="mt-2 inline-block rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-500">
                  {event.status === 'draft' ? 'Draft' : 'Selesai'}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
