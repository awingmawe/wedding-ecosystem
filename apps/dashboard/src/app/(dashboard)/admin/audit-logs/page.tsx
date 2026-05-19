'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  History,
  Search,
  RefreshCw,
  Calendar,
  Building,
  User,
  Cpu,
  Info,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';

interface AuditLogRecord {
  id: string;
  timestamp: string;
  user_id: string | null;
  user_email: string | null;
  user_name: string | null;
  tenant_id: string | null;
  tenant_name: string | null;
  action: string;
  request_id: string;
  metadata: any;
}

interface TenantItem {
  id: string;
  name: string;
}

interface UserItem {
  id: string;
  name: string;
  email: string;
}

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    per_page: 10,
    total: 0,
    total_pages: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [tenantFilter, setTenantFilter] = useState<string>('ALL');
  const [userFilter, setUserFilter] = useState<string>('ALL');

  // Dialog State
  const [selectedLog, setSelectedLog] = useState<AuditLogRecord | null>(null);

  // Fetch filters helper data
  const fetchFilterHelpers = async () => {
    try {
      const [tenantsRes, usersRes] = await Promise.all([
        apiFetch<{ data: TenantItem[] }>('/admin/tenants?per_page=100'),
        apiFetch<{ data: UserItem[] }>('/admin/users?per_page=100')
      ]);
      setTenants(tenantsRes.data);
      setUsers(usersRes.data);
    } catch {
      // Non-blocking helper fail
    }
  };

  const fetchLogs = useCallback(
    async (page = 1, silent = false) => {
      if (!silent) setIsLoading(true);
      else setIsRefreshing(true);
      setError('');

      try {
        const params = new URLSearchParams({
          page: page.toString(),
          per_page: '10',
        });

        if (searchTerm) params.set('search', searchTerm);
        if (actionFilter !== 'ALL') params.set('action', actionFilter);
        if (tenantFilter !== 'ALL') params.set('tenant_id', tenantFilter);
        if (userFilter !== 'ALL') params.set('user_id', userFilter);

        const response = await apiFetch<{
          success: boolean;
          data: AuditLogRecord[];
          pagination: typeof pagination;
        }>(`/admin/audit-logs?${params.toString()}`);

        setLogs(response.data);
        setPagination(response.pagination);
      } catch (err) {
        if (err instanceof ApiError) {
          const errData = err.data as { error?: { message?: string } };
          setError(errData.error?.message || 'Gagal memuat log audit aktivitas');
        } else {
          setError('Terjadi kesalahan koneksi ke server');
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [searchTerm, actionFilter, tenantFilter, userFilter]
  );

  useEffect(() => {
    fetchFilterHelpers();
  }, []);

  useEffect(() => {
    fetchLogs(1);
  }, [fetchLogs]);

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }) + ' WIB';
    } catch {
      return dateStr;
    }
  };

  const getActionBadgeColor = (action: string) => {
    switch (action) {
      case 'login':
        return 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30';
      case 'logout':
        return 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30';
      case 'data_export':
        return 'bg-sky-50 text-sky-700 border-sky-100 dark:bg-sky-950/20 dark:text-sky-400 dark:border-sky-900/30';
      case 'bulk_operation':
        return 'bg-indigo-50 text-indigo-700 border-indigo-100 dark:bg-indigo-950/20 dark:text-indigo-400 dark:border-indigo-900/30';
      case 'tenant_config_change':
        return 'bg-purple-50 text-purple-700 border-purple-100 dark:bg-purple-950/20 dark:text-purple-400 dark:border-purple-900/30';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-100 dark:bg-gray-800/40 dark:text-gray-400 dark:border-gray-700/50';
    }
  };

  const getActionNameInIndonesian = (action: string) => {
    switch (action) {
      case 'login':
        return 'Masuk Log';
      case 'logout':
        return 'Keluar Log';
      case 'data_export':
        return 'Ekspor Data';
      case 'bulk_operation':
        return 'Operasi Massal';
      case 'tenant_config_change':
        return 'Perubahan Konfig Tenant';
      default:
        return action;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
            <History className="h-8 w-8 text-primary" />
            Log Aktivitas & Audit
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Pantau seluruh aktivitas operasional sensitif, transaksi penting, dan audit keamanan sistem global.
          </p>
        </div>
        <Button
          onClick={() => fetchLogs(pagination.page, true)}
          disabled={isRefreshing}
          variant="outline"
          className="flex items-center gap-2 border-gray-200 self-start"
        >
          <RefreshCw className={`h-4 w-4 text-gray-600 ${isRefreshing ? 'animate-spin' : ''}`} />
          Perbarui
        </Button>
      </div>

      {/* Advanced Filter Panel */}
      <Card className="border-gray-100 shadow-sm bg-white">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            Panel Filter Lanjutan
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search Term */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Cari Aksi atau Request ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 rounded-lg border-gray-200 focus-visible:ring-primary/20"
              />
            </div>

            {/* Action Filter */}
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="rounded-lg border-gray-200">
                <SelectValue placeholder="Pilih Aksi" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Aksi</SelectItem>
                <SelectItem value="login">Masuk Log (Login)</SelectItem>
                <SelectItem value="logout">Keluar Log (Logout)</SelectItem>
                <SelectItem value="data_export">Ekspor Data</SelectItem>
                <SelectItem value="bulk_operation">Operasi Massal</SelectItem>
                <SelectItem value="tenant_config_change">Ubah Konfig Tenant</SelectItem>
              </SelectContent>
            </Select>

            {/* Tenant Filter */}
            <Select value={tenantFilter} onValueChange={setTenantFilter}>
              <SelectTrigger className="rounded-lg border-gray-200">
                <SelectValue placeholder="Pilih Tenant" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Tenant</SelectItem>
                {tenants.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* User Filter */}
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger className="rounded-lg border-gray-200">
                <SelectValue placeholder="Pilih Pengguna" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Pengguna</SelectItem>
                {users.map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.name} ({u.email})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Main Table */}
      <Card className="border-gray-100 shadow-sm overflow-hidden bg-white">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
              <span className="text-sm text-gray-500 font-medium">Memuat log aktivitas...</span>
            </div>
          </div>
        ) : error ? (
          <div className="flex h-64 items-center justify-center text-red-500 font-medium">
            {error}
          </div>
        ) : logs.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2">
            <History className="h-10 w-10 text-gray-300" />
            <span className="text-sm text-gray-500 font-medium">Tidak ada log aktivitas yang cocok</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-gray-50/75">
                <TableRow>
                  <TableHead className="w-[200px]">Waktu</TableHead>
                  <TableHead className="w-[150px]">Aksi</TableHead>
                  <TableHead>Pengguna / Operator</TableHead>
                  <TableHead>Nama Tenant</TableHead>
                  <TableHead className="w-[120px] text-right">Aksi Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id} className="hover:bg-gray-50/50 transition-colors">
                    <TableCell className="font-medium text-gray-600 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-gray-400 shrink-0" />
                        {formatDate(log.timestamp)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={`border uppercase px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide ${getActionBadgeColor(log.action)}`} variant="outline">
                        {getActionNameInIndonesian(log.action)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {log.user_id ? (
                        <div className="flex flex-col">
                          <span className="font-semibold text-gray-800 text-sm flex items-center gap-1">
                            <User className="h-3 w-3 text-gray-400" />
                            {log.user_name || 'Tanpa Nama'}
                          </span>
                          <span className="text-xs text-gray-400">{log.user_email}</span>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-sm italic">Anonim / Sistem</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {log.tenant_id ? (
                        <span className="text-gray-700 text-sm font-medium flex items-center gap-1">
                          <Building className="h-3.5 w-3.5 text-gray-400" />
                          {log.tenant_name || 'Tenant Tidak Diketahui'}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs italic">Akses Tingkat Global</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedLog(log)}
                        className="text-primary hover:text-primary-hover hover:bg-primary/5 rounded-lg h-8 px-2.5"
                      >
                        <Info className="h-4 w-4 shrink-0" />
                        <span className="sr-only">Detail</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination Section */}
        {!isLoading && !error && logs.length > 0 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-4 bg-white">
            <div className="text-xs text-gray-500 font-medium">
              Menampilkan {(pagination.page - 1) * pagination.per_page + 1} - {Math.min(pagination.page * pagination.per_page, pagination.total)} dari {pagination.total} log
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchLogs(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="h-8 rounded-lg border-gray-200"
              >
                <ChevronLeft className="h-4 w-4" />
                Sebelumnya
              </Button>
              <div className="text-xs font-semibold text-gray-700 px-2">
                Halaman {pagination.page} / {pagination.total_pages}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchLogs(pagination.page + 1)}
                disabled={pagination.page >= pagination.total_pages}
                className="h-8 rounded-lg border-gray-200"
              >
                Selanjutnya
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* JSON Metadata Detail Dialog */}
      <Dialog open={selectedLog !== null} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-2xl bg-white rounded-xl shadow-xl border border-gray-100">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl font-bold text-gray-900 flex items-center gap-2">
              <Cpu className="h-5 w-5 text-primary" />
              Detail Log Aktivitas & Payload Metadata
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-400">
              Berikut detail lengkap data operasional audit log beserta metadata payload yang tersimpan.
            </DialogDescription>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-4 my-2">
              <div className="grid grid-cols-2 gap-4 text-xs bg-gray-50 p-3 rounded-lg border border-gray-100">
                <div>
                  <span className="font-medium text-gray-400 block mb-0.5">WAKTU EKSEKUSI</span>
                  <span className="font-semibold text-gray-700">{formatDate(selectedLog.timestamp)}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-400 block mb-0.5">JENIS AKSI</span>
                  <Badge className={`border uppercase text-[9px] font-bold ${getActionBadgeColor(selectedLog.action)}`} variant="outline">
                    {getActionNameInIndonesian(selectedLog.action)}
                  </Badge>
                </div>
                <div>
                  <span className="font-medium text-gray-400 block mb-0.5">OPERATOR ID</span>
                  <span className="font-semibold text-gray-700 font-mono text-[10px]">{selectedLog.user_id || 'SISTEM'}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-400 block mb-0.5">REQUEST ID</span>
                  <span className="font-semibold text-gray-700 font-mono text-[10px]">{selectedLog.request_id}</span>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block">Payload JSON Metadata</span>
                <div className="bg-slate-950 text-slate-100 p-4 rounded-lg overflow-auto max-h-64 font-mono text-xs shadow-inner">
                  {selectedLog.metadata ? (
                    <pre>{JSON.stringify(selectedLog.metadata, null, 2)}</pre>
                  ) : (
                    <span className="italic text-slate-500">Tidak ada metadata tambahan yang terasosiasi.</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
