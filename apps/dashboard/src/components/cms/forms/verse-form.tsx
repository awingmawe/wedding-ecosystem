'use client';

import { MediaUpload } from '../media-upload';

interface VerseFormProps {
  content: Record<string, unknown>;
  onChange: (content: Record<string, unknown>) => void;
}

export function VerseForm({ content, onChange }: VerseFormProps) {
  const text = (content.text as string) || '';
  const source = (content.source as string) || '';
  const backgroundImage = (content.background_image as string) || '';

  const handleUpload = async (file: File): Promise<string> => {
    return URL.createObjectURL(file);
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="verse-text" className="block text-sm font-medium text-gray-700">
          Teks Ayat / Doa
        </label>
        <textarea
          id="verse-text"
          value={text}
          onChange={(e) => onChange({ ...content, text: e.target.value })}
          placeholder="Masukkan ayat atau doa..."
          rows={4}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div>
        <label htmlFor="verse-source" className="block text-sm font-medium text-gray-700">
          Sumber
        </label>
        <input
          id="verse-source"
          type="text"
          value={source}
          onChange={(e) => onChange({ ...content, source: e.target.value })}
          placeholder="Contoh: QS. Ar-Rum: 21"
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <MediaUpload
        mediaType="image"
        currentUrl={backgroundImage}
        onUpload={async (file) => {
          const url = await handleUpload(file);
          onChange({ ...content, background_image: url });
          return url;
        }}
        onRemove={() => onChange({ ...content, background_image: '' })}
        label="Background Image (opsional)"
      />
    </div>
  );
}
