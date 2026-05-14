import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCode } from '@wedding/shared';
import {
  StorageService,
  TENANT_STORAGE_QUOTA_BYTES,
  SIGNED_URL_EXPIRY_SECONDS,
  ALLOWED_UPLOAD_MIMES,
  getStorageConfig,
  isStorageError,
  generateSignedUrlInputSchema,
  type StorageConfig,
  type StorageUsageProvider,
  type GenerateSignedUrlInput,
} from './storage';

// --- Mocks ---

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://r2.example.com/signed-url?token=abc'),
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({})),
  PutObjectCommand: vi.fn().mockImplementation((input) => ({ input })),
}));

// --- Test Helpers ---

function createMockUsageProvider(usedBytes = 0): StorageUsageProvider {
  return {
    getTenantStorageUsage: vi.fn().mockResolvedValue(usedBytes),
  };
}

function createTestConfig(): StorageConfig {
  return {
    accountId: 'test-account-id',
    accessKeyId: 'test-access-key',
    secretAccessKey: 'test-secret-key',
    bucketName: 'wedding-ecosystem',
    publicUrl: 'https://cdn.example.com',
  };
}

function createTestService(usedBytes = 0): {
  service: StorageService;
  usageProvider: StorageUsageProvider;
} {
  const usageProvider = createMockUsageProvider(usedBytes);
  const config = createTestConfig();
  const s3Client = {} as any;
  const service = new StorageService({ s3Client, config, usageProvider });
  return { service, usageProvider };
}

function validInput(overrides?: Partial<GenerateSignedUrlInput>): GenerateSignedUrlInput {
  return {
    tenantId: 'tenant-123',
    eventId: 'event-456',
    filename: 'photo.jpg',
    contentType: 'image/jpeg',
    fileSizeBytes: 2 * 1024 * 1024, // 2MB
    ...overrides,
  };
}

// --- Tests ---

