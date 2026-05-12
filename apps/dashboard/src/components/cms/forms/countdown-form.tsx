'use client';

interface CountdownFormProps {
  content: Record<string, unknown>;
  onChange: (content: Record<string, unknown>) => void;
}

export function CountdownForm({ content, onChange }: CountdownFormProps) {
  const targetDate = (content.target_date as string) || '';
  const calendarLink = (content.calendar_link as string) || '';

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="countdown-date" className="block text-sm font-medium text-gray-700">
          Tanggal Acara
        </label>
        <input
          id="countdown-date"
          type="datetime-local"
          value={targetDate}
          onChange={(e) => onChange({ ...content, target_date: e.target.value })}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <p className="mt-1 text-xs text-gray-500">
          Countdown akan menghitung mundur ke tanggal dan waktu ini.
        </p>
      </div>

      <div>
        <label htmlFor="countdown-calendar" className="block text-sm font-medium text-gray-700">
          Link Kalender (opsional)
        </label>
        <input
          id="countdown-calendar"
          type="url"
          value={calendarLink}
          onChange={(e) => onChange({ ...content, calendar_link: e.target.value })}
          placeholder="https://calendar.google.com/..."
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <p className="mt-1 text-xs text-gray-500">
          Link Google Calendar atau file .ics untuk tombol &quot;Tambah ke Kalender&quot;.
        </p>
      </div>
    </div>
  );
}
