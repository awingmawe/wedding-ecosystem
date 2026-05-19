import bcrypt from 'bcrypt';
import { ErrorCode } from '@wedding/shared';
import type { PlanType, UserRole } from '@wedding/shared';

const BCRYPT_COST_FACTOR = 10;

export interface TenantRecord {
  id: string;
  name: string;
  slug: string;
  plan_type: PlanType;
  is_active: boolean;
  created_at: Date;
}

export interface UserRecord {
  id: string;
  tenant_id: string;
  tenant_name: string | null;
  email: string;
  role: UserRole;
  name: string;
  created_at: Date;
}

export interface GlobalStats {
  total_tenants: number;
  total_users: number;
  active_scanner_devices: number;
  total_guests: number;
}

export interface AuditLogRecord {
  id: string;
  timestamp: Date;
  user_id: string | null;
  user_email?: string | null;
  tenant_id: string | null;
  tenant_name?: string | null;
  action: string;
  request_id: string;
  metadata: any | null;
}

export interface AdminServiceError {
  code: ErrorCode;
  message: string;
}

export interface AdminRepository {
  listTenants(
    page: number,
    perPage: number,
    planType?: PlanType
  ): Promise<{ data: TenantRecord[]; total: number }>;

  createTenantWithClient(
    tenantData: { name: string; slug: string; plan_type: PlanType },
    clientUserData: { email: string; password_hash: string; name: string }
  ): Promise<TenantRecord>;

  updateTenantStatus(tenantId: string, isActive: boolean): Promise<TenantRecord | null>;

  listUsers(
    page: number,
    perPage: number,
    role?: UserRole
  ): Promise<{ data: UserRecord[]; total: number }>;

  updateUserPassword(userId: string, passwordHash: string): Promise<boolean>;

  getGlobalStats(): Promise<GlobalStats>;

  checkTenantSlugExists(slug: string): Promise<boolean>;

  checkUserEmailExists(email: string): Promise<boolean>;

  listAuditLogs(
    page: number,
    perPage: number,
    action?: string,
    tenantId?: string,
    userId?: string,
    search?: string
  ): Promise<{ data: AuditLogRecord[]; total: number }>;
}

export class AdminService {
  constructor(private readonly repository: AdminRepository) {}

  async listTenants(
    page: number,
    perPage: number,
    planType?: PlanType
  ): Promise<{ data: TenantRecord[]; total: number }> {
    return this.repository.listTenants(page, perPage, planType);
  }

  async createTenant(
    tenantData: { name: string; slug: string; plan_type: PlanType },
    clientUserData: { email: string; passwordPlain: string; name: string }
  ): Promise<TenantRecord | AdminServiceError> {
    // 1. Check if slug exists
    const slugExists = await this.repository.checkTenantSlugExists(tenantData.slug);
    if (slugExists) {
      return {
        code: ErrorCode.ALREADY_EXISTS,
        message: 'Slug tenant sudah digunakan',
      };
    }

    // 2. Check if email exists
    const emailExists = await this.repository.checkUserEmailExists(clientUserData.email);
    if (emailExists) {
      return {
        code: ErrorCode.ALREADY_EXISTS,
        message: 'Email sudah digunakan oleh pengguna lain',
      };
    }

    // 3. Hash the password
    const passwordHash = await bcrypt.hash(clientUserData.passwordPlain, BCRYPT_COST_FACTOR);

    // 4. Create tenant and client in a transaction
    return this.repository.createTenantWithClient(tenantData, {
      email: clientUserData.email,
      password_hash: passwordHash,
      name: clientUserData.name,
    });
  }

  async toggleTenantStatus(
    tenantId: string,
    isActive: boolean
  ): Promise<TenantRecord | AdminServiceError> {
    const tenant = await this.repository.updateTenantStatus(tenantId, isActive);
    if (!tenant) {
      return {
        code: ErrorCode.NOT_FOUND,
        message: 'Tenant tidak ditemukan',
      };
    }
    return tenant;
  }

  async listUsers(
    page: number,
    perPage: number,
    role?: UserRole
  ): Promise<{ data: UserRecord[]; total: number }> {
    return this.repository.listUsers(page, perPage, role);
  }

  async resetUserPassword(
    userId: string,
    newPasswordPlain: string
  ): Promise<{ success: boolean } | AdminServiceError> {
    const passwordHash = await bcrypt.hash(newPasswordPlain, BCRYPT_COST_FACTOR);
    const success = await this.repository.updateUserPassword(userId, passwordHash);
    if (!success) {
      return {
        code: ErrorCode.NOT_FOUND,
        message: 'Pengguna tidak ditemukan atau gagal memperbarui password',
      };
    }
    return { success: true };
  }

  async getGlobalStats(): Promise<GlobalStats> {
    return this.repository.getGlobalStats();
  }

  async listAuditLogs(
    page: number,
    perPage: number,
    action?: string,
    tenantId?: string,
    userId?: string,
    search?: string
  ): Promise<{ data: AuditLogRecord[]; total: number }> {
    return this.repository.listAuditLogs(page, perPage, action, tenantId, userId, search);
  }
}