describe('StorageService', () => {
  describe('generateSignedUrl', () => {
    it('should generate a signed URL for a valid upload request', async () => {
      const { service } = createTestService(0);
      const input = validInput();

      const result = await service.generateSignedUrl(input);

      expect(isStorageError(result)).toBe(false);
      if (!isStorageError(result)) {
        expect(result.uploadUrl).toBe('https://r2.example.com/signed-url?token=abc');
        expect(result.key).toContain('tenant-123/event-456/media/');
        expect(result.key).toContain('photo.jpg');
        expect(result.publicUrl).toContain('https://cdn.example.com/');
        expect(result.expiresAt).toBeDefined();
        // Verify expiry is approximately 15 minutes from now
        const expiresAt = new Date(result.expiresAt).getTime();
        const expectedExpiry = Date.now() + SIGNED_URL_EXPIRY_SECONDS * 1000;
        expect(Math.abs(expiresAt - expectedExpiry)).toBeLessThan(2000);
      }
    });

    it('should reject upload when tenant storage quota would be exceeded', async () => {
      // Tenant already used 4.9GB, trying to upload 200MB
      const usedBytes = 4.9 * 1024 * 1024 * 1024;
      const { service } = createTestService(usedBytes);
      const input = validInput({ fileSizeBytes: 200 * 1024 * 1024 });

      const result = await service.generateSignedUrl(input);

      expect(isStorageError(result)).toBe(true);
      if (isStorageError(result)) {
        expect(result.code).toBe(ErrorCode.STORAGE_QUOTA_EXCEEDED);
        expect(result.message).toContain('Kuota penyimpanan terlampaui');
      }
    });

    it('should allow upload when tenant has enough quota remaining', async () => {
      // Tenant used 3GB, trying to upload 1GB (total 4GB < 5GB)
      const usedBytes = 3 * 1024 * 1024 * 1024;
      const { service } = createTestService(usedBytes);
      const input = validInput({ fileSizeBytes: 1 * 1024 * 1024 * 1024 });

      const result = await service.generateSignedUrl(input);

      expect(isStorageError(result)).toBe(false);
    });

    it('should reject upload when file would exactly exceed quota', async () => {
      // Tenant used exactly 5GB - 1 byte, trying to upload 2 bytes
      const usedBytes = TENANT_STORAGE_QUOTA_BYTES - 1;
      const { service } = createTestService(usedBytes);
      const input = validInput({ fileSizeBytes: 2 });

      const result = await service.generateSignedUrl(input);

      expect(isStorageError(result)).toBe(true);
      if (isStorageError(result)) {
        expect(result.code).toBe(ErrorCode.STORAGE_QUOTA_EXCEEDED);
      }
    });

    it('should allow upload when file exactly fills remaining quota', async () => {
      // Tenant used 4GB, trying to upload exactly 1GB (total = 5GB = quota)
      const usedBytes = 4 * 1024 * 1024 * 1024;
      const { service } = createTestService(usedBytes);
      const input = validInput({ fileSizeBytes: 1 * 1024 * 1024 * 1024 });

      const result = await service.generateSignedUrl(input);

      expect(isStorageError(result)).toBe(false);
    });

    it('should reject invalid content type', async () => {
      const { service } = createTestService(0);
      const input = validInput({ contentType: 'application/pdf' as any });

      const result = await service.generateSignedUrl(input);

      expect(isStorageError(result)).toBe(true);
      if (isStorageError(result)) {
        expect(result.code).toBe(ErrorCode.INVALID_INPUT);
        expect(result.message).toContain('Content type not allowed');
      }
    });

    it('should reject empty tenantId', async () => {
      const { service } = createTestService(0);
      const input = validInput({ tenantId: '' });

      const result = await service.generateSignedUrl(input);

      expect(isStorageError(result)).toBe(true);
      if (isStorageError(result)) {
        expect(result.code).toBe(ErrorCode.INVALID_INPUT);
      }
    });

    it('should reject negative file size', async () => {
      const { service } = createTestService(0);
      const input = validInput({ fileSizeBytes: -1 });

      const result = await service.generateSignedUrl(input);

      expect(isStorageError(result)).toBe(true);
      if (isStorageError(result)) {
        expect(result.code).toBe(ErrorCode.INVALID_INPUT);
      }
    });

    it('should reject zero file size', async () => {
      const { service } = createTestService(0);
      const input = validInput({ fileSizeBytes: 0 });

      const result = await service.generateSignedUrl(input);

      expect(isStorageError(result)).toBe(true);
      if (isStorageError(result)) {
        expect(result.code).toBe(ErrorCode.INVALID_INPUT);
      }
    });

    it('should fail open when quota check throws an error', async () => {
      const usageProvider: StorageUsageProvider = {
        getTenantStorageUsage: vi.fn().mockRejectedValue(new Error('DB connection failed')),
      };
      const config = createTestConfig();
      const s3Client = {} as any;
      const service = new StorageService({ s3Client, config, usageProvider });

      const input = validInput();
      const result = await service.generateSignedUrl(input);

      // Should succeed (fail open) even though quota check failed
      expect(isStorageError(result)).toBe(false);
    });
  });

  describe('checkStorageQuota', () => {
    it('should return null when under quota', async () => {
      const { service } = createTestService(1 * 1024 * 1024 * 1024); // 1GB used
      const result = await service.checkStorageQuota('tenant-123', 1024);
      expect(result).toBeNull();
    });

    it('should return error when over quota', async () => {
      const { service } = createTestService(TENANT_STORAGE_QUOTA_BYTES); // Full
      const result = await service.checkStorageQuota('tenant-123', 1);
      expect(result).not.toBeNull();
      expect(result!.code).toBe(ErrorCode.STORAGE_QUOTA_EXCEEDED);
    });

    it('should include remaining quota in error message', async () => {
      const usedBytes = 4.5 * 1024 * 1024 * 1024; // 4.5GB used
      const { service } = createTestService(usedBytes);
      const fileSizeBytes = 1 * 1024 * 1024 * 1024; // 1GB upload

      const result = await service.checkStorageQuota('tenant-123', fileSizeBytes);

      expect(result).not.toBeNull();
      expect(result!.message).toContain('Sisa kuota');
    });
  });

  describe('getTenantStorageUsage', () => {
    it('should return usage information', async () => {
      const usedBytes = 2 * 1024 * 1024 * 1024; // 2GB
      const { service } = createTestService(usedBytes);

      const usage = await service.getTenantStorageUsage('tenant-123');

      expect(usage.usedBytes).toBe(usedBytes);
      expect(usage.quotaBytes).toBe(TENANT_STORAGE_QUOTA_BYTES);
      expect(usage.remainingBytes).toBe(TENANT_STORAGE_QUOTA_BYTES - usedBytes);
    });

    it('should clamp remaining to zero when over quota', async () => {
      const usedBytes = 6 * 1024 * 1024 * 1024; // 6GB (over quota)
      const { service } = createTestService(usedBytes);

      const usage = await service.getTenantStorageUsage('tenant-123');

      expect(usage.remainingBytes).toBe(0);
    });
  });

  describe('generateStorageKey', () => {
    it('should generate key with correct format', () => {
      const { service } = createTestService(0);
      const key = service.generateStorageKey('tenant-1', 'event-2', 'photo.jpg');

      expect(key).toMatch(/^tenant-1\/event-2\/media\/\d+-photo\.jpg$/);
    });

    it('should sanitize special characters in filename', () => {
      const { service } = createTestService(0);
      const key = service.generateStorageKey('t1', 'e1', 'my photo (1).jpg');

      expect(key).toContain('my_photo__1_.jpg');
      expect(key).not.toContain(' ');
      expect(key).not.toContain('(');
    });
  });

  describe('formatBytes', () => {
    it('should format bytes correctly', () => {
      const { service } = createTestService(0);

      expect(service.formatBytes(500)).toBe('500B');
      expect(service.formatBytes(1024)).toBe('1.0KB');
      expect(service.formatBytes(1.5 * 1024 * 1024)).toBe('1.5MB');
      expect(service.formatBytes(2.5 * 1024 * 1024 * 1024)).toBe('2.50GB');
    });
  });
});

