'use client';

import { MediaUpload } from '../media-upload';

interface GalleryFormProps {
  content: Record<string, unknown>;
  onChange: (content: Record<string, unknown>) => void;
}

interface Photo {
  url: string;
  caption: string;
  order: number;
}

export function GalleryForm({ content, onChange }: GalleryFormProps) {
  const photos = (content.photos as Photo[]) || [];

  const addPhoto = () => {
    const newOrder = photos.length + 1;
    onChange({
      ...content,
      photos: [...photos, { url: '', caption: '', order: newOrder }],
    });
  };

  const updatePhoto = (index: number, field: keyof Photo, value: string | number) => {
    const updated = [...photos];
    updated[index] = { ...updated[index], [field]: value };
    onChange({ ...content, photos: updated });
  };

  const removePhoto = (index: number) => {
    const updated = photos
      .filter((_, i) => i !== index)
      .map((photo, i) => ({ ...photo, order: i + 1 }));
    onChange({ ...content, photos: updated });
  };

  const handleUpload = async (file: File): Promise<string> => {
    return URL.createObjectURL(file);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          Upload foto prewedding untuk galeri undangan.
        </p>
        <button
          type="button"
          onClick={addPhoto}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Tambah Foto
        </button>
      </div>

      {photos.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-500">Belum ada foto. Klik tombol di atas untuk menambahkan.</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {photos.map((photo, index) => (
          <div key={index} className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">Foto #{photo.order}</span>
              <button
                type="button"
                onClick={() => removePhoto(index)}
                className="text-xs text-red-500 hover:text-red-700"
              >
                Hapus
              </button>
            </div>

            <MediaUpload
              mediaType="image"
              currentUrl={photo.url}
              onUpload={async (file) => {
                const url = await handleUpload(file);
                updatePhoto(index, 'url', url);
                return url;
              }}
              onRemove={() => updatePhoto(index, 'url', '')}
            />

            <input
              type="text"
              value={photo.caption}
              onChange={(e) => updatePhoto(index, 'caption', e.target.value)}
              placeholder="Caption (opsional)"
              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
