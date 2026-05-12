'use client';

import { MediaUpload } from '../media-upload';

interface StoryFormProps {
  content: Record<string, unknown>;
  onChange: (content: Record<string, unknown>) => void;
}

interface Chapter {
  title: string;
  description: string;
  image: string;
  date: string;
}

export function StoryForm({ content, onChange }: StoryFormProps) {
  const chapters = (content.chapters as Chapter[]) || [];

  const addChapter = () => {
    onChange({
      ...content,
      chapters: [...chapters, { title: '', description: '', image: '', date: '' }],
    });
  };

  const updateChapter = (index: number, field: keyof Chapter, value: string) => {
    const updated = [...chapters];
    updated[index] = { ...updated[index], [field]: value };
    onChange({ ...content, chapters: updated });
  };

  const removeChapter = (index: number) => {
    const updated = chapters.filter((_, i) => i !== index);
    onChange({ ...content, chapters: updated });
  };

  const handleUpload = async (file: File): Promise<string> => {
    return URL.createObjectURL(file);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          Tambahkan chapter untuk menceritakan perjalanan cinta Anda.
        </p>
        <button
          type="button"
          onClick={addChapter}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Tambah Chapter
        </button>
      </div>

      {chapters.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-500">Belum ada chapter. Klik tombol di atas untuk menambahkan.</p>
        </div>
      )}

      {chapters.map((chapter, index) => (
        <div key={index} className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-700">Chapter {index + 1}</h4>
            <button
              type="button"
              onClick={() => removeChapter(index)}
              className="text-sm text-red-500 hover:text-red-700"
            >
              Hapus
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Judul</label>
            <input
              type="text"
              value={chapter.title}
              onChange={(e) => updateChapter(index, 'title', e.target.value)}
              placeholder="Contoh: Pertama Bertemu"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Tanggal</label>
            <input
              type="date"
              value={chapter.date}
              onChange={(e) => updateChapter(index, 'date', e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Deskripsi</label>
            <textarea
              value={chapter.description}
              onChange={(e) => updateChapter(index, 'description', e.target.value)}
              placeholder="Ceritakan momen ini..."
              rows={3}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <MediaUpload
            mediaType="image"
            currentUrl={chapter.image}
            onUpload={async (file) => {
              const url = await handleUpload(file);
              updateChapter(index, 'image', url);
              return url;
            }}
            onRemove={() => updateChapter(index, 'image', '')}
            label="Foto"
          />
        </div>
      ))}
    </div>
  );
}
