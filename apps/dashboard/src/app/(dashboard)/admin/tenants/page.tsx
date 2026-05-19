'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { PlanType } from '@wedding/shared';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Building2, 
  Search, 
  Plus, 
  RefreshCw, 
  ShieldAlert, 
  Check, 
  X, 
  Calendar,
  Lock,
  Mail,
  User,
  KeyRound,
  Sparkles
} from 'lucide-react';
import { toast } from 'sonner';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan_type: PlanType;
  is_active: boolean;
  created_at: string;
}

interface PaginatedTenants {
  data: Tenant[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

export default function AdminTenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    per_page: 10,
    total: 0,
    total_pages: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filters
  const [planFilter, setPlanFilter] = useState<PlanType | 'ALL'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Dialog / Modal Add Tenant
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newTenant, setNewTenant] = useState({
    name: '',
    slug: '',
    plan_type: PlanType.BASIC,
    client_name: '',
    client_email: '',
    client_password: '',
  });

  const fetchTenants = useCallback(
    async (page = 1, silent = false) => {
      if (!silent) setIsLoading(true);
      else setIsRefreshing(true);
      setError('');

      try {
        const params = new URLSearchParams({
          page: page.toString(),
          per_page: '10',
        });

        if (planFilter !== 'ALL') {
          params.set('plan_type', planFilter);
        }

        const response = await apiFetch<{ success: boolean; data: Tenant[]; pagination: PaginatedTenants['pagination'] }>(
          `/admin/tenants?${params.toString()}`
        );

        setTenants(response.data);
        setPagination(response.pagination);
      } catch (err) {
        if (err instanceof ApiError) {
          const errData = err.data as { error?: { message?: string } };
          setError(errData.error?.message || 'Gagal memuat daftar tenant');
        } else {
          setError('Terjadi kesalahan koneksi ke server');
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [planFilter]
  );

  useEffect(() => {
    fetchTenants(1);
  }, [fetchTenants]);

  // Handle status toggle
  const handleToggleStatus = async (tenantId: string, currentStatus: boolean) => {
    try {
      const response = await apiFetch<{ success: boolean; data: Tenant }>(
        `/admin/tenants/${tenantId}/status`,
        {
          method: 'PATCH',
          body: { is_active: !currentStatus },
        }
      );

      if (response.success) {
        setTenants((prev) =>
          prev.map((t) => (t.id === tenantId ? { ...t, is_active: response.data.is_active } : t))
        );
        toast.success(`Status keaktifan tenant berhasil diperbarui`);
      }
    } catch (err) {
      toast.error('Gagal memperbarui status tenant');
    }
  };

  // Auto-slugify tenant name
  const handleNameChange = (name: string) => {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
    
    setNewTenant((prev) => ({ ...prev, name, slug }));
  };

  // Generate random strong password
  const generatePassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()';
    let pass = '';
    for (let i = 0; i < 12; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewTenant((prev) => ({ ...prev, client_password: pass }));
  };

  // Handle create tenant
  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await apiFetch<{ success: boolean; data: Tenant }>('/admin/tenants', {
        method: 'POST',
        body: newTenant,
      });

      if (response.success) {
        toast.success(`Tenant ${response.data.name} berhasil dibuat!`);
        setIsAddOpen(false);
        setNewTenant({
          name: '',
          slug: '',
          plan_type: PlanType.BASIC,
          client_name: '',
          client_email: '',
          client_password: '',
        });
        fetchTenants(1);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        const errData = err.data as { error?: { message?: string } };
        toast.error(errData.error?.message || 'Gagal membuat tenant');
      } else {
        toast.error('Gagal terhubung ke server');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  // Filter clientside search
  const filteredTenants = tenants.filter(
    (t) =>
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.slug.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-gray-900">
            Manajemen Tenant
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Daftar dan kelola semua penyewa/tenant pada platform digital secara terpusat.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => fetchTenants(pagination.page, true)}
            disabled={isRefreshing}
            variant="outline"
            className="flex items-center gap-2 border-gray-200"
          >
            <RefreshCw className={`h-4 w-4 text-gray-600 ${isRefreshing ? 'animate-spin' : ''}`} />
            Perbarui
          </Button>
          <Button
            onClick={() => setIsAddOpen(true)}
            className="flex items-center gap-2 bg-primary text-white hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" />
            Tambah Tenant
          </Button>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Cari nama atau slug tenant..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 rounded-lg border-gray-200 focus-visible:ring-primary/20"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-500 shrink-0">Paket:</span>
          <Select 
            value={planFilter} 
            onValueChange={(val) => setPlanFilter(val as PlanType | 'ALL')}
          >
            <SelectTrigger className="w-[180px] rounded-lg border-gray-200">
              <SelectValue placeholder="Semua Paket" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Semua Paket</SelectItem>
              <SelectItem value={PlanType.BASIC}>Basic</SelectItem>
              <SelectItem value={PlanType.PREMIUM}>Premium</SelectItem>
              <SelectItem value={PlanType.ENTERPRISE}>Enterprise</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
          role="alert"
        >
          <span>{error}</span>
          <Button onClick={() => fetchTenants()} size="sm" variant="destructive">
            Coba Lagi
          </Button>
        </div>
      )}

      {/* Table Card */}
      <Card className="border-gray-100 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="text-center">
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                <p className="mt-3 text-sm text-gray-500">Memuat data tenant...</p>
              </div>
            </div>
          ) : filteredTenants.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-center p-6">
              <Building2 className="h-12 w-12 text-gray-300 mb-3" />
              <h3 className="text-sm font-bold text-gray-900">Tidak ada tenant ditemukan</h3>
              <p className="text-xs text-gray-500 mt-1 max-w-xs">
                Coba sesuaikan kata kunci pencarian atau filter tipe paket Anda.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/75 border-b border-gray-100 hover:bg-gray-50/75">
                  <TableHead className="py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Nama Tenant
                  </TableHead>
                  <TableHead className="py-4 px-3 text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Slug
                  </TableHead>
                  <TableHead className="py-4 px-3 text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Tipe Paket
                  </TableHead>
                  <TableHead className="py-4 px-3 text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Tanggal Dibuat
                  </TableHead>
                  <TableHead className="py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">
                    Status Aktif
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTenants.map((tenant) => (
                  <TableRow key={tenant.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <TableCell className="py-4 px-6 font-medium text-gray-900">
                      {tenant.name}
                    </TableCell>
                    <TableCell className="py-4 px-3 text-gray-500 text-sm">
                      /{tenant.slug}
                    </TableCell>
                    <TableCell className="py-4 px-3">
                      {tenant.plan_type === PlanType.ENTERPRISE ? (
                        <Badge className="bg-purple-50 text-purple-700 border-purple-100 font-medium hover:bg-purple-50 shadow-none">
                          Enterprise
                        </Badge>
                      ) : tenant.plan_type === PlanType.PREMIUM ? (
                        <Badge className="bg-indigo-50 text-indigo-700 border-indigo-100 font-medium hover:bg-indigo-50 shadow-none">
                          Premium
                        </Badge>
                      ) : (
                        <Badge className="bg-gray-100 text-gray-700 border-gray-200 font-medium hover:bg-gray-100 shadow-none">
                          Basic
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="py-4 px-3 text-gray-500 text-sm">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-gray-400" />
                        <span>{formatDate(tenant.created_at)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <span className={`text-xs font-semibold ${tenant.is_active ? 'text-emerald-600' : 'text-gray-400'}`}>
                          {tenant.is_active ? 'Aktif' : 'Nonaktif'}
                        </span>
                        <Switch
                          checked={tenant.is_active}
                          onCheckedChange={() => handleToggleStatus(tenant.id, tenant.is_active)}
                          aria-label="Toggle status keaktifan tenant"
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {!isLoading && pagination.total_pages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-100 pt-4">
          <p className="text-sm text-gray-500">
            Menampilkan <span className="font-medium">{filteredTenants.length}</span> dari{' '}
            <span className="font-medium">{pagination.total}</span> tenant
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchTenants(pagination.page - 1)}
              disabled={pagination.page === 1}
              className="rounded-lg border-gray-200"
            >
              Sebelumnya
            </Button>
            <span className="text-sm text-gray-700">
              Halaman {pagination.page} dari {pagination.total_pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchTenants(pagination.page + 1)}
              disabled={pagination.page === pagination.total_pages}
              className="rounded-lg border-gray-200"
            >
              Selanjutnya
            </Button>
          </div>
        </div>
      )}

      {/* Add Tenant Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-xl rounded-2xl p-6 border-gray-100 shadow-xl">
          <form onSubmit={handleCreateTenant}>
            <DialogHeader className="mb-6">
              <DialogTitle className="text-2xl font-bold flex items-center gap-2 text-gray-900">
                <Sparkles className="h-6 w-6 text-primary animate-pulse" />
                Tambah Tenant Baru
              </DialogTitle>
              <DialogDescription className="text-gray-500">
                Isi detail tenant baru dan buat akun pengelola utamanya secara otomatis.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              {/* Tenant Section */}
              <div className="bg-gray-50/50 border border-gray-100 rounded-xl p-4 space-y-4">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-2">
                  <Building2 className="h-4 w-4 text-indigo-500" />
                  Detail Tenant
                </h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5 col-span-2 sm:col-span-1">
                    <Label htmlFor="tenant_name" className="text-xs font-bold text-gray-600">
                      Nama Tenant
                    </Label>
                    <Input
                      id="tenant_name"
                      placeholder="Nama mempelai / acara"
                      value={newTenant.name}
                      onChange={(e) => handleNameChange(e.target.value)}
                      required
                      className="rounded-lg border-gray-200 focus-visible:ring-primary/20"
                    />
                  </div>

                  <div className="space-y-1.5 col-span-2 sm:col-span-1">
                    <Label htmlFor="tenant_slug" className="text-xs font-bold text-gray-600">
                      Slug URL
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-sm text-gray-400 font-medium">/</span>
                      <Input
                        id="tenant_slug"
                        placeholder="slug-url"
                        value={newTenant.slug}
                        onChange={(e) => setNewTenant((prev) => ({ ...prev, slug: e.target.value }))}
                        required
                        className="pl-6 rounded-lg border-gray-200 focus-visible:ring-primary/20"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="plan_type" className="text-xs font-bold text-gray-600">
                    Tipe Paket
                  </Label>
                  <Select
                    value={newTenant.plan_type}
                    onValueChange={(val) => setNewTenant((prev) => ({ ...prev, plan_type: val as PlanType }))}
                  >
                    <SelectTrigger id="plan_type" className="rounded-lg border-gray-200">
                      <SelectValue placeholder="Pilih paket" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={PlanType.BASIC}>Basic (Maks 100 Tamu)</SelectItem>
                      <SelectItem value={PlanType.PREMIUM}>Premium (Maks 500 Tamu)</SelectItem>
                      <SelectItem value={PlanType.ENTERPRISE}>Enterprise (Kustom)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Admin Client User Section */}
              <div className="bg-gray-50/50 border border-gray-100 rounded-xl p-4 space-y-4">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-2">
                  <User className="h-4 w-4 text-emerald-500" />
                  Detail Akun Client (Pengelola)
                </h3>

                <div className="space-y-1.5">
                  <Label htmlFor="client_name" className="text-xs font-bold text-gray-600">
                    Nama Lengkap Client
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <Input
                      id="client_name"
                      placeholder="Nama lengkap pengelola"
                      value={newTenant.client_name}
                      onChange={(e) => setNewTenant((prev) => ({ ...prev, client_name: e.target.value }))}
                      required
                      className="pl-9 rounded-lg border-gray-200 focus-visible:ring-primary/20"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5 col-span-2 sm:col-span-1">
                    <Label htmlFor="client_email" className="text-xs font-bold text-gray-600">
                      Email
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                      <Input
                        id="client_email"
                        type="email"
                        placeholder="client@mail.com"
                        value={newTenant.client_email}
                        onChange={(e) => setNewTenant((prev) => ({ ...prev, client_email: e.target.value }))}
                        required
                        className="pl-9 rounded-lg border-gray-200 focus-visible:ring-primary/20"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 col-span-2 sm:col-span-1">
                    <Label htmlFor="client_password" className="text-xs font-bold text-gray-600">
                      Password Akun
                    </Label>
                    <div className="relative flex gap-2">
                      <div className="relative flex-1">
                        <Lock className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                        <Input
                          id="client_password"
                          type="text"
                          placeholder="Password minimal 8 karakter"
                          value={newTenant.client_password}
                          onChange={(e) => setNewTenant((prev) => ({ ...prev, client_password: e.target.value }))}
                          required
                          className="pl-9 rounded-lg border-gray-200 focus-visible:ring-primary/20"
                        />
                      </div>
                      <Button
                        type="button"
                        onClick={generatePassword}
                        variant="outline"
                        title="Generate Password Acak"
                        className="px-3 border-gray-200 rounded-lg shrink-0 flex items-center justify-center hover:bg-gray-100"
                      >
                        <KeyRound className="h-4 w-4 text-gray-600" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="mt-6 flex flex-col sm:flex-row gap-2 border-t border-gray-100 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddOpen(false)}
                className="rounded-lg border-gray-200"
              >
                Batal
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-primary text-white hover:opacity-90 rounded-lg transition-opacity flex items-center justify-center gap-1.5"
              >
                {isSubmitting ? 'Menyimpan...' : 'Simpan Tenant'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
