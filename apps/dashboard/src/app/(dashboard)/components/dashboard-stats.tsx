import { apiFetch } from '@/lib/api';

interface EventStats {
  total_guests: number;
  total_rsvp: number;
  total_checked_in: number;
  total_go_show: number;
}

async function getStats(): Promise<EventStats> {
  try {
    const stats = await apiFetch<EventStats>('/events/current/stats');
    return stats;
  } catch {
    // Return defaults if API is not available yet
    return {
      total_guests: 0,
      total_rsvp: 0,
      total_checked_in: 0,
      total_go_show: 0,
    };
  }
}

export async function DashboardStats() {
  const stats = await getStats();

  return (
    <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Total Tamu" value={stats.total_guests} />
      <StatCard label="RSVP Masuk" value={stats.total_rsvp} />
      <StatCard label="Check-in" value={stats.total_checked_in} />
      <StatCard label="Go-Show" value={stats.total_go_show} />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-primary">{value}</p>
    </div>
  );
}
