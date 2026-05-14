import Link from 'next/link';

/**
 * Custom 404 page for the invitation app (Next.js best practice).
 * Shown when a route doesn't match any page.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FDFCF9] px-4">
      <div className="text-center">
        <h1 className="font-heading text-5xl font-bold text-[#5F7161]">404</h1>
        <h2 className="mt-4 font-heading text-xl font-semibold text-gray-900">
          Undangan Tidak Ditemukan
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Link undangan yang Anda akses tidak valid atau sudah tidak tersedia.
        </p>
        <p className="mt-1 text-xs text-gray-400">
          Pastikan Anda menggunakan link yang benar dari pengirim undangan.
        </p>
      </div>
    </div>
  );
}
