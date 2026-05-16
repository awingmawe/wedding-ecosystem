import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="text-center">
        <h1 className="font-heading text-6xl font-bold text-primary">404</h1>
        <h2 className="mt-4 font-heading text-xl font-semibold text-gray-900">
          Halaman Tidak Ditemukan
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Halaman yang Anda cari tidak tersedia atau telah dipindahkan.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Kembali ke Dashboard
        </Link>
      </div>
    </div>
  );
}
