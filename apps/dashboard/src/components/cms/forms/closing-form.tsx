'use client';

import { MediaUpload } from '../media-upload';

interface ClosingFormProps {
  content: Record<string, unknown>;
  onChange: (content: Record<string, unknown>) => void;
}

export function ClosingForm({ content, onChange }: ClosingFormProps) {
  const text = (content.text as string) || '';
  const image = (content.image as string) || '';
  const thankYouMessage = (content.thank_you_message as string) || '';

  const handleUpload = async (file: File): Promise<string> => {
    return URL.createObjectURL(file);
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="closing-text" className="block text-sm font-medium text-gray-700">
          Teks Penutup
        </label>
        <textarea
          id="closing-text"
          value={text}
          onChange={(e) => onChange({ ...content, text: e.target.value })}
          placeholder="Contoh: Merupakan suatu kehormatan dan kebahagiaan bagi kami apabila Bapak/Ibu/Saudara/i berkenan hadir..."
          rows={3}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div>
        <label htmlFor="closing-thanks" className="block text-sm font-medium text-gray-700">
          Ucapan Terima Kasih
        </label>
        <textarea
          id="closing-thanks"
          value={thankYouMessage}
          onChange={(e) => onChange({ ...content, thank_you_message: e.target.value })}
          placeholder="Contoh: Terima kasih atas doa dan restu yang diberikan."
          rows={2}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <MediaUpload
        mediaType="image"
        currentUrl={image}
        onUpload={async (file) => {
          const url = await handleUpload(file);
          onChange({ ...content, image: url });
          return url;
        }}
        onRemove={() => onChange({ ...content, image: '' })}
        label="Foto Penutup (opsional)"
      />
    </div>
  );
}
