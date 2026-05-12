'use client';

interface MessagesFormProps {
  content: Record<string, unknown>;
  onChange: (content: Record<string, unknown>) => void;
}

export function MessagesForm({ content, onChange }: MessagesFormProps) {
  const isEnabled = (content.is_enabled as boolean) ?? true;
  const placeholderText = (content.placeholder_text as string) || '';

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-700">
        Section ini menampilkan form ucapan dari tamu dan daftar ucapan yang sudah masuk.
      </div>

      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div>
          <p className="text-sm font-medium text-gray-700">Aktifkan Form Ucapan</p>
          <p className="text-xs text-gray-500">Tamu dapat mengirim ucapan melalui undangan</p>
        </div>
        <label className="relative inline-flex cursor-pointer items-center">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(e) => onChange({ ...content, is_enabled: e.target.checked })}
            className="peer sr-only"
          />
          <div className="h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:ring-2 peer-focus:ring-primary/20" />
        </label>
      </div>

      <div>
        <label htmlFor="messages-placeholder" className="block text-sm font-medium text-gray-700">
          Placeholder Text
        </label>
        <input
          id="messages-placeholder"
          type="text"
          value={placeholderText}
          onChange={(e) => onChange({ ...content, placeholder_text: e.target.value })}
          placeholder="Contoh: Tulis ucapan untuk pengantin..."
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <p className="mt-1 text-xs text-gray-500">
          Teks ini akan muncul sebagai placeholder di form ucapan tamu.
        </p>
      </div>
    </div>
  );
}
