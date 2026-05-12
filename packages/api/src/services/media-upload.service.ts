import { ErrorCode } from '@wedding/shared';

// --- Constants ---

/** Allowed MIME types for image uploads (Req 5.4, 13.8) */
export const ALLOWED_IMAGE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

/** Allowed MIME types for video uploads (Req 5.4, 13.8) */
export const ALLOWED_VIDEO_MIMES = [
  'video/mp4',
  'video/webm',
] as const;

/** All allowed MIME types */
export const ALLOWED_MIMES = [
  ...ALLOWED_IMAGE_MIMES,
  ...ALLOWED_VIDEO_MIMES,
] as const;

/** File extension to MIME type mapping */
export const EXTENSION_MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

/** Max file sizes in bytes (Req 5.4, 13.8) */
export const MAX_FILE_SIZES = {
  /** Photos: max 5MB */
  IMAGE: 5 * 1024 * 1024,
  /** Video: max 50MB */
  VIDEO: 50 * 1024 * 1024,
  /** General/other: max 10MB */
  GENERAL: 10 * 1024 * 1024,
} as const;

/** Human-readable size labels for error messages */
export const SIZE_LABELS = {
  IMAGE: '5MB',
  VIDEO: '50MB',
  GENERAL: '10MB',
} as const;

// --- Types ---

export type AllowedMimeType = (typeof ALLOWED_MIMES)[number];

export type MediaCategory = 'image' | 'video';

/** Input file metadata for validation */
export interface FileInput {
  /** Original filename */
  originalname: string;
  /** MIME type reported by the client */
  mimetype: string;
  /** File size in bytes */
  size: number;
  /** File buffer for virus scanning */
  buffer: Buffer;
}

/** Result of a successful upload */
export interface UploadResult {
  /** URL of the uploaded file in cloud storage */
  url: string;
  /** Original filename */
  originalname: string;
  /** Validated MIME type */
  mimetype: string;
  /** File size in bytes */
  size: number;
  /** Media category (image or video) */
  category: MediaCategory;
}

/** Error result from upload validation or processing */
export interface MediaUploadError {
  code: ErrorCode;
  message: string;
}

/** Virus scan result */
export interface VirusScanResult {
  /** Whether the file is clean (no malware detected) */
  clean: boolean;
  /** Name of detected malware, if any */
  malwareName?: string;
}

// --- Virus Scanner Interface (Strategy Pattern) ---

/**
 * Pluggable virus scanner interface.
 * Implementations can be swapped for different providers (ClamAV, VirusTotal, etc.)
 */
export interface VirusScanner {
  /**
   * Scan a file buffer for malware.
   * @param buffer - File content to scan
   * @param filename - Original filename for context
   * @returns Scan result indicating if file is clean
   */
  scan(buffer: Buffer, filename: string): Promise<VirusScanResult>;
}

// --- No-op Virus Scanner (Default) ---

/**
 * No-op virus scanner that always reports files as clean.
 * Used as default when no real scanner is configured.
 * Can be replaced with ClamAV, VirusTotal, or other providers.
 */
export class NoOpVirusScanner implements VirusScanner {
  async scan(_buffer: Buffer, _filename: string): Promise<VirusScanResult> {
    return { clean: true };
  }
}

// --- Cloud Storage Interface ---

/**
 * Pluggable cloud storage interface for file uploads.
 * Implementations can target S3, GCS, or local filesystem.
 */
export interface CloudStorage {
  /**
   * Upload a file to cloud storage.
   * @param buffer - File content
   * @param key - Storage key/path for the file
   * @param mimetype - MIME type of the file
   * @returns Public URL of the uploaded file
   */
  upload(buffer: Buffer, key: string, mimetype: string): Promise<string>;
}

// --- Media Upload Service ---

export class MediaUploadService {
  private readonly virusScanner: VirusScanner;
  private readonly cloudStorage: CloudStorage;

  constructor(config: {
    virusScanner?: VirusScanner;
    cloudStorage: CloudStorage;
  }) {
    this.virusScanner = config.virusScanner ?? new NoOpVirusScanner();
    this.cloudStorage = config.cloudStorage;
  }

