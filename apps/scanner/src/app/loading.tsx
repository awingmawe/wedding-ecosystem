/**
 * File-based loading state for the scanner PWA (Next.js best practice).
 * Automatically shown as Suspense fallback during page transitions.
 */
export default function ScannerLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
        <p className="mt-4 text-sm text-gray-500">Memuat scanner...</p>
      </div>
    </div>
  );
}
