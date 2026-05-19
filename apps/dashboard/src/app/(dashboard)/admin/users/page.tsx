'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { UserRole } from '@wedding/shared';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  Users, 
  Search, 
  RefreshCw, 
  KeyRound, 
  Calendar,
  Lock,
  Mail,
  User,
  Sparkles,
  Clipboard,
  Check,
  Building
} from 'lucide-react';
import { toast } from 'sonner';

interface UserRecord {
  id: string;
  tenant_id: string;
  tenant_name: string | null;
  email: string;
  role: UserRole;
  name: string;
  created_at: string;
}

interface PaginatedUsers {
  data: UserRecord[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);
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
  const [roleFilter, setRoleFilter] = useState<UserRole | 'ALL'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Reset Password Dialog
  const [resetUser, setResetUser] = useState<UserRecord | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchUsers = useCallback(
    async (page = 1, silent = false) => {
      if (!silent) setIsLoading(true);
      else setIsRefreshing(true);
      setError('');

      try {
        const params = new URLSearchParams({
          page: page.toString(),
          per_page: '10',
        });

        if (roleFilter !== 'ALL') {
          params.set('role', roleFilter);
        }

        const response = await apiFetch<{ success: boolean; data: UserRecord[]; pagination: PaginatedUsers['pagination'] }>(
          `/admin/users?${params.toString()}`
        );

        setUsers(response.data);
        setPagination(response.pagination);
      } catch (err) {
        if (err instanceof ApiError) {
          const errData = err.data as { error?: { message?: string } };
          setError(errData.error?.message || 'Gagal memuat daftar pengguna');
        } else {
          setError('Terjadi kesalahan koneksi ke server');
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [roleFilter]
  );

  useEffect(() => {
    fetchUsers(1);
  }, [fetchUsers]);

  // Handle password reset
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUser) return;
    if (newPassword.length < 8) {
      toast.error('Password minimal harus 8 karakter');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await apiFetch<{ success: boolean; message: string }>(
        `/admin/users/${resetUser.id}/reset-password`,
        {
          method: 'PUT',
          body: { password: newPassword },
        }
      );

      if (response.success) {
        toast.success(`Password untuk pengguna ${resetUser.name} berhasil diatur ulang!`);
        setResetUser(null);
        setNewPassword('');
      }
    } catch (err) {
      if (err instanceof ApiError) {
        const errData = err.data as { error?: { message?: string } };
        toast.error(errData.error?.message || 'Gagal menyetel ulang password');
      } else {
        toast.error('Gagal terhubung ke server');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Generate strong password
  const generatePassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let pass = '';
    for (let i = 0; i < 12; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewPassword(pass);
    setCopied(false);
  };

  // Copy password to clipboard
  const copyToClipboard = () => {
    navigator.clipboard.writeText(newPassword);
    setCopied(true);
    toast.success('Password disalin ke clipboard');
    setTimeout(() => setCopied(false), 2000);
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
  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.tenant_name && u.tenant_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-gray-900">
            Manajemen Pengguna
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Kelola semua akun pengguna di dalam sistem dan atur ulang kredensial akses jika diperlukan.
          </p>
        </div>
        <Button
          onClick={() => fetchUsers(pagination.page, true)}
          disabled={isRefreshing}
          variant="outline"
          className="flex items-center gap-2 border-gray-200 self-start"
        >
          <RefreshCw className={`h-4 w-4 text-gray-600 ${isRefreshing ? 'animate-spin' : ''}`} />
          Perbarui
        </Button>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Cari nama, email, atau tenant..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 rounded-lg border-gray-200 focus-visible:ring-primary/20"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-500 shrink-0">Peran:</span>
          <Select 
            value={roleFilter} 
            onValueChange={(val) => setRoleFilter(val as UserRole | 'ALL')}
          >
            <SelectTrigger className="w-[180px] rounded-lg border-gray-200">
              <SelectValue placeholder="Semua Peran" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Semua Peran</SelectItem>
              <SelectItem value={UserRole.ADMIN}>Administrator</SelectItem>
              <SelectItem value={UserRole.CLIENT}>Client (Pemilik)</SelectItem>
              <SelectItem value={UserRole.WO}>Wedding Organizer</SelectItem>
              <SelectItem value={UserRole.SCANNER}>Operator Scanner</SelectItem>
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
          <Button onClick={() => fetchUsers()} size="sm" variant="destructive">
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
                <p className="mt-3 text-sm text-gray-500">Memuat data pengguna...</p>
              </div>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-center p-6">
              <Users className="h-12 w-12 text-gray-300 mb-3" />
              <h3 className="text-sm font-bold text-gray-900">Tidak ada pengguna ditemukan</h3>
              <p className="text-xs text-gray-500 mt-1 max-w-xs">
                Coba sesuaikan kata kunci pencarian atau filter peran Anda.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/75 border-b border-gray-100 hover:bg-gray-50/75">
                  <TableHead className="py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Nama Pengguna
                  </TableHead>
                  <TableHead className="py-4 px-3 text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Peran
                  </TableHead>
                  <TableHead className="py-4 px-3 text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Tenant Asosiasi
                  </TableHead>
                  <TableHead className="py-4 px-3 text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Tanggal Terdaftar
                  </TableHead>
                  <TableHead className="py-4 px-6 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">
                    Tindakan
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <TableCell className="py-4 px-6">
                      <div className="flex flex-col">
                        <span className="font-medium text-gray-900">{user.name}</span>
                        <span className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                          <Mail className="h-3 w-3 text-gray-400" />
                          {user.email}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-4 px-3">
                      {user.role === UserRole.ADMIN ? (
                        <Badge className="bg-red-50 text-red-700 border-red-100 font-medium hover:bg-red-50 shadow-none">
                          Super Admin
                        </Badge>
                      ) : user.role === UserRole.CLIENT ? (
                        <Badge className="bg-indigo-50 text-indigo-700 border-indigo-100 font-medium hover:bg-indigo-50 shadow-none">
                          Client
                        </Badge>
                      ) : user.role === UserRole.WO ? (
                        <Badge className="bg-teal-50 text-teal-700 border-teal-100 font-medium hover:bg-teal-50 shadow-none">
                          Wedding Organizer
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-50 text-amber-700 border-amber-100 font-medium hover:bg-amber-50 shadow-none">
                          Scanner Operator
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="py-4 px-3 text-gray-900 text-sm">
                      {user.tenant_name ? (
                        <div className="flex items-center gap-1.5 font-medium text-gray-700">
                          <Building className="h-3.5 w-3.5 text-gray-400" />
                          <span>{user.tenant_name}</span>
                        </div>
                      ) : (
                        <span className="text-xs italic text-gray-400 font-medium">Layanan Platform (Global)</span>
                      )}
                    </TableCell>
                    <TableCell className="py-4 px-3 text-gray-500 text-sm">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-gray-400" />
                        <span>{formatDate(user.created_at)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-4 px-6 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setResetUser(user)}
                        className="rounded-lg border-gray-200 flex items-center gap-1.5 ml-auto text-xs hover:bg-red-50 hover:text-red-600 hover:border-red-100 transition-all font-medium py-1 h-8"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                        Reset Password
                      </Button>
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
            Menampilkan <span className="font-medium">{filteredUsers.length}</span> dari{' '}
            <span className="font-medium">{pagination.total}</span> pengguna
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchUsers(pagination.page - 1)}
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
              onClick={() => fetchUsers(pagination.page + 1)}
              disabled={pagination.page === pagination.total_pages}
              className="rounded-lg border-gray-200"
            >
              Selanjutnya
            </Button>
          </div>
        </div>
      )}

      {/* Reset Password Dialog */}
      <Dialog open={resetUser !== null} onOpenChange={(open) => !open && setResetUser(null)}>
        <DialogContent className="max-w-md rounded-2xl p-6 border-gray-100 shadow-xl">
          {resetUser && (
            <form onSubmit={handleResetPassword}>
              <DialogHeader className="mb-5">
                <DialogTitle className="text-xl font-bold flex items-center gap-2 text-gray-900">
                  <KeyRound className="h-5 w-5 text-red-500" />
                  Atur Ulang Password
                </DialogTitle>
                <DialogDescription className="text-gray-500 mt-1">
                  Ubah atau buat password baru untuk pengguna secara instan.
                </DialogDescription>
              </DialogHeader>

              {/* User info display */}
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 mb-5 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-gray-500">Nama Pengguna:</span>
                  <span className="font-bold text-gray-900">{resetUser.name}</span>
                </div>
                <div className="flex justify-between text-xs border-t border-gray-200/50 pt-2">
                  <span className="font-semibold text-gray-500">Email Login:</span>
                  <span className="font-bold text-gray-900">{resetUser.email}</span>
                </div>
                <div className="flex justify-between text-xs border-t border-gray-200/50 pt-2">
                  <span className="font-semibold text-gray-500">Tenant:</span>
                  <span className="font-bold text-gray-900">
                    {resetUser.tenant_name || 'Layanan Platform (Global)'}
                  </span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset_password" className="text-xs font-bold text-gray-600">
                    Password Baru
                  </Label>
                  <div className="relative flex gap-2">
                    <div className="relative flex-1">
                      <Lock className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                      <Input
                        id="reset_password"
                        type="text"
                        placeholder="Password minimal 8 karakter"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        className="pl-9 rounded-lg border-gray-200 focus-visible:ring-primary/20"
                      />
                    </div>
                    
                    <Button
                      type="button"
                      onClick={generatePassword}
                      variant="outline"
                      title="Buat Password Kuat"
                      className="px-3 border-gray-200 rounded-lg shrink-0 flex items-center justify-center hover:bg-gray-100"
                    >
                      <Sparkles className="h-4 w-4 text-primary animate-pulse" />
                    </Button>

                    {newPassword.length >= 8 && (
                      <Button
                        type="button"
                        onClick={copyToClipboard}
                        variant="outline"
                        title="Salin Password"
                        className="px-3 border-gray-200 rounded-lg shrink-0 flex items-center justify-center hover:bg-gray-100"
                      >
                        {copied ? (
                          <Check className="h-4 w-4 text-emerald-600 animate-scale-up" />
                        ) : (
                          <Clipboard className="h-4 w-4 text-gray-600" />
                        )}
                      </Button>
                    )}
                  </div>
                  <p className="text-3xs text-gray-400 italic">
                    Gunakan tombol bintang untuk menghasilkan password aman secara acak.
                  </p>
                </div>
              </div>

              <DialogFooter className="mt-6 flex flex-col sm:flex-row gap-2 border-t border-gray-100 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setResetUser(null);
                    setNewPassword('');
                  }}
                  className="rounded-lg border-gray-200"
                >
                  Batal
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting || newPassword.length < 8}
                  className="bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center justify-center gap-1.5"
                >
                  {isSubmitting ? 'Memperbarui...' : 'Simpan Sandi Baru'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
