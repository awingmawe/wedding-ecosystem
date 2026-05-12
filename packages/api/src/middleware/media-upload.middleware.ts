import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  MediaUploadService,
  FileInput,
  isMediaUploadError,
  ALLOWED_MIMES,
  MAX_FILE_SIZES,
  EXTENSION_MIME_MAP,
} from '../services/media-upload.service';
import type { CloudStorage, VirusScanner } from '../services/media-upload.service';

// --- Multer Configuration ---

/**
 * Multer-compatible file filter configuration (Req 13.8)
 * Validates MIME type and extension before accepting the file into memory.
 */
export interface MulterFileFilterCallback {
  (error: Error | null, acceptFile: boolean): void;
}

/**
 * Create a Multer file filter that validates MIME type and extension.
 * This runs BEFORE the file is fully buffered, providing early rejection.
 */
export function createMediaFileFilter() {
  return (
    _req: unknown,
    file: { mimetype: string; originalname: string },
    cb: MulterFileFilterCallback
  ): void => {
    const allowedMimes: readonly string[] = ALLOWED_MIMES;

    // Check MIME type
    if (!allowedMimes.includes(file.mimetype)) {
      cb(
        new Error(
          `Format file tidak didukung: ${file.mimetype}. Format yang didukung: JPEG, PNG, WebP (gambar) dan MP4, WebM (video).`
        ),
        false
      );
      return;
    }

    // Check extension matches MIME type
    const ext = getExtension(file.originalname);
    const expectedMime = EXTENSION_MIME_MAP[ext];

    if (!expectedMime || expectedMime !== file.mimetype) {
      cb(
        new Error(
          'Ekstensi file tidak sesuai dengan tipe file. Format yang didukung: JPEG, PNG, WebP (gambar) dan MP4, WebM (video).'
        ),
        false
      );
      return;
    }

    cb(null, true);
  };
}

/**
 * Multer storage limits configuration.
 * Uses the GENERAL limit (10MB) as the Multer-level cap.
 * More specific limits (5MB image, 50MB video) are enforced in the service layer.
 */
export const MULTER_LIMITS = {
  /** Max file size at Multer level - uses VIDEO limit as upper bound */
  fileSize: MAX_FILE_SIZES.VIDEO,
  /** Max number of files per request */
  files: 1,
} as const;

// --- Upload Endpoint Handler ---

export interface MediaUploadConfig {
  cloudStorage: CloudStorage;
  virusScanner?: VirusScanner;
}

/**
 * Create the media upload request handler.
 * Expects the file to already be parsed by Multer into req.file.
 *
 * Validation order (Req 13.8):
 * 1. Format validation (MIME type + extension)
 * 2. Size validation (category-specific: 5MB image, 50MB video)
 * 3. Virus scan
 * 4. Upload to cloud storage
 */
export function createMediaUploadHandler(config: MediaUploadConfig) {
  const service = new MediaUploadService({
    cloudStorage: config.cloudStorage,
    virusScanner: config.virusScanner,
  });

  return async (
    request: FastifyRequest<{
      Params: { eventId: string };
    }>,
    reply: FastifyReply
  ): Promise<void> => {
    // Extract tenant context from authenticated request
    const tenantId = (request as unknown as { tenantId?: string }).tenantId;
    if (!tenantId) {
      reply.status(401).send({
        error: 'UNAUTHORIZED',
        message: 'Tenant context tidak ditemukan',
      });
      return;
    }

    const { eventId } = request.params;

    // Get the uploaded file from Multer (attached to request)
    const file = (request as unknown as { file?: MulterFile }).file;
    if (!file) {
      reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: 'File tidak ditemukan dalam request',
      });
      return;
    }

    // Build FileInput from Multer file
    const fileInput: FileInput = {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      buffer: file.buffer,
    };

    // Process upload through service (validates format, size, virus scan, then uploads)
    const result = await service.uploadFile(fileInput, tenantId, eventId);

    if (isMediaUploadError(result)) {
      // Map error codes to HTTP status codes (Req 13.9)
      const statusCode = getHttpStatusForError(result.code);
      reply.status(statusCode).send({
        error: result.code,
        message: result.message,
      });
      return;
    }

    // Success response
    reply.status(201).send({
      data: {
        url: result.url,
        originalname: result.originalname,
        mimetype: result.mimetype,
        size: result.size,
        category: result.category,
      },
    });
  };
}

// --- Helpers ---

/** Multer file interface (subset of Express.Multer.File) */
export interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** Map error codes to HTTP status codes */
function getHttpStatusForError(code: string): number {
  switch (code) {
    case 'UPLOAD_10001': // FILE_TOO_LARGE
      return 413;
    case 'UPLOAD_10002': // INVALID_FILE_FORMAT
      return 415;
    case 'UPLOAD_10003': // MALWARE_DETECTED
      return 422;
    case 'UPLOAD_10004': // UPLOAD_FAILED
      return 500;
    default:
      return 400;
  }
}

/** Extract file extension (lowercase, with dot) */
function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filename.slice(lastDot).toLowerCase();
}
