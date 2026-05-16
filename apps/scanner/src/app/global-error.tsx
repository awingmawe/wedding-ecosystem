'use client';

/**
 * Global error boundary - catches errors in the root layout.
 * Must include <html> and <body> tags since it replaces the root layout.
 * Critical for PWA: ensures the app can recover from fatal errors.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="id">
      <body className="font-body antialiased">
        <div className="flex min-h-screen flex-col items-center justify-center px-4">
          <div className="text-center">
            <h1 className="text-lg font-bold text-gray-900">Terjadi Kesalahan Sistem</h1>
            <p className="mt-2 text-sm text-gray-600">
              Aplikasi scanner mengalami masalah. Silakan muat ulang.
            </p>
            <button
              onClick={reset}
              className="mt-6 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
            >
              Muat Ulang
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
