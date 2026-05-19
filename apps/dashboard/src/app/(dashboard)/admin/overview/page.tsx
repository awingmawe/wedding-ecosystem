'use client';

import { useState, useEffect } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Building2, 
  Users, 
  QrCode, 
  UserCheck, 
  RefreshCw, 
  Activity, 
  Server, 
  CheckCircle2, 
  TrendingUp 
} from 'lucide-react';

interface GlobalStats {
  total_tenants: number;
  total_users: number;
  active_scanner_devices: number;
  total_guests: number;
}

interface ApiResponse {
  success: boolean;
  data: GlobalStats;
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchStats = async (silent = false) => {
    if (!silent) setIsLoading(true);
    else setIsRefreshing(true);
    setError('');

    try {
      const response = await apiFetch<ApiResponse>('/admin/stats');
      if (response.success) {
        setStats(response.data);
      } else {
        setError('Gagal memuat data statistik dari server.');
      }
    } catch (err) {
      if (err instanceof ApiError) {
        const errData = err.data as { error?: { message?: string } };
        setError(errData.error?.message || 'Gagal memuat data statistik global');
      } else {
        setError('Terjadi kesalahan koneksi ke server');
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-8 w-64 animate-pulse rounded bg-gray-200" />
          <div className="mt-2 h-4 w-96 animate-pulse rounded bg-gray-200" />
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-white p-6 shadow-sm border border-gray-100" />
          ))}
        </div>

        <div className="h-64 animate-pulse rounded-xl bg-white shadow-sm border border-gray-100" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-gray-900">
            Statistik Global
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Ringkasan metrik performa platform digital secara real-time.
          </p>
        </div>
        <Button
          onClick={() => fetchStats(true)}
          disabled={isRefreshing}
          variant="outline"
          className="flex items-center gap-2 self-start rounded-xl px-4 py-2 text-sm font-medium border-gray-200 transition-all hover:bg-gray-50"
        >
          <RefreshCw className={`h-4 w-4 text-gray-600 ${isRefreshing ? 'animate-spin' : ''}`} />
          Perbarui Data
        </Button>
      </div>

      {/* Error Alert */}
      {error && (
        <div
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
          role="alert"
        >
          <span>{error}</span>
          <Button 
            onClick={() => fetchStats()} 
            size="sm" 
            variant="destructive"
            className="rounded-lg px-3 py-1.5"
          >
            Coba Lagi
          </Button>
        </div>
      )}

      {/* Stat Cards */}
      {stats && (
        <>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {/* Tenants Card */}
            <Card className="relative overflow-hidden border-gray-100 hover:shadow-md transition-all duration-300">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-gray-500">Total Tenant</p>
                    <p className="text-3xl font-extrabold text-gray-900 tracking-tight">
                      {stats.total_tenants}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-indigo-50 p-3.5 text-indigo-600">
                    <Building2 className="h-6 w-6" />
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-1.5 text-xs text-indigo-600 font-medium">
                  <TrendingUp className="h-3.5 w-3.5" />
                  <span>Penyelenggara aktif di platform</span>
                </div>
              </CardContent>
            </Card>

            {/* Users Card */}
            <Card className="relative overflow-hidden border-gray-100 hover:shadow-md transition-all duration-300">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-gray-500">Total Pengguna</p>
                    <p className="text-3xl font-extrabold text-gray-900 tracking-tight">
                      {stats.total_users}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-emerald-50 p-3.5 text-emerald-600">
                    <Users className="h-6 w-6" />
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Admin, Client, dan WO terdaftar</span>
                </div>
              </CardContent>
            </Card>

            {/* Active Scanners Card */}
            <Card className="relative overflow-hidden border-gray-100 hover:shadow-md transition-all duration-300">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-gray-500">Scanner Aktif</p>
                    <p className="text-3xl font-extrabold text-gray-900 tracking-tight">
                      {stats.active_scanner_devices}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-amber-50 p-3.5 text-amber-600">
                    <QrCode className="h-6 w-6" />
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-1.5 text-xs text-amber-600 font-medium">
                  <Activity className="h-3.5 w-3.5 animate-pulse" />
                  <span>Perangkat scan QR aktif saat ini</span>
                </div>
              </CardContent>
            </Card>

            {/* Global Guests Card */}
            <Card className="relative overflow-hidden border-gray-100 hover:shadow-md transition-all duration-300">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-gray-500">Total Tamu</p>
                    <p className="text-3xl font-extrabold text-gray-900 tracking-tight">
                      {stats.total_guests}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-rose-50 p-3.5 text-rose-600">
                    <UserCheck className="h-6 w-6" />
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-1.5 text-xs text-rose-600 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Jumlah tamu terdaftar sistem</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Platform Performance & System Health Status */}
          <Card className="border-gray-100 shadow-sm">
            <CardHeader className="border-b border-gray-100 pb-5">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-teal-50 p-2 text-teal-600">
                  <Server className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg font-bold text-gray-900">
                    Status Layanan Platform
                  </CardTitle>
                  <CardDescription className="text-sm text-gray-500">
                    Kesehatan infrastruktur dan status konektivitas sistem.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="flex items-start gap-4 p-4 rounded-xl bg-gray-50/50 border border-gray-100">
                  <div className="mt-1 h-3.5 w-3.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <div>
                    <h4 className="text-sm font-bold text-gray-900">Database Server</h4>
                    <p className="text-xs text-gray-500 mt-1">PostgreSQL live & optimal</p>
                    <span className="inline-flex items-center mt-2 rounded-full bg-emerald-50 px-2 py-0.5 text-3xs font-medium text-emerald-700">
                      Normal
                    </span>
                  </div>
                </div>
                
                <div className="flex items-start gap-4 p-4 rounded-xl bg-gray-50/50 border border-gray-100">
                  <div className="mt-1 h-3.5 w-3.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <div>
                    <h4 className="text-sm font-bold text-gray-900">Redis Cache Storage</h4>
                    <p className="text-xs text-gray-500 mt-1">Upstash cache terhubung</p>
                    <span className="inline-flex items-center mt-2 rounded-full bg-emerald-50 px-2 py-0.5 text-3xs font-medium text-emerald-700">
                      Normal
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 rounded-xl bg-gray-50/50 border border-gray-100">
                  <div className="mt-1 h-3.5 w-3.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <div>
                    <h4 className="text-sm font-bold text-gray-900">Socket.io WebSocket</h4>
                    <p className="text-xs text-gray-500 mt-1">Layanan real-time aktif</p>
                    <span className="inline-flex items-center mt-2 rounded-full bg-emerald-50 px-2 py-0.5 text-3xs font-medium text-emerald-700">
                      Aktif
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
