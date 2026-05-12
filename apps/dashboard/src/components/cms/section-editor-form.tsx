'use client';

import { useState } from 'react';
import type { SectionType } from '@/lib/cms';
import { CoverForm } from './forms/cover-form';
import { BrideGroomForm } from './forms/bride-groom-form';
import { StoryForm } from './forms/story-form';
import { VerseForm } from './forms/verse-form';
import { CountdownForm } from './forms/countdown-form';
import { AkadResepsiForm } from './forms/akad-resepsi-form';
import { RsvpForm } from './forms/rsvp-form';
import { AttireForm } from './forms/attire-form';
import { GalleryForm } from './forms/gallery-form';
import { VideoForm } from './forms/video-form';
import { GiftForm } from './forms/gift-form';
import { MessagesForm } from './forms/messages-form';
import { ClosingForm } from './forms/closing-form';
import { MusicForm } from './forms/music-form';

interface SectionEditorFormProps {
  sectionType: SectionType;
  content: Record<string, unknown>;
  onSave: (content: Record<string, unknown>) => Promise<void>;
  saving: boolean;
}

export function SectionEditorForm({ sectionType, content, onSave, saving }: SectionEditorFormProps) {
  const [formData, setFormData] = useState<Record<string, unknown>>(content);

  const handleChange = (newData: Record<string, unknown>) => {
    setFormData(newData);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(formData);
  };

  const renderForm = () => {
    const props = { content: formData, onChange: handleChange };

    switch (sectionType) {
      case 'cover':
        return <CoverForm {...props} />;
      case 'bride_groom':
        return <BrideGroomForm {...props} />;
      case 'story':
        return <StoryForm {...props} />;
      case 'verse':
        return <VerseForm {...props} />;
      case 'countdown':
        return <CountdownForm {...props} />;
      case 'akad_resepsi':
        return <AkadResepsiForm {...props} />;
      case 'rsvp':
        return <RsvpForm {...props} />;
      case 'attire':
        return <AttireForm {...props} />;
      case 'gallery':
        return <GalleryForm {...props} />;
      case 'video':
        return <VideoForm {...props} />;
      case 'gift':
        return <GiftForm {...props} />;
      case 'messages':
        return <MessagesForm {...props} />;
      case 'closing':
        return <ClosingForm {...props} />;
      case 'music':
        return <MusicForm {...props} />;
      default:
        return <p className="text-sm text-gray-500">Form editor belum tersedia untuk tipe section ini.</p>;
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {renderForm()}

      {/* Save button */}
      <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Menyimpan...
            </>
          ) : (
            'Simpan Perubahan'
          )}
        </button>
      </div>
    </form>
  );
}
