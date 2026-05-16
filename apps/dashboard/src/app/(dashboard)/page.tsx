import { Suspense } from 'react';
import { DashboardStats } from './components/dashboard-stats';

export default function HomePage() {
  return (
    <div>
      <h1 className="font-heading text-2xl font-bold">Selamat Datang</h1>
      <p className="mt-2 text-gray-600">Kelola undangan pernikahan digital Anda dari sini.</p>

      {/* Stats cards with Suspense for async data loading */}
      <Suspense fallback={<StatsSkeletons />}>
        <DashboardStats />
      </Suspense>
    </div>
  );
}

function StatsSkeletons() {
  return (
    <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-xl bg-white p-5 shadow-sm">
          <div className="h-4 w-20 rounded bg-gray-200" />
          <div className="mt-3 h-7 w-10 rounded bg-gray-200" />
        </div>
      ))}
    </div>
  );
}
