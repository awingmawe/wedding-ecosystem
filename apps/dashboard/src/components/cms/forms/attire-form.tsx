'use client';

import { useState } from 'react';
import { MediaUpload } from '../media-upload';

interface AttireFormProps {
  content: Record<string, unknown>;
  onChange: (content: Record<string, unknown>) => void;
}

export function AttireForm({ content, onChange }: AttireFormProps) {
  const description = (content.description as string) || '';
  const outfitImage = (content.outfit_image as string) || '';
  const colorPalette = (content.color_palette as string[]) || [];
  const [newColor, setNewColor] = useState('#');

  const addColor = () => {
    if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(newColor)) {
      onChange({ ...content, color_palette: [...colorPalette, newColor] });
      setNewColor('#');
    }
  };

  const removeColor = (index: number) => {
    const updated = colorPalette.filter((_, i) => i !== index);
    onChange({ ...content, color_palette: updated });
  };

  const handleUpload = async (file: File): Promise<string> => {
    return URL.createObjectURL(file);
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="attire-desc" className="block text-sm font-medium text-gray-700">
          Deskripsi Dress Code
        </label>
        <textarea
          id="attire-desc"
          value={description}
          onChange={(e) => onChange({ ...content, description: e.target.value })}
          placeholder="Contoh: Kami mengundang para tamu untuk mengenakan pakaian formal dengan nuansa warna pastel..."
          rows={3}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <MediaUpload
        mediaType="image"
        currentUrl={outfitImage}
        onUpload={async (file) => {
          const url = await handleUpload(file);
          onChange({ ...content, outfit_image: url });
          return url;
        }}
        onRemove={() => onChange({ ...content, outfit_image: '' })}
        label="Referensi Outfit (opsional)"
      />

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Color Palette
        </label>
        <div className="flex flex-wrap gap-2 mb-2">
          {colorPalette.map((color, index) => (
            <div key={index} className="flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-1">
              <div
                className="h-5 w-5 rounded-full border border-gray-200"
                style={{ backgroundColor: color }}
              />
              <span className="text-xs text-gray-600">{color}</span>
              <button
                type="button"
                onClick={() => removeColor(index)}
                className="ml-1 text-gray-400 hover:text-red-500"
                aria-label={`Hapus warna ${color}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            placeholder="#RRGGBB"
            className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <button
            type="button"
            onClick={addColor}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Tambah
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Tambahkan warna dalam format hex (#RRGGBB) untuk panduan dress code tamu.
        </p>
      </div>
    </div>
  );
}
