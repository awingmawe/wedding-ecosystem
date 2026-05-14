import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ErrorCode } from '@wedding/shared';
import { z } from 'zod';

/**
 * Storage service for generating signed URLs for direct-to-R2 upload.
 *
 * Implements:
 * - Presigned PUT URLs with 15-minute expiry for direct upload from Dashboard
 * - Tenant storage quota enforcement (5GB per tenant)
 * - File type validation before URL generation
 * - S3-compatible API for Cloudflare R2
 *
 * Environment variables:
 *   R2_ACCOUNT_ID - Cloudflare account ID
 *   R2_ACCESS_KEY_ID - R2 access key ID
 *   R2_SECRET_ACCESS_KEY - R2 secret access key
 *   R2_BUCKET_NAME - R2 bucket name (default: 'wedding-ecosystem')
 *   R2_PUBLIC_URL - Public CDN URL for accessing uploaded files
 *
 * Requirements: 8.6, 8.8
 */

// --- Constants ---

/** Signed URL expiry in seconds (15 minutes) */
export const SIGNED_URL_EXPIRY_SECONDS = 15 * 60;

/** Maximum storage quota per tenant in bytes (5GB) */
export const TENANT_STORAGE_QUOTA_BYTES = 5 * 1024 * 1024 * 1024;

/** Human-readable quota label */
export const TENANT_STORAGE_QUOTA_LABEL = '5GB';

/** Allowed MIME types for upload */
export const ALLOWED_UPLOAD_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/webm',
] as const;

export type AllowedUploadMime = (typeof ALLOWED_UPLOAD_MIMES)[number];

// --- Zod Schemas ---

/** Input schema for signed URL generation request */
export const generateSignedUrlInputSchema = z.object({
  /** Tenant ID for storage isolation */
  tenantId: z.string().min(1, 'tenantId is required'),
  /** Event ID for file organization */
  eventId: z.string().min(1, 'eventId is required'),
  /** Original filename */
  filename: z.string().min(1, 'filename is required'),
  /** MIME type of the file to upload */
  contentType: z
    .string()
    .refine(
      (val): val is AllowedUploadMime => (ALLOWED_UPLOAD_MIMES as readonly string[]).includes(val),
      {
        message: `Content type not allowed. Supported: ${ALLOWED_UPLOAD_MIMES.join(', ')}`,
      }
    ),
  /** File size in bytes (for quota pre-check) */
  fileSizeBytes: z.number().int().positive('fileSizeBytes must be a positive integer'),
});

export type GenerateSignedUrlInput = z.infer<typeof generateSignedUrlInputSchema>;

// --- Types ---

/** Configuration for the R2 storage client */
export interface StorageConfig {
  /** Cloudflare account ID */
  accountId: string;
  /** R2 access key ID */
  accessKeyId: string;
  /** R2 secret access key */
  secretAccessKey: string;
  /** R2 bucket name */
  bucketName: string;
  /** Public CDN URL for accessing uploaded files */
  publicUrl: string;
}

/** Result of a successful signed URL generation */
export interface SignedUrlResult {
  /** Presigned PUT URL for direct upload */
  uploadUrl: string;
  /** Storage key where the file will be stored */
  key: string;
  /** Public URL to access the file after upload (via CDN) */
  publicUrl: string;
  /** URL expiry time in ISO 8601 format */
  expiresAt: string;
}

/** Error result from storage operations */
export interface StorageError {
  code: ErrorCode;
  message: string;
}

/** Tenant storage usage information */
export interface TenantStorageUsage {
  /** Current storage used in bytes */
  usedBytes: number;
  /** Maximum allowed storage in bytes */
  quotaBytes: number;
  /** Remaining available storage in bytes */
  remainingBytes: number;
}

/** Interface for querying tenant storage usage (dependency injection) */
export interface StorageUsageProvider {
  /**
   * Get the total storage used by a tenant in bytes.
   * Implementations may query the database or a cached value.
   */
  getTenantStorageUsage(tenantId: string): Promise<number>;
}

// --- Storage Config Builder ---

/**
 * Builds storage configuration from environment variables.
 * Returns null if required variables are not set.
 */
export function getStorageConfig(): StorageConfig | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME || 'wedding-ecosystem';
  const publicUrl = process.env.R2_PUBLIC_URL || '';

  if (!accountId || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return { accountId, accessKeyId, secretAccessKey, bucketName, publicUrl };
}

// --- S3 Client Factory ---

/**
 * Creates an S3-compatible client configured for Cloudflare R2.
 */
export function createR2Client(config: StorageConfig): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

// --- Storage Service ---

export class StorageService {
  private readonly s3Client: S3Client;
  private readonly config: StorageConfig;
  private readonly usageProvider: StorageUsageProvider;

  constructor(deps: {
    s3Client: S3Client;
    config: StorageConfig;
    usageProvider: StorageUsageProvider;
  }) {
    this.s3Client = deps.s3Client;
    this.config = deps.config;
    this.usageProvider = deps.usageProvider;
  }

