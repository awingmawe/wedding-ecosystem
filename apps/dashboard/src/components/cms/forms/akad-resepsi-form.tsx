'use client';

interface AkadResepsiFormProps {
  content: Record<string, unknown>;
  onChange: (content: Record<string, unknown>) => void;
}

interface EventTime {
  date: string;
  time_start: string;
  time_end: string;
}

export function AkadResepsiForm({ content, onChange }: AkadResepsiFormProps) {
  const akad = (content.akad as EventTime) || { date: '', time_start: '', time_end: '' };
  const resepsi = (content.resepsi as EventTime) || { date: '', time_start: '', time_end: '' };
  const venue = (content.venue as string) || '';
  const mapsUrl = (content.maps_url as string) || '';

  const updateEvent = (type: 'akad' | 'resepsi', field: keyof EventTime, value: string) => {
    const current = type === 'akad' ? akad : resepsi;
    onChange({
      ...content,
      [type]: { ...current, [field]: value },
    });
  };

  const renderEventForm = (type: 'akad' | 'resepsi', label: string) => {
    const event = type === 'akad' ? akad : resepsi;

    return (
      <div className="space-y-3 rounded-lg border border-gray-100 bg-gray-50 p-4">
        <h3 className="text-sm font-semibold text-gray-800">{label}</h3>

        <div>
          <label htmlFor={`${type}-date`} className="block text-sm font-medium text-gray-700">
            Tanggal
          </label>
          <input
            id={`${type}-date`}
            type="date"
            value={event.date}
            onChange={(e) => updateEvent(type, 'date', e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${type}-start`} className="block text-sm font-medium text-gray-700">
              Jam Mulai
            </label>
            <input
              id={`${type}-start`}
              type="time"
              value={event.time_start}
              onChange={(e) => updateEvent(type, 'time_start', e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div>
            <label htmlFor={`${type}-end`} className="block text-sm font-medium text-gray-700">
              Jam Selesai
            </label>
            <input
              id={`${type}-end`}
              type="time"
              value={event.time_end}
              onChange={(e) => updateEvent(type, 'time_end', e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {renderEventForm('akad', '💍 Akad Nikah')}
      {renderEventForm('resepsi', '🎉 Resepsi')}

      <div>
        <label htmlFor="venue" className="block text-sm font-medium text-gray-700">
          Nama Venue
        </label>
        <input
          id="venue"
          type="text"
          value={venue}
          onChange={(e) => onChange({ ...content, venue: e.target.value })}
          placeholder="Contoh: Hotel Grand Ballroom"
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div>
        <label htmlFor="maps-url" className="block text-sm font-medium text-gray-700">
          Link Google Maps
        </label>
        <input
          id="maps-url"
          type="url"
          value={mapsUrl}
          onChange={(e) => onChange({ ...content, maps_url: e.target.value })}
          placeholder="https://maps.google.com/..."
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <p className="mt-1 text-xs text-gray-500">
          Link ini akan ditampilkan sebagai tombol navigasi di undangan.
        </p>
      </div>
    </div>
  );
}
