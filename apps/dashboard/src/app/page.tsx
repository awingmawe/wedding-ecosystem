'use client';

import { DashboardLayout } from '@/components/layout/dashboard-layout';

export default function Home() {
  return (
    <DashboardLayout>
      <div>
        <h1 className="font-heading text-2xl font-bold">Selamat Datang</h1>
        <p className="mt-2 text-gray-600">
          Kelola undangan pernikahan digital Anda dari sini.
        </p>

        {/* Placeholder stats cards */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Total Tamu</p>
            <p className="mt-1 text-2xl font-bold text-primary">0</p>
          </div>
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">RSVP Masuk</p>
            <p className="mt-1 text-2xl font-bold text-primary">0</p>
          </div>
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Check-in</p>
            <p className="mt-1 text-2xl font-bold text-primary">0</p>
          </div>
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Go-Show</p>
            <p className="mt-1 text-2xl font-bold text-primary">0</p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
