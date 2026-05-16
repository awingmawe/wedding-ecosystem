/**
 * Loading state for the manual check-in page.
 */
export default function ManualCheckInLoading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-10 z-40 border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 animate-pulse rounded-lg bg-gray-200" />
          <div className="h-5 w-32 animate-pulse rounded bg-gray-200" />
        </div>
      </header>
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
          <p className="mt-3 text-sm text-gray-500">Memuat...</p>
        </div>
      </div>
    </div>
  );
}
