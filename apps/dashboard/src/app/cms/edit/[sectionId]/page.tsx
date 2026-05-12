'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { SectionEditorForm } from '@/components/cms/section-editor-form';
import { SECTION_TYPE_LABELS, SECTION_TYPE_ICONS } from '@/lib/cms';
import type { InvitationSection, SectionType } from '@/lib/cms';
import Link from 'next/link';

// Mock data - in production, fetch from API
const MOCK_SECTIONS: Record<string, InvitationSection> = {
  '1': { id: '1', event_id: 'evt-1', section_type: 'cover', sort_order: 1, is_active: true, content: { title: '', subtitle: '', background_image: '', opening_text: 'Buka Undangan' }, updated_at: new Date().toISOString() },
  '2': { id: '2', event_id: 'evt-1', section_type: 'bride_groom', sort_order: 2, is_active: true, content: { bride: { name: '', parent_info: '', photo: '', instagram: '' }, groom: { name: '', parent_info: '', photo: '', instagram: '' } }, updated_at: new Date().toISOString() },
  '3': { id: '3', event_id: 'evt-1', section_type: 'story', sort_order: 3, is_active: true, content: { chapters: [] }, updated_at: new Date().toISOString() },
  '4': { id: '4', event_id: 'evt-1', section_type: 'verse', sort_order: 4, is_active: true, content: { text: '', source: '', background_image: '' }, updated_at: new Date().toISOString() },
  '5': { id: '5', event_id: 'evt-1', section_type: 'countdown', sort_order: 5, is_active: true, content: { target_date: '', calendar_link: '' }, updated_at: new Date().toISOString() },
  '6': { id: '6', event_id: 'evt-1', section_type: 'akad_resepsi', sort_order: 6, is_active: true, content: { akad: { date: '', time_start: '', time_end: '' }, resepsi: { date: '', time_start: '', time_end: '' }, venue: '', maps_url: '' }, updated_at: new Date().toISOString() },
  '7': { id: '7', event_id: 'evt-1', section_type: 'rsvp', sort_order: 7, is_active: true, content: { options: ['akad', 'resepsi', 'both', 'decline'], max_plus_one: 1 }, updated_at: new Date().toISOString() },
  '8': { id: '8', event_id: 'evt-1', section_type: 'attire', sort_order: 8, is_active: true, content: { description: '', outfit_image: '', color_palette: [] }, updated_at: new Date().toISOString() },
  '9': { id: '9', event_id: 'evt-1', section_type: 'gallery', sort_order: 9, is_active: true, content: { photos: [] }, updated_at: new Date().toISOString() },
  '10': { id: '10', event_id: 'evt-1', section_type: 'video', sort_order: 10, is_active: true, content: { video_url: '', thumbnail_url: '', type: 'youtube' }, updated_at: new Date().toISOString() },
  '11': { id: '11', event_id: 'evt-1', section_type: 'gift', sort_order: 11, is_active: true, content: { accounts: [], description: '' }, updated_at: new Date().toISOString() },
  '12': { id: '12', event_id: 'evt-1', section_type: 'messages', sort_order: 12, is_active: true, content: { is_enabled: true, placeholder_text: 'Tulis ucapan untuk pengantin...' }, updated_at: new Date().toISOString() },
  '13': { id: '13', event_id: 'evt-1', section_type: 'closing', sort_order: 13, is_active: true, content: { text: '', image: '', thank_you_message: '' }, updated_at: new Date().toISOString() },
  '14': { id: '14', event_id: 'evt-1', section_type: 'music', sort_order: 14, is_active: false, content: { audio_url: '', autoplay: false, title: '' }, updated_at: new Date().toISOString() },
};

export default function SectionEditPage() {
  const params = useParams();
  const router = useRouter();
  const sectionId = params.sectionId as string;

  const [section, setSection] = useState<InvitationSection | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // In production, fetch from API
    const found = MOCK_SECTIONS[sectionId];
    if (found) {
      setSection(found);
    }
  }, [sectionId]);

  const handleSave = async (content: Record<string, unknown>) => {
    if (!section) return;

    setSaving(true);
    setError(null);
    setSaveSuccess(false);

    try {
      // In production: await updateSectionContent(section.event_id, section.id, content)
      setSection({ ...section, content, updated_at: new Date().toISOString() });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Gagal menyimpan perubahan. Data yang sudah diisi tetap tersimpan di form.'
      );
    } finally {
      setSaving(false);
    }
  };

  if (!section) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="mt-3 text-sm text-gray-500">Memuat section...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/cms"
            className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Kembali ke daftar section
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-2xl" aria-hidden="true">
              {SECTION_TYPE_ICONS[section.section_type]}
            </span>
            <div>
              <h1 className="font-heading text-2xl font-bold">
                {SECTION_TYPE_LABELS[section.section_type]}
              </h1>
              <p className="text-sm text-gray-500">
                Section #{section.sort_order} •{' '}
                {section.is_active ? (
                  <span className="text-green-600">Aktif</span>
                ) : (
                  <span className="text-gray-400">Nonaktif</span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Success message */}
        {saveSuccess && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700" role="status">
            ✓ Perubahan berhasil disimpan
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        {/* Section Editor Form */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <SectionEditorForm
            sectionType={section.section_type}
            content={section.content}
            onSave={handleSave}
            saving={saving}
          />
        </div>
      </div>
    </DashboardLayout>
  );
}
