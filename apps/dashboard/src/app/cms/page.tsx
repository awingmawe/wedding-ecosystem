'use client';

import { useState, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { SectionList } from '@/components/cms/section-list';
import type { InvitationSection } from '@/lib/cms';
import { SECTION_TYPE_LABELS, SECTION_TYPE_ICONS } from '@/lib/cms';
import Link from 'next/link';

// Mock data for initial development (will be replaced with API calls)
const MOCK_SECTIONS: InvitationSection[] = [
  { id: '1', event_id: 'evt-1', section_type: 'cover', sort_order: 1, is_active: true, content: { title: 'Wedding Invitation', subtitle: 'We are getting married', background_image: '', opening_text: 'Buka Undangan' }, updated_at: new Date().toISOString() },
  { id: '2', event_id: 'evt-1', section_type: 'bride_groom', sort_order: 2, is_active: true, content: {}, updated_at: new Date().toISOString() },
  { id: '3', event_id: 'evt-1', section_type: 'story', sort_order: 3, is_active: true, content: {}, updated_at: new Date().toISOString() },
  { id: '4', event_id: 'evt-1', section_type: 'verse', sort_order: 4, is_active: true, content: {}, updated_at: new Date().toISOString() },
  { id: '5', event_id: 'evt-1', section_type: 'countdown', sort_order: 5, is_active: true, content: {}, updated_at: new Date().toISOString() },
  { id: '6', event_id: 'evt-1', section_type: 'akad_resepsi', sort_order: 6, is_active: true, content: {}, updated_at: new Date().toISOString() },
  { id: '7', event_id: 'evt-1', section_type: 'rsvp', sort_order: 7, is_active: true, content: {}, updated_at: new Date().toISOString() },
  { id: '8', event_id: 'evt-1', section_type: 'attire', sort_order: 8, is_active: true, content: {}, updated_at: new Date().toISOString() },
  { id: '9', event_id: 'evt-1', section_type: 'gallery', sort_order: 9, is_active: true, content: {}, updated_at: new Date().toISOString() },
  { id: '10', event_id: 'evt-1', section_type: 'video', sort_order: 10, is_active: true, content: {}, updated_at: new Date().toISOString() },
  { id: '11', event_id: 'evt-1', section_type: 'gift', sort_order: 11, is_active: true, content: {}, updated_at: new Date().toISOString() },
  { id: '12', event_id: 'evt-1', section_type: 'messages', sort_order: 12, is_active: true, content: {}, updated_at: new Date().toISOString() },
  { id: '13', event_id: 'evt-1', section_type: 'closing', sort_order: 13, is_active: true, content: {}, updated_at: new Date().toISOString() },
  { id: '14', event_id: 'evt-1', section_type: 'music', sort_order: 14, is_active: false, content: {}, updated_at: new Date().toISOString() },
];

export default function CMSPage() {
  const [sections, setSections] = useState<InvitationSection[]>(MOCK_SECTIONS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReorder = useCallback((reorderedSections: InvitationSection[]) => {
    // Update sort_order based on new positions
    const updated = reorderedSections.map((section, index) => ({
      ...section,
      sort_order: index + 1,
    }));
    setSections(updated);

    // In production, call API to persist reorder
    // reorderSection(eventId, sectionId, newPosition)
  }, []);

  const handleToggleActive = useCallback(async (sectionId: string, isActive: boolean) => {
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, is_active: isActive } : s))
    );

    // In production, call API
    // await toggleSectionActive(eventId, sectionId, isActive)
  }, []);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-heading text-2xl font-bold">Editor Undangan</h1>
            <p className="mt-1 text-sm text-gray-600">
              Kelola konten dan urutan section undangan digital Anda
            </p>
          </div>
          <Link
            href="/cms/preview"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary/90"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Preview
          </Link>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        {/* Info */}
        <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-700">
          <strong>Tips:</strong> Seret section untuk mengubah urutan. Klik toggle untuk mengaktifkan/menonaktifkan section. Klik nama section untuk mengedit konten.
        </div>

        {/* Section List */}
        <SectionList
          sections={sections}
          onReorder={handleReorder}
          onToggleActive={handleToggleActive}
        />
      </div>
    </DashboardLayout>
  );
}
