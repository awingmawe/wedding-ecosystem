/**
 * Error page displayed when event-slug or guest-slug is invalid.
 * Shows a user-friendly message in Bahasa Indonesia.
 */
export function InvitationError({
  type,
}: {
  type: 'event-not-found' | 'guest-not-found' | 'generic';
}) {
  const messages = {
    'event-not-found': {
      title: 'Undangan Tidak Ditemukan',
      description: 'Maaf, undangan yang Anda cari tidak tersedia atau sudah tidak aktif.',
    },
    'guest-not-found': {
      title: 'Tamu Tidak Ditemukan',
      description: 'Maaf, nama tamu tidak ditemukan dalam daftar undangan ini.',
    },
    generic: {
      title: 'Terjadi Kesalahan',
      description: 'Maaf, terjadi kesalahan saat memuat undangan. Silakan coba lagi nanti.',
    },
  };

  const { title, description } = messages[type];

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-background)] px-6 text-center">
      <div className="max-w-md">
        {/* Icon */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-primary)]/10">
          <svg
            className="h-8 w-8 text-[var(--color-primary)]"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
            />
          </svg>
        </div>

        <h1 className="font-heading text-2xl font-bold text-[var(--color-text)]">
          {title}
        </h1>
        <p className="mt-3 text-base text-[var(--color-text)]/70">
          {description}
        </p>
        <p className="mt-6 text-sm text-[var(--color-text)]/50">
          Pastikan link undangan yang Anda terima sudah benar.
        </p>
      </div>
    </main>
  );
}