  /**
   * Upload a media file with full validation (Req 5.4, 5.5, 13.8, 13.9)
   *
   * Validation order:
   * 1. File format validation (MIME type + extension)
   * 2. File size validation (category-specific limits)
   * 3. Virus scan
   * 4. Upload to cloud storage
   */
  async uploadFile(
    file: FileInput,
    tenantId: string,
    eventId: string
  ): Promise<UploadResult | MediaUploadError> {
    // Step 1: Validate file format (Req 13.8)
    const formatValidation = this.validateFormat(file);
    if (formatValidation) {
      return formatValidation;
    }

    // Step 2: Determine category and validate size (Req 5.4, 13.8)
    const category = this.getMediaCategory(file.mimetype);
    const sizeValidation = this.validateSize(file, category);
    if (sizeValidation) {
      return sizeValidation;
    }

    // Step 3: Virus scan (Req 13.8)
    const scanResult = await this.virusScanner.scan(file.buffer, file.originalname);
    if (!scanResult.clean) {
      return {
        code: ErrorCode.MALWARE_DETECTED,
        message: scanResult.malwareName
          ? `File terdeteksi mengandung malware: ${scanResult.malwareName}`
          : 'File terdeteksi mengandung malware',
      };
    }

    // Step 4: Upload to cloud storage
    const storageKey = this.generateStorageKey(tenantId, eventId, file.originalname);
    try {
      const url = await this.cloudStorage.upload(file.buffer, storageKey, file.mimetype);
      return {
        url,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        category,
      };
    } catch {
      return {
        code: ErrorCode.UPLOAD_FAILED,
        message: 'Gagal mengunggah file. Silakan coba lagi.',
      };
    }
  }

  /**
   * Validate file format against allowed MIME types (Req 13.8, 13.9)
   * Returns error if invalid, null if valid.
   */
  validateFormat(file: FileInput): MediaUploadError | null {
    const allowedMimes: readonly string[] = ALLOWED_MIMES;

    if (!allowedMimes.includes(file.mimetype)) {
      return {
        code: ErrorCode.INVALID_FILE_FORMAT,
        message: `Format file tidak didukung: ${file.mimetype}. Format yang didukung: JPEG, PNG, WebP (gambar) dan MP4, WebM (video).`,
      };
    }

    // Also validate extension matches MIME type to prevent spoofing
    const extension = this.getFileExtension(file.originalname);
    const expectedMime = EXTENSION_MIME_MAP[extension];

    if (!expectedMime || expectedMime !== file.mimetype) {
      return {
        code: ErrorCode.INVALID_FILE_FORMAT,
        message: `Ekstensi file tidak sesuai dengan tipe file. Format yang didukung: JPEG, PNG, WebP (gambar) dan MP4, WebM (video).`,
      };
    }

    return null;
  }

  /**
   * Validate file size against category-specific limits (Req 5.4, 13.8, 13.9)
   * Returns error if too large, null if valid.
   */
  validateSize(file: FileInput, category: MediaCategory): MediaUploadError | null {
    const maxSize = category === 'image' ? MAX_FILE_SIZES.IMAGE : MAX_FILE_SIZES.VIDEO;
    const sizeLabel = category === 'image' ? SIZE_LABELS.IMAGE : SIZE_LABELS.VIDEO;

    if (file.size > maxSize) {
      return {
        code: ErrorCode.FILE_TOO_LARGE,
        message: `Ukuran file melebihi batas maksimum ${sizeLabel}. Ukuran file: ${this.formatFileSize(file.size)}.`,
      };
    }

    return null;
  }

  /**
   * Determine media category from MIME type.
   */
  getMediaCategory(mimetype: string): MediaCategory {
    const imageMimes: readonly string[] = ALLOWED_IMAGE_MIMES;
    if (imageMimes.includes(mimetype)) {
      return 'image';
    }
    return 'video';
  }

  /**
   * Generate a unique storage key for the uploaded file.
   * Format: {tenantId}/{eventId}/media/{timestamp}-{filename}
   */
  generateStorageKey(tenantId: string, eventId: string, filename: string): string {
    const timestamp = Date.now();
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${tenantId}/${eventId}/media/${timestamp}-${sanitizedFilename}`;
  }

  /**
   * Extract file extension from filename (lowercase, with dot).
   */
  getFileExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    if (lastDot === -1) return '';
    return filename.slice(lastDot).toLowerCase();
  }

  /**
   * Format file size in human-readable format.
   */
  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }
}

// --- Type guard ---

/**
 * Type guard to check if a result is a MediaUploadError
 */
export function isMediaUploadError(
  result: UploadResult | MediaUploadError
): result is MediaUploadError {
  return 'code' in result && 'message' in result && !('url' in result);
}
