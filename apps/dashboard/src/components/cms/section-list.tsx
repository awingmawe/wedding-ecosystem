'use client';

import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import type { InvitationSection } from '@/lib/cms';
import { SECTION_TYPE_LABELS, SECTION_TYPE_ICONS } from '@/lib/cms';

interface SectionListProps {
  sections: InvitationSection[];
  onReorder: (sections: InvitationSection[]) => void;
  onToggleActive: (sectionId: string, isActive: boolean) => void;
}

export function SectionList({ sections, onReorder, onToggleActive }: SectionListProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragNodeRef = useRef<HTMLDivElement | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent<HTMLDivElement>, index: number) => {
    setDraggedIndex(index);
    dragNodeRef.current = e.currentTarget;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());

    // Add a slight delay to apply dragging styles
    setTimeout(() => {
      if (dragNodeRef.current) {
        dragNodeRef.current.style.opacity = '0.5';
      }
    }, 0);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (dragNodeRef.current) {
      dragNodeRef.current.style.opacity = '1';
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
    dragNodeRef.current = null;
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, dropIndex: number) => {
      e.preventDefault();

      if (draggedIndex === null || draggedIndex === dropIndex) {
        handleDragEnd();
        return;
      }

      const reordered = [...sections];
      const [removed] = reordered.splice(draggedIndex, 1);
      reordered.splice(dropIndex, 0, removed);

      onReorder(reordered);
      handleDragEnd();
    },
    [draggedIndex, sections, onReorder, handleDragEnd]
  );

  return (
    <div className="space-y-2" role="list" aria-label="Daftar section undangan">
      {sections.map((section, index) => (
        <div
          key={section.id}
          role="listitem"
          draggable
          onDragStart={(e) => handleDragStart(e, index)}
          onDragOver={(e) => handleDragOver(e, index)}
          onDragEnd={handleDragEnd}
          onDrop={(e) => handleDrop(e, index)}
          className={`flex items-center gap-3 rounded-xl border bg-white p-4 shadow-sm transition-all ${
            dragOverIndex === index && draggedIndex !== index
              ? 'border-primary bg-primary/5'
              : 'border-gray-200'
          } ${draggedIndex === index ? 'opacity-50' : ''} ${
            !section.is_active ? 'opacity-60' : ''
          }`}
        >
          {/* Drag handle */}
          <div
            className="flex cursor-grab items-center text-gray-400 hover:text-gray-600 active:cursor-grabbing"
            aria-label="Seret untuk mengubah urutan"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h16M4 16h16" />
            </svg>
          </div>

          {/* Sort order badge */}
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600">
            {section.sort_order}
          </span>

          {/* Section icon */}
          <span className="text-lg" aria-hidden="true">
            {SECTION_TYPE_ICONS[section.section_type]}
          </span>

          {/* Section info */}
          <div className="flex-1 min-w-0">
            <Link
              href={`/cms/edit/${section.id}`}
              className="text-sm font-medium text-gray-900 hover:text-primary transition-colors"
            >
              {SECTION_TYPE_LABELS[section.section_type]}
            </Link>
            <p className="text-xs text-gray-500 truncate">
              {section.is_active ? 'Aktif' : 'Nonaktif'} • Diperbarui{' '}
              {new Date(section.updated_at).toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </p>
          </div>

          {/* Toggle active */}
          <label className="relative inline-flex cursor-pointer items-center" aria-label={`${section.is_active ? 'Nonaktifkan' : 'Aktifkan'} section ${SECTION_TYPE_LABELS[section.section_type]}`}>
            <input
              type="checkbox"
              checked={section.is_active}
              onChange={(e) => onToggleActive(section.id, e.target.checked)}
              className="peer sr-only"
            />
            <div className="h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:ring-2 peer-focus:ring-primary/20" />
          </label>

          {/* Edit button */}
          <Link
            href={`/cms/edit/${section.id}`}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label={`Edit section ${SECTION_TYPE_LABELS[section.section_type]}`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </Link>
        </div>
      ))}
    </div>
  );
}
