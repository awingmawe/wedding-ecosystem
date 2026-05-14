/**
 * Loading state for the dynamic invitation page.
 * Shown while the server fetches event and guest data.
 * Designed to feel like the invitation is "opening" — matches the cover aesthetic.
 */
export default function InvitationSlugLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#FDFCF9] px-4">
      <div className="text-center">
        {/* Animated envelope icon */}
        <div className="mx-auto mb-6 flex h-20 w-20 animate-pulse items-center justify-center rounded-full bg-[#5F7161]/10">
          <svg
            className="h-10 w-10 text-[#5F7161]"
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
        <p className="font-heading text-lg font-semibold text-gray-700">Membuka Undangan...</p>
        <p className="mt-2 text-sm text-gray-400">Mohon tunggu sebentar</p>
      </div>
    </div>
  );
}
