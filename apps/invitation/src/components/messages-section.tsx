'use client';

import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { fetchMessages, submitMessage, type MessageData } from '@/lib/api';

const messageSchema = z.object({
  sender_name: z
    .string()
    .min(1, 'Nama tidak boleh kosong')
    .max(100, 'Nama maksimal 100 karakter'),
  message_text: z
    .string()
    .min(1, 'Ucapan tidak boleh kosong')
    .max(500, 'Ucapan maksimal 500 karakter'),
});

type MessageFormValues = z.infer<typeof messageSchema>;

interface MessagesSectionProps {
  eventId: string;
}

/**
 * Messages section with form to submit wishes and paginated list of messages.
 * Displays newest messages first, 20 per page.
 */
export function MessagesSection({ eventId }: MessagesSectionProps) {
  return (
    <div className="space-y-8">
      <MessageForm eventId={eventId} />
      <MessagesList eventId={eventId} />
    </div>
  );
}

// --- Message Form ---

function MessageForm({ eventId }: { eventId: string }) {
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<MessageFormValues>({
    resolver: zodResolver(messageSchema),
    defaultValues: {
      sender_name: '',
      message_text: '',
    },
  });

  const messageText = watch('message_text') || '';

  async function onSubmit(data: MessageFormValues) {
    setSubmitStatus('loading');
    setErrorMessage('');

    try {
      await submitMessage({
        event_id: eventId,
        sender_name: data.sender_name,
        message_text: data.message_text,
      });
      setSubmitStatus('success');
      reset();
      // Reset status after a short delay so user can submit again
      setTimeout(() => setSubmitStatus('idle'), 3000);
    } catch (err) {
      setSubmitStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Gagal mengirim ucapan');
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Sender name */}
      <div>
        <label
          htmlFor="sender_name"
          className="mb-1.5 block text-sm font-medium text-[var(--color-text)]"
        >
          Nama Anda
        </label>
        <input
          id="sender_name"
          type="text"
          maxLength={100}
          placeholder="Masukkan nama Anda"
          {...register('sender_name')}
          className="w-full rounded-lg border border-[var(--color-text)]/10 bg-[var(--color-background)] px-4 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text)]/40 outline-none transition-colors focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]"
        />
        {errors.sender_name && (
          <p className="mt-1 text-xs text-red-600">{errors.sender_name.message}</p>
        )}
      </div>

      {/* Message text */}
      <div>
        <label
          htmlFor="message_text"
          className="mb-1.5 block text-sm font-medium text-[var(--color-text)]"
        >
          Ucapan & Doa
        </label>
        <textarea
          id="message_text"
          rows={4}
          maxLength={500}
          placeholder="Tulis ucapan dan doa untuk kedua mempelai..."
          {...register('message_text')}
          className="w-full resize-none rounded-lg border border-[var(--color-text)]/10 bg-[var(--color-background)] px-4 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text)]/40 outline-none transition-colors focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]"
        />
        <div className="mt-1 flex items-center justify-between">
          {errors.message_text ? (
            <p className="text-xs text-red-600">{errors.message_text.message}</p>
          ) : (
            <span />
          )}
          <span className="text-xs text-[var(--color-text)]/50">
            {messageText.length}/500
          </span>
        </div>
      </div>

      {/* Success message */}
      {submitStatus === 'success' && (
        <p className="text-sm text-green-600">Ucapan berhasil dikirim!</p>
      )}

      {/* Error message */}
      {submitStatus === 'error' && (
        <p className="text-sm text-red-600">{errorMessage}</p>
      )}

      {/* Submit button */}
      <button
        type="submit"
        disabled={submitStatus === 'loading'}
        className="w-full rounded-full bg-[var(--color-primary)] px-6 py-3 text-sm font-medium text-white shadow-md transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
      >
        {submitStatus === 'loading' ? 'Mengirim...' : 'Kirim Ucapan'}
      </button>
    </form>
  );
}

// --- Messages List ---

function MessagesList({ eventId }: { eventId: string }) {
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadMessages = useCallback(async (pageNum: number) => {
    setIsLoading(true);
    setError('');

    try {
      const data = await fetchMessages(eventId, pageNum, 20);
      setMessages(data.messages);
      setTotalPages(data.total_pages);
      setPage(pageNum);
    } catch {
      setError('Gagal memuat ucapan');
    } finally {
      setIsLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    loadMessages(1);
  }, [loadMessages]);

  if (isLoading && messages.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-[var(--color-text)]/50">
        Memuat ucapan...
      </div>
    );
  }

  if (error && messages.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-red-600">
        {error}
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-[var(--color-text)]/50">
        Belum ada ucapan. Jadilah yang pertama!
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-[var(--color-text)]/70">
        Ucapan dari Tamu
      </h4>

      {/* Messages list */}
      <div className="space-y-3">
        {messages.map((msg) => (
          <MessageCard key={msg.id} message={msg} />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-4">
          <button
            onClick={() => loadMessages(page - 1)}
            disabled={page <= 1 || isLoading}
            className="rounded-lg border border-[var(--color-text)]/10 px-4 py-2 text-xs font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-primary)]/5 disabled:opacity-30"
          >
            Sebelumnya
          </button>
          <span className="text-xs text-[var(--color-text)]/60">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => loadMessages(page + 1)}
            disabled={page >= totalPages || isLoading}
            className="rounded-lg border border-[var(--color-text)]/10 px-4 py-2 text-xs font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-primary)]/5 disabled:opacity-30"
          >
            Selanjutnya
          </button>
        </div>
      )}
    </div>
  );
}

// --- Message Card ---

function MessageCard({ message }: { message: MessageData }) {
  const formattedDate = new Date(message.created_at).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="rounded-lg border border-[var(--color-text)]/5 bg-[var(--color-background)] p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-[var(--color-primary)]">
          {message.sender_name}
        </p>
        <time className="shrink-0 text-[10px] text-[var(--color-text)]/40">
          {formattedDate}
        </time>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-text)]/80">
        {message.message_text}
      </p>
    </div>
  );
}
