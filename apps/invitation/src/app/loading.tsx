/**
 * File-based loading state (Next.js best practice).
 * Automatically shown as Suspense fallback during page transitions.
 * Mobile-first design matching the invitation aesthetic.
 */
export default function InvitationLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FDFCF9]">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#5F7161] border-t-transparent" />
        <p className="mt-4 font-body text-sm text-gray-500">Memuat undangan...</p>
      </div>
    </div>
  );
}
