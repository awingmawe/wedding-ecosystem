'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { submitRsvp } from '@/lib/api';

const attendanceOptions = [
  { value: 'akad', label: 'Akad Nikah' },
  { value: 'resepsi', label: 'Resepsi' },
  { value: 'both', label: 'Keduanya' },
  { value: 'decline', label: 'Tidak Hadir' },
] as const;

type AttendanceValue = 'akad' | 'resepsi' | 'both' | 'decline';

function createRsvpSchema(plusOneCount: number) {
  return z
    .object({
      attendance: z.enum(['akad', 'resepsi', 'both', 'decline'], {
        required_error: 'Pilih kehadiran Anda',
      }),
      guest_count: z.coerce
        .number()
        .min(1, 'Minimal 1 tamu')
        .max(plusOneCount + 1, `Maksimal ${plusOneCount + 1} tamu`)
        .optional(),
    })
    .transform((data) => {
      if (data.attendance === 'decline') {
        return { ...data, guest_count: 0 };
      }
      return data;
    });
}

type RsvpFormValues = z.input<ReturnType<typeof createRsvpSchema>>;

interface RsvpFormProps {
  guestId: string;
  plusOneCount: number;
}

/**
 * RSVP form component for guests to confirm attendance.
 * Shows/hides guest_count based on attendance choice.
 * Validates guest_count against plus_one_count + 1.
 */
export function RsvpForm({ guestId, plusOneCount }: RsvpFormProps) {
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const schema = createRsvpSchema(plusOneCount);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RsvpFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      attendance: undefined,
      guest_count: 1,
    },
  });

  const attendance = watch('attendance') as AttendanceValue | undefined;
  const showGuestCount = attendance && attendance !== 'decline';

  async function onSubmit(data: RsvpFormValues) {
    setSubmitStatus('loading');
    setErrorMessage('');

    try {
      await submitRsvp({
        guest_id: guestId,
        attendance: data.attendance as AttendanceValue,
        guest_count: data.attendance === 'decline' ? 0 : (data.guest_count ?? 1),
      });
      setSubmitStatus('success');
    } catch (err) {
      setSubmitStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Gagal mengirim RSVP');
    }
  }

  if (submitStatus === 'success') {
    return (
      <div className="rounded-lg border border-[var(--color-accent)]/30 bg-[var(--color-background)] p-6 text-center">
        <div className="mb-3 text-3xl">✓</div>
        <h3 className="font-heading text-lg font-semibold text-[var(--color-primary)]">
          Terima Kasih!
        </h3>
        <p className="mt-2 text-sm text-[var(--color-text)]/70">
          Konfirmasi kehadiran Anda telah tersimpan.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Attendance options */}
      <fieldset>
        <legend className="mb-3 text-sm font-medium text-[var(--color-text)]">
          Konfirmasi Kehadiran
        </legend>
        <div className="grid grid-cols-2 gap-3">
          {attendanceOptions.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--color-text)]/10 px-3 py-2.5 text-sm transition-colors has-[:checked]:border-[var(--color-primary)] has-[:checked]:bg-[var(--color-primary)]/5"
            >
              <input
                type="radio"
                value={option.value}
                {...register('attendance')}
                className="accent-[var(--color-primary)]"
              />
              <span className="text-[var(--color-text)]">{option.label}</span>
            </label>
          ))}
        </div>
        {errors.attendance && (
          <p className="mt-2 text-xs text-red-600">{errors.attendance.message}</p>
        )}
      </fieldset>

      {/* Guest count - shown only when not declining */}
      {showGuestCount && (
        <div>
          <label
            htmlFor="guest_count"
            className="mb-1.5 block text-sm font-medium text-[var(--color-text)]"
          >
            Jumlah Tamu (termasuk Anda)
          </label>
          <input
            id="guest_count"
            type="number"
            min={1}
            max={plusOneCount + 1}
            {...register('guest_count')}
            className="w-full rounded-lg border border-[var(--color-text)]/10 bg-[var(--color-background)] px-4 py-2.5 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]"
          />
          {errors.guest_count && (
            <p className="mt-1.5 text-xs text-red-600">{errors.guest_count.message}</p>
          )}
          <p className="mt-1 text-xs text-[var(--color-text)]/50">
            Maksimal {plusOneCount + 1} tamu
          </p>
        </div>
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
        {submitStatus === 'loading' ? 'Mengirim...' : 'Kirim Konfirmasi'}
      </button>
    </form>
  );
}
