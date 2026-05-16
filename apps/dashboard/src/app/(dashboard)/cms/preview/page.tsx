'use client';

import { useState } from 'react';
import { SECTION_TYPE_LABELS, SECTION_TYPE_ICONS } from '@/lib/cms';
import type { InvitationSection } from '@/lib/cms';
import Link from 'next/link';

// Mock active sections for preview (in production, fetch from API)
const MOCK_ACTIVE_SECTIONS: InvitationSection[] = [
  {
    id: '1',
    event_id: 'evt-1',
    section_type: 'cover',
    sort_order: 1,
    is_active: true,
    content: {
      title: 'The Wedding of',
      subtitle: 'Romeo & Juliet',
      background_image: '',
      opening_text: 'Buka Undangan',
    },
    updated_at: new Date().toISOString(),
  },
  {
    id: '2',
    event_id: 'evt-1',
    section_type: 'bride_groom',
    sort_order: 2,
    is_active: true,
    content: {
      bride: {
        name: 'Juliet Capulet',
        parent_info: 'Putri dari Bapak Capulet & Ibu Capulet',
        photo: '',
        instagram: '@juliet',
      },
      groom: {
        name: 'Romeo Montague',
        parent_info: 'Putra dari Bapak Montague & Ibu Montague',
        photo: '',
        instagram: '@romeo',
      },
    },
    updated_at: new Date().toISOString(),
  },
  {
    id: '3',
    event_id: 'evt-1',
    section_type: 'verse',
    sort_order: 3,
    is_active: true,
    content: {
      text: 'Dan di antara tanda-tanda kekuasaan-Nya ialah Dia menciptakan untukmu pasangan hidup dari jenismu sendiri, supaya kamu merasa tenteram kepadanya.',
      source: 'QS. Ar-Rum: 21',
    },
    updated_at: new Date().toISOString(),
  },
  {
    id: '4',
    event_id: 'evt-1',
    section_type: 'countdown',
    sort_order: 4,
    is_active: true,
    content: { target_date: '2026-01-12T08:00', calendar_link: '' },
    updated_at: new Date().toISOString(),
  },
  {
    id: '5',
    event_id: 'evt-1',
    section_type: 'akad_resepsi',
    sort_order: 5,
    is_active: true,
    content: {
      akad: { date: '2026-01-12', time_start: '08:00', time_end: '10:00' },
      resepsi: { date: '2026-01-12', time_start: '11:00', time_end: '14:00' },
      venue: 'Grand Ballroom Hotel',
      maps_url: 'https://maps.google.com',
    },
    updated_at: new Date().toISOString(),
  },
  {
    id: '6',
    event_id: 'evt-1',
    section_type: 'rsvp',
    sort_order: 6,
    is_active: true,
    content: { max_plus_one: 1 },
    updated_at: new Date().toISOString(),
  },
  {
    id: '7',
    event_id: 'evt-1',
    section_type: 'closing',
    sort_order: 7,
    is_active: true,
    content: {
      text: 'Merupakan suatu kehormatan bagi kami apabila Bapak/Ibu/Saudara/i berkenan hadir.',
      thank_you_message: 'Terima kasih atas doa dan restu yang diberikan.',
    },
    updated_at: new Date().toISOString(),
  },
];

