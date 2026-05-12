'use client';

interface RsvpFormProps {
  content: Record<string, unknown>;
  onChange: (content: Record<string, unknown>) => void;
}

export function RsvpForm({ content, onChange }: RsvpFormProps) {
  const maxPlusOne = (content.max_plus_one as number) ?? 1;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-700">
        Section RSVP akan menampilkan form konfirmasi kehadiran dengan pilihan: Akad, Resepsi, Keduanya, atau Menolak.
      </div>

      <div>
        <label htmlFor="rsvp-max-plus-one" className="block text-sm font-medium text-gray-700">
          Maksimal Tamu Tambahan (Plus One)
        </label>
        <input
          id="rsvp-max-plus-one"
          type="number"
          min={0}
          max={10}
          value={maxPlusOne}
          onChange={(e) => onChange({ ...content, max_plus_one: parseInt(e.target.value) || 0 })}
          className="mt-1 w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <p className="mt-1 text-xs text-gray-500">
          Jumlah tamu tambahan yang diizinkan per undangan. Tamu dapat membawa maksimal {maxPlusOne} orang tambahan.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Pilihan Kehadiran
        </label>
        <div className="space-y-2">
          {[
            { value: 'akad', label: 'Akad Nikah' },
            { value: 'resepsi', label: 'Resepsi' },
            { value: 'both', label: 'Keduanya' },
            { value: 'decline', label: 'Menolak' },
          ].map((option) => (
            <div key={option.value} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm text-gray-700">{option.label}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Pilihan kehadiran ini otomatis tersedia di form RSVP undangan.
        </p>
      </div>
    </div>
  );
}
