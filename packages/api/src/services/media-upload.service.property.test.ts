import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { ErrorCode } from '@wedding/shared';
import {
  MediaUploadService,
  ALLOWED_IMAGE_MIMES,
  ALLOWED_VIDEO_MIMES,
  ALLOWED_MIMES,
  MAX_FILE_SIZES,
  EXTENSION_MIME_MAP,
  isMediaUploadError,
} from './media-upload.service';
import type {
  FileInput,
  CloudStorage,
  VirusScanner,
  VirusScanResult,
} from './media-upload.service';

// --- Test Helpers ---

/** Creates a mock cloud storage that always succeeds */
function createMockCloudStorage(): CloudStorage {
  return {
    upload: async (_buffer, key, _mimetype) => `https://storage.example.com/${key}`,
  };
}

/** Creates a virus scanner that always reports files as clean */
function createCleanVirusScanner(): VirusScanner {
  return {
    scan: async () => ({ clean: true }),
  };
}

/** Creates a virus scanner that always detects malware */
function createMalwareVirusScanner(malwareName?: string): VirusScanner {
  return {
    scan: async (): Promise<VirusScanResult> => ({
      clean: false,
      malwareName: malwareName ?? 'TestMalware',
    }),
  };
}

// --- Arbitraries ---

/** Valid MIME type to file extension mapping */
const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
};

/** Generates a valid image MIME type */
const arbImageMime = fc.constantFrom(...ALLOWED_IMAGE_MIMES);

/** Generates a valid video MIME type */
const arbVideoMime = fc.constantFrom(...ALLOWED_VIDEO_MIMES);

/** Generates any valid MIME type (image or video) */
const arbValidMime = fc.constantFrom(...ALLOWED_MIMES);

/** Generates an invalid MIME type that is NOT in the allowed list */
const arbInvalidMime = fc.constantFrom(
  'application/pdf',
  'text/plain',
  'image/gif',
  'image/bmp',
  'image/tiff',
  'video/avi',
  'video/mkv',
  'audio/mp3',
  'application/zip',
  'application/octet-stream'
);

/** Generates a file size that exceeds the image limit (> 5MB) */
const arbOversizedImageSize = fc.integer({
  min: MAX_FILE_SIZES.IMAGE + 1,
  max: MAX_FILE_SIZES.IMAGE * 3,
});

/** Generates a file size that exceeds the video limit (> 50MB) */
const arbOversizedVideoSize = fc.integer({
  min: MAX_FILE_SIZES.VIDEO + 1,
  max: MAX_FILE_SIZES.VIDEO * 2,
});

/** Generates a valid image file size (1 byte to 5MB) */
const arbValidImageSize = fc.integer({ min: 1, max: MAX_FILE_SIZES.IMAGE });

/** Generates a valid video file size (1 byte to 50MB) */
const arbValidVideoSize = fc.integer({ min: 1, max: MAX_FILE_SIZES.VIDEO });

/** Generates a valid filename with the correct extension for a given MIME type */
function arbFilenameForMime(mime: string): fc.Arbitrary<string> {
  const ext = MIME_TO_EXTENSION[mime] || '.bin';
  return fc
    .stringMatching(/^[a-zA-Z0-9_-]{1,20}$/)
    .map((name) => `${name}${ext}`);
}

/** Generates a valid file input for an image */
const arbValidImageFile = arbImageMime.chain((mime) =>
  fc.record({
    originalname: arbFilenameForMime(mime),
    mimetype: fc.constant(mime),
    size: arbValidImageSize,
    buffer: fc.constant(Buffer.from('fake-image-data')),
  })
);

/** Generates a valid file input for a video */
const arbValidVideoFile = arbVideoMime.chain((mime) =>
  fc.record({
    originalname: arbFilenameForMime(mime),
    mimetype: fc.constant(mime),
    size: arbValidVideoSize,
    buffer: fc.constant(Buffer.from('fake-video-data')),
  })
);

/** Generates any valid file input (image or video) */
const arbValidFile = fc.oneof(arbValidImageFile, arbValidVideoFile);

/** Generates a UUID-like tenant ID */
const arbTenantId = fc.uuid();

/** Generates a UUID-like event ID */
const arbEventId = fc.uuid();

// --- Property Tests ---