function PreviewSection({ section }: { section: InvitationSection }) {
  const renderContent = () => {
    switch (section.section_type) {
      case 'cover': {
        const { title, subtitle, opening_text } = section.content as {
          title?: string;
          subtitle?: string;
          opening_text?: string;
        };
        return (
          <div className="flex flex-col items-center justify-center py-16 text-center bg-gradient-to-b from-primary/10 to-transparent">
            <p className="text-sm uppercase tracking-widest text-gray-500">
              {title || 'The Wedding of'}
            </p>
            <h2 className="mt-2 font-heading text-3xl font-bold text-gray-900">
              {subtitle || 'Nama Mempelai'}
            </h2>
            <p className="mt-1 text-sm text-gray-500">Kepada Yth. Nama Tamu</p>
            <button className="mt-6 rounded-full bg-primary px-6 py-2 text-sm font-medium text-white">
              {opening_text || 'Buka Undangan'}
            </button>
          </div>
        );
      }
      case 'bride_groom': {
        const { bride, groom } = section.content as {
          bride?: { name?: string; parent_info?: string };
          groom?: { name?: string; parent_info?: string };
        };
        return (
          <div className="grid grid-cols-2 gap-6 py-8 text-center">
            <div>
              <div className="mx-auto h-24 w-24 rounded-full bg-gray-200" />
              <p className="mt-3 font-heading text-lg font-semibold">
                {bride?.name || 'Mempelai Wanita'}
              </p>
              <p className="text-xs text-gray-500">{bride?.parent_info || 'Putri dari ...'}</p>
            </div>
            <div>
              <div className="mx-auto h-24 w-24 rounded-full bg-gray-200" />
              <p className="mt-3 font-heading text-lg font-semibold">
                {groom?.name || 'Mempelai Pria'}
              </p>
              <p className="text-xs text-gray-500">{groom?.parent_info || 'Putra dari ...'}</p>
            </div>
          </div>
        );
      }
      case 'verse': {
        const { text, source } = section.content as { text?: string; source?: string };
        return (
          <div className="py-8 text-center italic">
            <p className="text-sm text-gray-700 leading-relaxed">
              &ldquo;{text || 'Ayat atau doa...'}&rdquo;
            </p>
            <p className="mt-2 text-xs text-gray-500 not-italic">— {source || 'Sumber'}</p>
          </div>
        );
      }
      default: {
        return (
          <div className="py-8 text-center">
            <span className="text-2xl">{SECTION_TYPE_ICONS[section.section_type]}</span>
            <p className="mt-2 text-sm text-gray-500">
              {SECTION_TYPE_LABELS[section.section_type]}
            </p>
          </div>
        );
      }
    }
  };

  return <div className="border-b border-gray-100 last:border-b-0">{renderContent()}</div>;
}

export default function PreviewPage() {
  const [deviceView, setDeviceView] = useState<'mobile' | 'desktop'>('mobile');

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href="/cms"
            className="mb-2 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Kembali ke editor
          </Link>
          <h1 className="font-heading text-2xl font-bold">Preview Undangan</h1>
          <p className="mt-1 text-sm text-gray-600">
            Tampilan undangan sesuai konfigurasi section aktif
          </p>
        </div>

        {/* Device toggle */}
        <div className="flex rounded-lg border border-gray-200 bg-white p-1">
          <button
            onClick={() => setDeviceView('mobile')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              deviceView === 'mobile'
                ? 'bg-primary text-white'
                : 'text-gray-600 hover:text-gray-900'
            }`}
            aria-label="Tampilan mobile"
          >
            📱 Mobile
          </button>
          <button
            onClick={() => setDeviceView('desktop')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              deviceView === 'desktop'
                ? 'bg-primary text-white'
                : 'text-gray-600 hover:text-gray-900'
            }`}
            aria-label="Tampilan desktop"
          >
            🖥️ Desktop
          </button>
        </div>
      </div>

      {/* Preview frame */}
      <div className="flex justify-center">
        <div
          className={`overflow-hidden rounded-2xl border-2 border-gray-200 bg-white shadow-lg transition-all ${
            deviceView === 'mobile' ? 'w-[375px]' : 'w-full max-w-[768px]'
          }`}
        >
          {deviceView === 'mobile' && (
            <div className="flex items-center justify-center bg-gray-900 py-2">
              <div className="h-4 w-24 rounded-full bg-gray-800" />
            </div>
          )}
          <div className="max-h-[600px] overflow-y-auto">
            {MOCK_ACTIVE_SECTIONS.filter((s) => s.is_active).map((section) => (
              <PreviewSection key={section.id} section={section} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
