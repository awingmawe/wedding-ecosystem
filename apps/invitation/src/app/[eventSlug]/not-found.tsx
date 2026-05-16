/**
 * Not found page for the dynamic invitation route.
 * Triggered when notFound() is called from the page component.
 */
export default function InvitationNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FDFCF9] px-4">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
          <svg
            className="h-8 w-8 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
            />
          </svg>
        </div>
        <h2 className="font-heading text-xl font-bold text-gray-900">Undangan Tidak Ditemukan</h2>
        <p className="mt-2 text-sm text-gray-600">
          Undangan yang Anda cari tidak tersedia atau link sudah tidak aktif.
        </p>
        <p className="mt-4 text-xs text-gray-400">
          Silakan hubungi pengirim undangan untuk mendapatkan link yang benar.
        </p>
      </div>
    </div>
  );
}
