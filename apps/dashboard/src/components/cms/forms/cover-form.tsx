'use client';

import { MediaUpload } from '../media-upload';

interface CoverFormProps {
  content: Record<string, unknown>;
  onChange: (content: Record<string, unknown>) => void;
}

export function CoverForm({ content, onChange }: CoverFormProps) {
  const title = (content.title as string) || '';
  const subtitle = (content.subtitle as string) || '';
  const backgroundImage = (content.background_image as string) || '';
  const openingText = (content.opening_text as string) || '';

  const handleUpload = async (file: File): Promise<string> => {
    // In production, upload to server and return URL
    return URL.createObjectURL(file);
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="cover-title" className="block text-sm font-medium text-gray-700">
          Judul
        </label>
        <input
          id="cover-title"
          type="text"
          value={title}
          onChange={(e) => onChange({ ...content, title: e.target.value })}
          placeholder="Contoh: The Wedding of"
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div>
        <label htmlFor="cover-subtitle" className="block text-sm font-medium text-gray-700">
          Subtitle
        </label>
        <input
          id="cover-subtitle"
          type="text"
          value={subtitle}
          onChange={(e) => onChange({ ...content, subtitle: e.target.value })}
          placeholder="Contoh: Romeo & Juliet"
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div>
        <label htmlFor="cover-opening" className="block text-sm font-medium text-gray-700">
          Teks Tombol Buka
        </label>
        <input
          id="cover-opening"
          type="text"
          value={openingText}
          onChange={(e) => onChange({ ...content, opening_text: e.target.value })}
          placeholder="Contoh: Buka Undangan"
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
        label="Background Image"
      />
    </div>
  );
}
