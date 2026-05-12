'use client';

interface MusicFormProps {
  content: Record<string, unknown>;
  onChange: (content: Record<string, unknown>) => void;
}

export function MusicForm({ content, onChange }: MusicFormProps) {
  const audioUrl = (content.audio_url as string) || '';
  const autoplay = (content.autoplay as boolean) ?? false;
  const title = (content.title as string) || '';

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-700">
        Background music akan diputar saat tamu membuka undangan. Tamu dapat mengontrol play/pause.
      </div>

      <div>
        <label htmlFor="music-title" className="block text-sm font-medium text-gray-700">
          Judul Lagu
        </label>
        <input
          id="music-title"
          type="text"
          value={title}
          onChange={(e) => onChange({ ...content, title: e.target.value })}
          placeholder="Contoh: Perfect - Ed Sheeran"
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div>
        <label htmlFor="music-url" className="block text-sm font-medium text-gray-700">
          URL Audio
        </label>
        <input
          id="music-url"
          type="url"
          value={audioUrl}
          onChange={(e) => onChange({ ...content, audio_url: e.target.value })}
          placeholder="https://example.com/music.mp3"
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <p className="mt-1 text-xs text-gray-500">
          Masukkan URL file audio (MP3). Pastikan file dapat diakses publik.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div>
          <p className="text-sm font-medium text-gray-700">Autoplay</p>
          <p className="text-xs text-gray-500">Putar musik otomatis saat undangan dibuka</p>
        </div>
        <label className="relative inline-flex cursor-pointer items-center">
          <input
            type="checkbox"
            checked={autoplay}
            onChange={(e) => onChange({ ...content, autoplay: e.target.checked })}
            className="peer sr-only"
          />
          <div className="h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:ring-2 peer-focus:ring-primary/20" />
        </label>
      </div>
    </div>
  );
}