describe('Property 22: File Upload Explicit Validation', () => {
  /**
   * **Validates: Requirements 13.8, 13.9**
   *
   * For any file upload attempt, the system SHALL explicitly validate file size
   * (max 10MB general, 5MB image, 50MB video) and file format (JPEG, PNG, WebP
   * for images; MP4, WebM for video) before processing, and SHALL return specific
   * error messages for each validation failure type.
   */

  describe('Files with unsupported formats are always rejected with a specific format error', () => {
    it('rejects files with invalid MIME types with INVALID_FILE_FORMAT error code', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbInvalidMime,
          fc.integer({ min: 1, max: MAX_FILE_SIZES.GENERAL }),
          arbTenantId,
          arbEventId,
          async (invalidMime, size, tenantId, eventId) => {
            const service = new MediaUploadService({
              cloudStorage: createMockCloudStorage(),
              virusScanner: createCleanVirusScanner(),
            });

            const file: FileInput = {
              originalname: `testfile.bin`,
              mimetype: invalidMime,
              size,
              buffer: Buffer.alloc(Math.min(size, 100)),
            };

            const result = await service.uploadFile(file, tenantId, eventId);

            // Must be rejected
            expect(isMediaUploadError(result)).toBe(true);
            if (isMediaUploadError(result)) {
              // Must have the specific format error code
              expect(result.code).toBe(ErrorCode.INVALID_FILE_FORMAT);
              // Error message must mention the unsupported format
              expect(result.message).toContain('Format file tidak didukung');
              // Error message must mention supported formats
              expect(result.message).toMatch(/JPEG|PNG|WebP|MP4|WebM/);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Files exceeding size limits are always rejected with a specific size error', () => {
    it('rejects oversized image files with FILE_TOO_LARGE error code', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbImageMime,
          arbOversizedImageSize,
          arbTenantId,
          arbEventId,
          async (mime, oversizedBytes, tenantId, eventId) => {
            const service = new MediaUploadService({
              cloudStorage: createMockCloudStorage(),
              virusScanner: createCleanVirusScanner(),
            });

            const ext = MIME_TO_EXTENSION[mime];
            const file: FileInput = {
              originalname: `photo${ext}`,
              mimetype: mime,
              size: oversizedBytes,
              buffer: Buffer.alloc(100),
            };

            const result = await service.uploadFile(file, tenantId, eventId);

            // Must be rejected
            expect(isMediaUploadError(result)).toBe(true);
            if (isMediaUploadError(result)) {
              // Must have the specific size error code
              expect(result.code).toBe(ErrorCode.FILE_TOO_LARGE);
              // Error message must mention size limit
              expect(result.message).toContain('Ukuran file melebihi batas');
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('rejects oversized video files with FILE_TOO_LARGE error code', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbVideoMime,
          arbOversizedVideoSize,
          arbTenantId,
          arbEventId,
          async (mime, oversizedBytes, tenantId, eventId) => {
            const service = new MediaUploadService({
              cloudStorage: createMockCloudStorage(),
              virusScanner: createCleanVirusScanner(),
            });

            const ext = MIME_TO_EXTENSION[mime];
            const file: FileInput = {
              originalname: `video${ext}`,
              mimetype: mime,
              size: oversizedBytes,
              buffer: Buffer.alloc(100),
            };

            const result = await service.uploadFile(file, tenantId, eventId);

            // Must be rejected
            expect(isMediaUploadError(result)).toBe(true);
            if (isMediaUploadError(result)) {
              // Must have the specific size error code
              expect(result.code).toBe(ErrorCode.FILE_TOO_LARGE);
              // Error message must mention size limit
              expect(result.message).toContain('Ukuran file melebihi batas');
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Valid files (correct size + correct format) pass validation', () => {
    it('accepts valid image files and returns upload result', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbValidImageFile,
          arbTenantId,
          arbEventId,
          async (file, tenantId, eventId) => {
            const service = new MediaUploadService({
              cloudStorage: createMockCloudStorage(),
              virusScanner: createCleanVirusScanner(),
            });

            const result = await service.uploadFile(file, tenantId, eventId);

            // Must succeed
            expect(isMediaUploadError(result)).toBe(false);
            if (!isMediaUploadError(result)) {
              expect(result.url).toBeDefined();
              expect(result.category).toBe('image');
              expect(result.mimetype).toBe(file.mimetype);
              expect(result.size).toBe(file.size);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('accepts valid video files and returns upload result', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbValidVideoFile,
          arbTenantId,
          arbEventId,
          async (file, tenantId, eventId) => {
            const service = new MediaUploadService({
              cloudStorage: createMockCloudStorage(),
              virusScanner: createCleanVirusScanner(),
            });

            const result = await service.uploadFile(file, tenantId, eventId);

            // Must succeed
            expect(isMediaUploadError(result)).toBe(false);
            if (!isMediaUploadError(result)) {
              expect(result.url).toBeDefined();
              expect(result.category).toBe('video');
              expect(result.mimetype).toBe(file.mimetype);
              expect(result.size).toBe(file.size);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Error messages are specific to the failure type', () => {
    it('format errors and size errors produce distinct error codes', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbInvalidMime,
          arbImageMime,
          arbOversizedImageSize,
          arbTenantId,
          arbEventId,
          async (invalidMime, validMime, oversizedBytes, tenantId, eventId) => {
            const service = new MediaUploadService({
              cloudStorage: createMockCloudStorage(),
              virusScanner: createCleanVirusScanner(),
            });

            // File with invalid format
            const formatFile: FileInput = {
              originalname: 'test.bin',
              mimetype: invalidMime,
              size: 1024,
              buffer: Buffer.alloc(100),
            };

            // File with valid format but oversized
            const ext = MIME_TO_EXTENSION[validMime];
            const sizeFile: FileInput = {
              originalname: `photo${ext}`,
              mimetype: validMime,
              size: oversizedBytes,
              buffer: Buffer.alloc(100),
            };

            const formatResult = await service.uploadFile(formatFile, tenantId, eventId);
            const sizeResult = await service.uploadFile(sizeFile, tenantId, eventId);

            // Both must be errors
            expect(isMediaUploadError(formatResult)).toBe(true);
            expect(isMediaUploadError(sizeResult)).toBe(true);

            if (isMediaUploadError(formatResult) && isMediaUploadError(sizeResult)) {
              // Error codes must be distinct
              expect(formatResult.code).toBe(ErrorCode.INVALID_FILE_FORMAT);
              expect(sizeResult.code).toBe(ErrorCode.FILE_TOO_LARGE);
              expect(formatResult.code).not.toBe(sizeResult.code);

              // Messages must be different
              expect(formatResult.message).not.toBe(sizeResult.message);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('malware detection produces a distinct MALWARE_DETECTED error code', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbValidFile,
          arbTenantId,
          arbEventId,
          fc.string({ minLength: 3, maxLength: 20 }),
          async (file, tenantId, eventId, malwareName) => {
            const service = new MediaUploadService({
              cloudStorage: createMockCloudStorage(),
              virusScanner: createMalwareVirusScanner(malwareName),
            });

            const result = await service.uploadFile(file, tenantId, eventId);

            // Must be rejected with malware error
            expect(isMediaUploadError(result)).toBe(true);
            if (isMediaUploadError(result)) {
              expect(result.code).toBe(ErrorCode.MALWARE_DETECTED);
              // Error message must mention malware
              expect(result.message).toContain('malware');
              // Error message must include the malware name
              expect(result.message).toContain(malwareName);
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('all three error types (format, size, malware) have unique error codes', async () => {
      // This is a deterministic check that the error codes are distinct
      const errorCodes = [
        ErrorCode.INVALID_FILE_FORMAT,
        ErrorCode.FILE_TOO_LARGE,
        ErrorCode.MALWARE_DETECTED,
      ];
      const uniqueCodes = new Set(errorCodes);
      expect(uniqueCodes.size).toBe(3);
    });
  });

  describe('Format validation happens before size validation', () => {
    it('invalid format is rejected even if size is also invalid', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbInvalidMime,
          arbOversizedImageSize,
          arbTenantId,
          arbEventId,
          async (invalidMime, oversizedBytes, tenantId, eventId) => {
            const service = new MediaUploadService({
              cloudStorage: createMockCloudStorage(),
              virusScanner: createCleanVirusScanner(),
            });

            // File with BOTH invalid format AND oversized
            const file: FileInput = {
              originalname: 'test.bin',
              mimetype: invalidMime,
              size: oversizedBytes,
              buffer: Buffer.alloc(100),
            };

            const result = await service.uploadFile(file, tenantId, eventId);

            // Must be rejected with format error (format is checked first per Req 13.8)
            expect(isMediaUploadError(result)).toBe(true);
            if (isMediaUploadError(result)) {
              expect(result.code).toBe(ErrorCode.INVALID_FILE_FORMAT);
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });
});