  /**
   * Generate a presigned URL for direct-to-R2 upload.
   *
   * Flow:
   * 1. Validate input (filename, content type, file size)
   * 2. Check tenant storage quota
   * 3. Generate storage key
   * 4. Create presigned PUT URL with 15-minute expiry
   *
   * Requirements: 8.6, 8.8
   */
  async generateSignedUrl(input: GenerateSignedUrlInput): Promise<SignedUrlResult | StorageError> {
    // Step 1: Validate input
    const validation = generateSignedUrlInputSchema.safeParse(input);
    if (!validation.success) {
      return {
        code: ErrorCode.INVALID_INPUT,
        message: validation.error.errors.map((e) => e.message).join('; '),
      };
    }

    const { tenantId, eventId, filename, contentType, fileSizeBytes } = validation.data;

    // Step 2: Check tenant storage quota (Req 8.8)
    const quotaCheck = await this.checkStorageQuota(tenantId, fileSizeBytes);
    if (quotaCheck) {
      return quotaCheck;
    }

    // Step 3: Generate storage key
    const key = this.generateStorageKey(tenantId, eventId, filename);

    // Step 4: Create presigned PUT URL (Req 8.6)
    try {
      const command = new PutObjectCommand({
        Bucket: this.config.bucketName,
        Key: key,
        ContentType: contentType,
        ContentLength: fileSizeBytes,
      });

      const uploadUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: SIGNED_URL_EXPIRY_SECONDS,
      });

      const expiresAt = new Date(Date.now() + SIGNED_URL_EXPIRY_SECONDS * 1000).toISOString();

      const publicUrl = this.config.publicUrl ? `${this.config.publicUrl}/${key}` : key;

      return {
        uploadUrl,
        key,
        publicUrl,
        expiresAt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown storage error';
      console.error('[Storage] Failed to generate signed URL:', message);
      return {
        code: ErrorCode.UPLOAD_FAILED,
        message: 'Gagal membuat URL upload. Silakan coba lagi.',
      };
    }
  }

  /**
   * Check if the tenant has enough storage quota for the upload.
   * Returns a StorageError if quota would be exceeded, null if OK.
   *
   * Requirement: 8.8
   */
  async checkStorageQuota(tenantId: string, fileSizeBytes: number): Promise<StorageError | null> {
    try {
      const currentUsage = await this.usageProvider.getTenantStorageUsage(tenantId);
      const projectedUsage = currentUsage + fileSizeBytes;

      if (projectedUsage > TENANT_STORAGE_QUOTA_BYTES) {
        const remainingBytes = Math.max(0, TENANT_STORAGE_QUOTA_BYTES - currentUsage);
        return {
          code: ErrorCode.STORAGE_QUOTA_EXCEEDED,
          message: `Kuota penyimpanan terlampaui. Sisa kuota: ${this.formatBytes(remainingBytes)} dari ${TENANT_STORAGE_QUOTA_LABEL}.`,
        };
      }

      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Storage] Failed to check storage quota:', message);
      // Fail open: allow upload if quota check fails (better UX than blocking)
      // The actual upload will still be bounded by R2 bucket limits
      return null;
    }
  }

  /**
   * Get the current storage usage for a tenant.
   *
   * Requirement: 8.8
   */
  async getTenantStorageUsage(tenantId: string): Promise<TenantStorageUsage> {
    const usedBytes = await this.usageProvider.getTenantStorageUsage(tenantId);
    const remainingBytes = Math.max(0, TENANT_STORAGE_QUOTA_BYTES - usedBytes);

    return {
      usedBytes,
      quotaBytes: TENANT_STORAGE_QUOTA_BYTES,
      remainingBytes,
    };
  }

  /**
   * Generate a unique storage key for the uploaded file.
   * Format: {tenantId}/{eventId}/media/{timestamp}-{sanitizedFilename}
   */
  generateStorageKey(tenantId: string, eventId: string, filename: string): string {
    const timestamp = Date.now();
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${tenantId}/${eventId}/media/${timestamp}-${sanitizedFilename}`;
  }

  /**
   * Format bytes into human-readable string.
   */
  formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
  }
}

// --- Type Guards ---

/**
 * Type guard to check if a result is a StorageError.
 */
export function isStorageError(result: SignedUrlResult | StorageError): result is StorageError {
  return 'code' in result && 'message' in result && !('uploadUrl' in result);
}

// --- Factory ---

/**
 * Creates a StorageService instance using environment variables.
 * Returns null if R2 configuration is not available.
 */
export function createStorageService(usageProvider: StorageUsageProvider): StorageService | null {
  const config = getStorageConfig();
  if (!config) {
    console.warn(
      '[Storage] R2 configuration not set (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY). Storage service unavailable.'
    );
    return null;
  }

  const s3Client = createR2Client(config);
  return new StorageService({ s3Client, config, usageProvider });
}
