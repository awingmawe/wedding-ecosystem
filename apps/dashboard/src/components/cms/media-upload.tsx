'use client';

import { useState, useRef, useCallback } from 'react';
import { validateMediaFile, type MediaValidationError } from '@/lib/cms';

interface MediaUploadProps {
  mediaType: 'image' | 'video';
  currentUrl?: string;
  onUpload: (file: File) => Promise<string>;
  onRemove?: () => void;
  label?: string;
}

export function MediaUpload({
  mediaType,
  currentUrl,
  onUpload,
  onRemove,
  label,
}: MediaUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const acceptFormats =
    mediaType === 'image'
      ? 'image/jpeg,image/png,image/webp'
      : 'video/mp4';

  const formatHint =
    mediaType === 'image'
      ? 'Format: JPEG, PNG, WebP. Maks 5MB.'
      : 'Format: MP4. Maks 50MB.';

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setError(null);

      // Validate file
      const validationError = validateMediaFile(file, mediaType);
      if (validationError) {
        setError(validationError.message);
        // Reset input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }

      // Show preview for images
      if (mediaType === 'image') {
        const reader = new FileReader();
        reader.onload = (ev) => {
          setPreview(ev.target?.result as string);
        };
        reader.readAsDataURL(file);
      }

      // Upload
      setUploading(true);
      try {
        const url = await onUpload(file);
        setPreview(url);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload gagal. Silakan coba lagi.');
        setPreview(currentUrl || null);
      } finally {
        setUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [mediaType, onUpload, currentUrl]
  );

  const handleRemove = useCallback(() => {
    setPreview(null);
    setError(null);
    onRemove?.();
  }, [onRemove]);

  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-sm font-medium text-gray-700">{label}</label>
      )}

      {/* Preview area */}
      {preview && (
        <div className="relative rounded-lg border border-gray-200 overflow-hidden">
          {mediaType === 'image' ? (
            <img
              src={preview}
              alt="Preview"
              className="h-48 w-full object-cover"
            />
          ) : (
            <video
              src={preview}
              className="h-48 w-full object-cover"
              controls
            />
          )}
          {onRemove && (
            <button
              type="button"
              onClick={handleRemove}
              className="absolute right-2 top-2 rounded-full bg-red-500 p-1.5 text-white shadow-md transition-colors hover:bg-red-600"
              aria-label="Hapus media"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Upload area */}
      {!preview && (
        <div
          className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors ${
            error ? 'border-red-300 bg-red-50' : 'border-gray-300 bg-gray-50 hover:border-primary hover:bg-primary/5'
          }`}
        >
          <svg className="mb-2 h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <p className="text-sm text-gray-600">
            {mediaType === 'image' ? 'Upload foto' : 'Upload video'}
          </p>
          <p className="mt-1 text-xs text-gray-500">{formatHint}</p>
        </div>
      )}

      {/* File input and button */}
      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptFormats}
          onChange={handleFileSelect}
          className="hidden"
          aria-label={`Pilih file ${mediaType === 'image' ? 'gambar' : 'video'}`}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Mengupload...
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {preview ? 'Ganti File' : 'Pilih File'}
            </>
          )}
        </button>
      </div>

      {/* Error message */}
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
