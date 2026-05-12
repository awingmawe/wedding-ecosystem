'use client';

import { useState, useEffect, useCallback } from 'react';
import { SectionWrapper } from './section-wrapper';

interface CountdownContent {
  target_date?: string;
  calendar_link?: string;
}

interface CountdownSectionProps {
  content: CountdownContent;
  sortOrder: number;
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function calculateTimeLeft(targetDate: string): TimeLeft {
  const difference = new Date(targetDate).getTime() - Date.now();

  if (difference <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  return {
    days: Math.floor(difference / (1000 * 60 * 60 * 24)),
    hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((difference / (1000 * 60)) % 60),
    seconds: Math.floor((difference / 1000) % 60),
  };
}

/**
 * Generates an .ics calendar file content string.
 */
function generateIcsContent(targetDate: string): string {
  const date = new Date(targetDate);
  const formatDate = (d: Date) =>
    d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  const endDate = new Date(date.getTime() + 3 * 60 * 60 * 1000); // 3 hours duration

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Wedding Digital//Undangan//ID',
    'BEGIN:VEVENT',
    `DTSTART:${formatDate(date)}`,
    `DTEND:${formatDate(endDate)}`,
    'SUMMARY:Pernikahan',
    'DESCRIPTION:Undangan Pernikahan',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

function downloadIcs(targetDate: string) {
  const content = generateIcsContent(targetDate);
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'pernikahan.ics';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function TimeUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-[var(--color-primary)]/10">
        <span className="font-heading text-2xl font-bold text-[var(--color-primary)]">
          {String(value).padStart(2, '0')}
        </span>
      </div>
      <span className="mt-1 text-xs text-[var(--color-text)]/60">{label}</span>
    </div>
  );
}

export function CountdownSection({ content, sortOrder }: CountdownSectionProps) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!content.target_date) return;

    setTimeLeft(calculateTimeLeft(content.target_date));

    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft(content.target_date!));
    }, 1000);

    return () => clearInterval(timer);
  }, [content.target_date]);

  const handleAddToCalendar = useCallback(() => {
    if (content.calendar_link) {
      window.open(content.calendar_link, '_blank', 'noopener,noreferrer');
    } else if (content.target_date) {
      downloadIcs(content.target_date);
    }
  }, [content.calendar_link, content.target_date]);

  if (!content.target_date) return null;

  return (
    <SectionWrapper sectionType="countdown" sortOrder={sortOrder}>
      <h2 className="mb-8 text-center font-heading text-2xl font-bold text-[var(--color-primary)]">
        Hitung Mundur
      </h2>

      {mounted && (
        <div className="flex justify-center gap-3">
          <TimeUnit value={timeLeft.days} label="Hari" />
          <TimeUnit value={timeLeft.hours} label="Jam" />
          <TimeUnit value={timeLeft.minutes} label="Menit" />
          <TimeUnit value={timeLeft.seconds} label="Detik" />
        </div>
      )}

      <div className="mt-8 text-center">
        <button
          onClick={handleAddToCalendar}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--color-primary)] px-6 py-2.5 text-sm font-medium text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)] hover:text-white"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
            <line x1="16" x2="16" y1="2" y2="6" />
            <line x1="8" x2="8" y1="2" y2="6" />
            <line x1="3" x2="21" y1="10" y2="10" />
          </svg>
          Tambah ke Kalender
        </button>
      </div>
    </SectionWrapper>
  );
}
