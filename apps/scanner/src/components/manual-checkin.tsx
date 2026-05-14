/**
 * Manual check-in component with search and Go-Show registration.
 * Provides search bar with partial name match (min 3 chars, max 10 results).
 * Shows check-in button for unchecked guests, "Sudah Check-in" for checked guests.
 * Shows "Tambah sebagai Go-Show" when no results found.
 * Displays GREEN confirmation for 3 seconds on success.
 * Preserves form data on server error.
 * UI labels in Bahasa Indonesia.
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { usePWA } from '@/components/pwa-provider';
import { searchCachedGuests, type CachedGuest } from '@/lib/indexed-db';
import { enqueueCheckIn } from '@/lib/offline-queue';
import { SuccessOverlay } from './success-overlay';
import { GoShowForm } from './go-show-form';

type ViewState = 'search' | 'go-show' | 'success';

interface ManualCheckInProps {
  /** Event ID for scoping search and check-in */
  eventId: string;
}

export function ManualCheckIn({ eventId }: ManualCheckInProps) {
  const { isOnline, apiBaseUrl, authToken } = usePWA();

  // Search state
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CachedGuest[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Check-in state
  const [checkingInId, setCheckingInId] = useState<string | null>(null);
  const [checkInError, setCheckInError] = useState<string | null>(null);

  // Go-Show state
  const [goShowError, setGoShowError] = useState<string | null>(null);
  const [isGoShowLoading, setIsGoShowLoading] = useState(false);

  // View state
  const [viewState, setViewState] = useState<ViewState>('search');
  const [successGuestName, setSuccessGuestName] = useState('');

  // Debounce timer ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  /**
   * Search guests with debounce (300ms).
   * When online: search via API. When offline: search local IndexedDB cache.
   */
  const performSearch = useCallback(
    async (searchQuery: string) => {
      if (searchQuery.length < 3) {
        setResults([]);
        setHasSearched(false);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      setCheckInError(null);

      try {
        if (isOnline) {
          // Online: search via API
          const response = await fetch(
            `${apiBaseUrl}/guests/search?q=${encodeURIComponent(searchQuery)}&event_id=${eventId}`,
            {
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${authToken}`,
              },
            }
          );

          if (response.ok) {
            const data = await response.json();
            const guests: CachedGuest[] = (data.guests || [])
              .slice(0, 10)
              .map((g: Record<string, unknown>) => ({
                id: g.id as string,
                name: g.name as string,
                qrPayload: (g.qrPayload as string) || '',
                group: (g.group as string) || '',
                checkedIn: g.checkedIn as boolean,
                checkedInAt: g.checkedInAt as string | undefined,
                eventId: g.eventId as string,
              }));
            setResults(guests);
          } else {
            // Fallback to local search on API error
            const localResults = await searchCachedGuests(searchQuery, eventId);
            setResults(localResults);
          }
        } else {
          // Offline: search local IndexedDB cache
          const localResults = await searchCachedGuests(searchQuery, eventId);
          setResults(localResults);
        }
      } catch {
        // Fallback to local search on network error
        try {
          const localResults = await searchCachedGuests(searchQuery, eventId);
          setResults(localResults);
        } catch {
          setResults([]);
        }
      } finally {
        setIsSearching(false);
        setHasSearched(true);
      }
    },
    [isOnline, apiBaseUrl, authToken, eventId]
  );

  /**
   * Handle search input change with debounce.
   */
  const handleSearchChange = (value: string) => {
    setQuery(value);
    setCheckInError(null);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (value.length < 3) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      performSearch(value);
    }, 300);
  };

  /**
   * Perform check-in for a guest.
   * When online: POST to API. When offline: queue locally.
   */
  const handleCheckIn = async (guest: CachedGuest) => {
    setCheckingInId(guest.id);
    setCheckInError(null);

    try {
      if (isOnline) {
        // Online: POST to API
        const response = await fetch(`${apiBaseUrl}/check-in/manual`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            guestId: guest.id,
            eventId,
          }),
        });

        if (response.ok) {
          // Update local state to reflect check-in
          setResults((prev) =>
            prev.map((g) =>
              g.id === guest.id
                ? { ...g, checkedIn: true, checkedInAt: new Date().toISOString() }
                : g
            )
          );
          showSuccess(guest.name);
        } else {
          const errorData = await response.json().catch(() => null);
          setCheckInError(errorData?.message || 'Gagal melakukan check-in. Silakan coba lagi.');
        }
      } else {
        // Offline: queue the check-in locally
        await enqueueCheckIn({
          guestId: guest.id,
          qrPayload: guest.qrPayload,
          method: 'manual',
          eventId,
          guestName: guest.name,
        });

        // Update local results to reflect check-in
        setResults((prev) =>
          prev.map((g) =>
            g.id === guest.id ? { ...g, checkedIn: true, checkedInAt: new Date().toISOString() } : g
          )
        );
        showSuccess(guest.name);
      }
    } catch {
      setCheckInError('Terjadi kesalahan jaringan. Silakan coba lagi.');
    } finally {
      setCheckingInId(null);
    }
  };

  /**
   * Handle Go-Show registration.
   * When online: POST to API. When offline: queue locally with generated ID.
   */
  const handleGoShowSubmit = async (nama: string) => {
    setIsGoShowLoading(true);
    setGoShowError(null);

    try {
      if (isOnline) {
        // Online: POST to API
        const response = await fetch(`${apiBaseUrl}/guests/go-show`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            nama,
            eventId,
          }),
        });

        if (response.ok) {
          showSuccess(nama);
        } else {
          const errorData = await response.json().catch(() => null);
          setGoShowError(errorData?.message || 'Gagal mendaftarkan tamu. Silakan coba lagi.');
        }
      } else {
        // Offline: queue the Go-Show locally
        const tempGuestId = `go-show-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        await enqueueCheckIn({
          guestId: tempGuestId,
          qrPayload: '',
          method: 'go_show',
          eventId,
          guestName: nama,
        });
        showSuccess(nama);
      }
    } catch {
      setGoShowError('Terjadi kesalahan jaringan. Silakan coba lagi.');
    } finally {
      setIsGoShowLoading(false);
    }
  };

  /**
   * Show success overlay and reset state after dismiss.
   */
  const showSuccess = (guestName: string) => {
    setSuccessGuestName(guestName);
    setViewState('success');
  };

  const handleSuccessDismiss = useCallback(() => {
    setViewState('search');
    setSuccessGuestName('');
    setQuery('');
    setResults([]);
    setHasSearched(false);
    setGoShowError(null);
  }, []);

  // Show success overlay
  if (viewState === 'success') {
    return <SuccessOverlay guestName={successGuestName} onDismiss={handleSuccessDismiss} />;
  }

  // Show Go-Show form
  if (viewState === 'go-show') {
    return (
      <div className="p-4">
        <GoShowForm
          onSubmit={handleGoShowSubmit}
          onCancel={() => {
            setViewState('search');
            setGoShowError(null);
          }}
          isLoading={isGoShowLoading}
          error={goShowError}
          initialName={query}
        />
      </div>
    );
  }

  // Main search view
  return (
    <div className="flex flex-col p-4">
      {/* Header */}
      <h2 className="text-lg font-semibold text-gray-900">Check-in Manual</h2>
      <p className="mt-1 text-sm text-gray-500">Cari nama tamu untuk check-in manual</p>

      {/* Search bar */}
      <div className="relative mt-4">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
          <SearchIcon />
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Ketik minimal 3 huruf untuk mencari..."
          className="block w-full rounded-xl border border-gray-300 bg-white py-3.5 pl-11 pr-4 text-base text-gray-900 placeholder-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          aria-label="Cari nama tamu"
          autoComplete="off"
        />
        {isSearching && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-4">
            <LoadingSpinner />
          </div>
        )}
      </div>

      {/* Minimum chars hint */}
      {query.length > 0 && query.length < 3 && (
        <p className="mt-2 text-sm text-gray-400">
          Ketik {3 - query.length} huruf lagi untuk mencari
        </p>
      )}

      {/* Error message */}
      {checkInError && (
        <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
          {checkInError}
        </div>
      )}

      {/* Search results */}
      {hasSearched && results.length > 0 && (
        <div className="mt-4 space-y-2" role="list" aria-label="Hasil pencarian tamu">
          {results.map((guest) => (
            <GuestResultItem
              key={guest.id}
              guest={guest}
              isCheckingIn={checkingInId === guest.id}
              onCheckIn={() => handleCheckIn(guest)}
            />
          ))}
        </div>
      )}

      {/* No results — show Go-Show option */}
      {hasSearched && results.length === 0 && query.length >= 3 && !isSearching && (
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500">
            Tidak ditemukan tamu dengan nama &ldquo;{query}&rdquo;
          </p>
          <button
            onClick={() => setViewState('go-show')}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <PlusIcon />
            Tambah sebagai Go-Show
          </button>
        </div>
      )}
    </div>
  );
}

// ============ Sub-components ============

interface GuestResultItemProps {
  guest: CachedGuest;
  isCheckingIn: boolean;
  onCheckIn: () => void;
}

function GuestResultItem({ guest, isCheckingIn, onCheckIn }: GuestResultItemProps) {
  const groupLabel = getGroupLabel(guest.group);

  return (
    <div
      className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
      role="listitem"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-medium text-gray-900">{guest.name}</p>
        {groupLabel && <p className="mt-0.5 text-sm text-gray-500">{groupLabel}</p>}
      </div>

      <div className="ml-3 flex-shrink-0">
        {guest.checkedIn ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-500">
            <CheckIcon />
            Sudah Check-in
          </span>
        ) : (
          <button
            onClick={onCheckIn}
            disabled={isCheckingIn}
            className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            aria-label={`Check-in ${guest.name}`}
          >
            {isCheckingIn ? 'Proses...' : 'Check-in'}
          </button>
        )}
      </div>
    </div>
  );
}

// ============ Helper functions ============

function getGroupLabel(group: string): string {
  switch (group) {
    case 'family':
      return 'Keluarga';
    case 'friend':
      return 'Teman';
    case 'colleague':
      return 'Rekan Kerja';
    case 'vip':
      return 'VIP';
    default:
      return group || '';
  }
}

// ============ Icons ============

function SearchIcon() {
  return (
    <svg
      className="h-5 w-5 text-gray-400"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="h-4 w-4 text-gray-400"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function LoadingSpinner() {
  return (
    <svg
      className="h-5 w-5 animate-spin text-gray-400"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
