'use client';

import { MediaUpload } from '../media-upload';

interface VideoFormProps {
  content: Record<string, unknown>;
  onChange: (content: Record<string, unknown>) => void;
}

export function VideoForm({ content, onChange }: VideoFormProps) {
  const videoUrl = (content.video_url as string) || '';
  const thumbnailUrl = (content.thumbnail_url as string) || '';
  const videoType = (content.type as string) || 'youtube';

  const handleUpload = async (file: File): Promise<string> => {
    return URL.createObjectURL(file);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Tipe Video</label>
        <div className="flex gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="video-type"
              value="youtube"
              checked={videoType === 'youtube'}
              onChange={() => onChange({ ...content, type: 'youtube' })}
              className="text-primary focus:ring-primary"
            />
            <span className="text-sm text-gray-700">YouTube</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="video-type"
              value="upload"
              checked={videoType === 'upload'}
              onChange={() => onChange({ ...content, type: 'upload' })}
              className="text-primary focus:ring-primary"
            />
            <span className="text-sm text-gray-700">Upload</span>
          </label>
        </div>
      </div>

      {videoType === 'youtube' ? (
        <div>
          <label htmlFor="video-url" className="block text-sm font-medium text-gray-700">
            URL YouTube
          </label>
          <input
            id="video-url"
            type="url"
            value={videoUrl}
            onChange={(e) => onChange({ ...content, video_url: e.target.value })}
            placeholder="https://www.youtube.com/watch?v=..."
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <p className="mt-1 text-xs text-gray-500">
            Paste link YouTube video prewedding atau cinematic Anda.
          </p>
        </div>
      ) : (
        <MediaUpload
          mediaType="video"
          currentUrl={videoUrl}
          onUpload={async (file) => {
            const url = await handleUpload(file);
            onChange({ ...content, video_url: url });
            return url;
          }}
          onRemove={() => onChange({ ...content, video_url: '' })}
          label="Upload Video"
        />
      )}

      <MediaUpload
        mediaType="image"
        currentUrl={thumbnailUrl}
        onUpload={async (file) => {
          const url = await handleUpload(file);
          onChange({ ...content, thumbnail_url: url });
          return url;
        }}
        onRemove={() => onChange({ ...content, thumbnail_url: '' })}
        label="Thumbnail (opsional)"
      />
    </div>
  );
}
