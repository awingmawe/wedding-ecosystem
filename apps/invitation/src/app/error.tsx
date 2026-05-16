'use client';

/**
 * Error boundary for the invitation app (Next.js best practice).
 * Must be a Client Component.
 * Shows a user-friendly error with retry option.
 */
export default function InvitationError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FDFCF9] px-4">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
          <svg
            className="h-8 w-8 text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
        </div>
        <h2 className="font-heading text-xl font-bold text-gray-900">Terjadi Kesalahan</h2>
        <p className="mt-2 text-sm text-gray-600">
          Undangan tidak dapat dimuat saat ini. Silakan coba lagi.
        </p>
        <button
          onClick={reset}
          className="mt-6 rounded-full bg-[#5F7161] px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Coba Lagi
        </button>
      </div>
    </div>
  );
}