describe('generateSignedUrlInputSchema', () => {
  it('should validate correct input', () => {
    const result = generateSignedUrlInputSchema.safeParse({
      tenantId: 'tenant-123',
      eventId: 'event-456',
      filename: 'photo.jpg',
      contentType: 'image/jpeg',
      fileSizeBytes: 1024,
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing fields', () => {
    const result = generateSignedUrlInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('should accept all allowed MIME types', () => {
    for (const mime of ALLOWED_UPLOAD_MIMES) {
      const result = generateSignedUrlInputSchema.safeParse({
        tenantId: 'tenant-123',
        eventId: 'event-456',
        filename: 'file.ext',
        contentType: mime,
        fileSizeBytes: 1024,
      });
      expect(result.success).toBe(true);
    }
  });
});

describe('getStorageConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  it('should return null when required env vars are missing', () => {
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;

    const config = getStorageConfig();
    expect(config).toBeNull();
  });

  it('should return config when all required env vars are set', () => {
    process.env.R2_ACCOUNT_ID = 'account-123';
    process.env.R2_ACCESS_KEY_ID = 'key-123';
    process.env.R2_SECRET_ACCESS_KEY = 'secret-123';
    process.env.R2_BUCKET_NAME = 'my-bucket';
    process.env.R2_PUBLIC_URL = 'https://cdn.example.com';

    const config = getStorageConfig();
    expect(config).not.toBeNull();
    expect(config!.accountId).toBe('account-123');
    expect(config!.accessKeyId).toBe('key-123');
    expect(config!.secretAccessKey).toBe('secret-123');
    expect(config!.bucketName).toBe('my-bucket');
    expect(config!.publicUrl).toBe('https://cdn.example.com');
  });

  it('should use default bucket name when not specified', () => {
    process.env.R2_ACCOUNT_ID = 'account-123';
    process.env.R2_ACCESS_KEY_ID = 'key-123';
    process.env.R2_SECRET_ACCESS_KEY = 'secret-123';
    delete process.env.R2_BUCKET_NAME;

    const config = getStorageConfig();
    expect(config!.bucketName).toBe('wedding-ecosystem');
  });
});

describe('isStorageError', () => {
  it('should return true for StorageError', () => {
    expect(isStorageError({ code: ErrorCode.UPLOAD_FAILED, message: 'error' })).toBe(true);
  });

  it('should return false for SignedUrlResult', () => {
    expect(
      isStorageError({
        uploadUrl: 'https://example.com',
        key: 'key',
        publicUrl: 'https://cdn.example.com/key',
        expiresAt: new Date().toISOString(),
      })
    ).toBe(false);
  });
});
