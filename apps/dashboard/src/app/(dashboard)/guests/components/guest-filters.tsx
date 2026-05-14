'use client';

import { GuestGroup } from '@wedding/shared';

type GuestStatusFilter = 'belum_rsvp' | 'confirmed' | 'declined' | 'checked_in';

interface GuestFiltersProps {
  groupFilter: GuestGroup | '';
  statusFilter: GuestStatusFilter | '';
  onGroupChange: (value: GuestGroup | '') => void;
  onStatusChange: (value: GuestStatusFilter | '') => void;
}

const GROUP_OPTIONS: { value: GuestGroup; label: string }[] = [
  { value: GuestGroup.FAMILY, label: 'Keluarga' },
  { value: GuestGroup.FRIEND, label: 'Teman' },
  { value: GuestGroup.COLLEAGUE, label: 'Rekan Kerja' },
  { value: GuestGroup.VIP, label: 'VIP' },
];

const STATUS_OPTIONS: { value: GuestStatusFilter; label: string }[] = [
  { value: 'belum_rsvp', label: 'Belum RSVP' },
  { value: 'confirmed', label: 'Konfirmasi Hadir' },
  { value: 'declined', label: 'Menolak' },
  { value: 'checked_in', label: 'Sudah Check-in' },
];

export function GuestFilters({
  groupFilter,
  statusFilter,
  onGroupChange,
  onStatusChange,
}: GuestFiltersProps) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex items-center gap-2">
        <label htmlFor="filter-group" className="text-sm font-medium text-gray-700">
          Grup:
        </label>
        <select
          id="filter-group"
          value={groupFilter}
          onChange={(e) => onGroupChange(e.target.value as GuestGroup | '')}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="">Semua Grup</option>
          {GROUP_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="filter-status" className="text-sm font-medium text-gray-700">
          Status:
        </label>
        <select
          id="filter-status"
          value={statusFilter}
          onChange={(e) => onStatusChange(e.target.value as GuestStatusFilter | '')}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="">Semua Status</option>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {(groupFilter || statusFilter) && (
        <button
          onClick={() => {
            onGroupChange('');
            onStatusChange('');
          }}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Reset Filter
        </button>
      )}
    </div>
  );
}
