import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MediaUploadService,
  CloudStorage,
  VirusScanner,
  NoOpVirusScanner,
  FileInput,
  isMediaUploadError,
  ALLOWED_IMAGE_MIMES,
  ALLOWED_VIDEO_MIMES,
  MAX_FILE_SIZES,
} from './media-upload.service';
import { ErrorCode } from '@wedding/shared';

// --- Test Helpers ---

function createMockCloudStorage(): CloudStorage {
  return {
    upload: vi.fn().mockResolvedValue('https://storage.example.com/uploaded-file.jpg'),
  };
}

function createMockVirusScanner(): VirusScanner {
  return {
    scan: vi.fn().mockResolvedValue({ clean: true }),
  };
}

function createValidImageFile(overrides: Partial<FileInput> = {}): FileInput {
  return {
    originalname: 'photo.jpg',
    mimetype: 'image/jpeg',
    size: 1024 * 1024, // 1MB
    buffer: Buffer.from('fake-image-data'),
    ...overrides,
  };
}

function createValidVideoFile(overrides: Partial<FileInput> = {}): FileInput {
  return {
    originalname: 'video.mp4',
    mimetype: 'video/mp4',
    size: 10 * 1024 * 1024, // 10MB
    buffer: Buffer.from('fake-video-data'),
    ...overrides,
  };
}

// --- Tests ---

describe('MediaUploadService', () => {
  let service: MediaUploadService;
  let cloudStorage: CloudStorage;
  let virusScanner: VirusScanner;

  beforeEach(() => {
    cloudStorage = createMockCloudStorage();
    virusScanner = createMockVirusScanner();
    service = new MediaUploadService({ cloudStorage, virusScanner });
  });

  describe('constructor', () => {
    it('should use NoOpVirusScanner when no scanner provided', () => {
      const serviceWithoutScanner = new MediaUploadService({ cloudStorage });
      // Should not throw and should work normally
      expect(serviceWithoutScanner).toBeDefined();
    });

    it('should use provided virus scanner', () => {
      const customScanner = createMockVirusScanner();
      const serviceWithScanner = new MediaUploadService({
        cloudStorage,
        virusScanner: customScanner,
      });
      expect(serviceWithScanner).toBeDefined();
    });
  });

  describe('NoOpVirusScanner', () => {
    it('should always return clean result', async () => {
      const scanner = new NoOpVirusScanner();
      const result = await scanner.scan(Buffer.from('data'), 'file.jpg');
      expect(result.clean).toBe(true);
      expect(result.malwareName).toBeUndefined();
    });
  });

  describe('uploadFile - format validation (Req 13.8, 13.9)', () => {
    it('should accept JPEG images', async () => {
      const file = createValidImageFile({ originalname: 'photo.jpeg', mimetype: 'image/jpeg' });
      const result = await service.uploadFile(file, 'tenant-001', 'event-001');
      expect(isMediaUploadError(result)).toBe(false);
    });

    it('should accept PNG images', async () => {
      const file = createValidImageFile({ originalname: 'photo.png', mimetype: 'image/png' });
      const result = await service.uploadFile(file, 'tenant-001', 'event-001');
      expect(isMediaUploadError(result)).toBe(false);
    });

    it('should accept WebP images', async () => {
      const file = createValidImageFile({ originalname: 'photo.webp', mimetype: 'image/webp' });
      const result = await service.uploadFile(file, 'tenant-001', 'event-001');
      expect(isMediaUploadError(result)).toBe(false);
    });

    it('should accept MP4 videos', async () => {
      const file = createValidVideoFile({ originalname: 'video.mp4', mimetype: 'video/mp4' });
      const result = await service.uploadFile(file, 'tenant-001', 'event-001');
      expect(isMediaUploadError(result)).toBe(false);
    });

    it('should accept WebM videos', async () => {
      const file = createValidVideoFile({ originalname: 'video.webm', mimetype: 'video/webm' });
      const result = await service.uploadFile(file, 'tenant-001', 'event-001');
      expect(isMediaUploadError(result)).toBe(false);
    });

    it('should reject unsupported MIME types with specific error (Req 13.9)', async () => {
      const file = createValidImageFile({ originalname: 'doc.pdf', mimetype: 'application/pdf' });
      const result = await service.uploadFile(file, 'tenant-001', 'event-001');

      expect(isMediaUploadError(result)).toBe(true);
      if (isMediaUploadError(result)) {
        expect(result.code).toBe(ErrorCode.INVALID_FILE_FORMAT);
        expect(result.message).toContain('Format file tidak didukung');
        expect(result.message).toContain('application/pdf');
        expect(result.message).toContain('JPEG, PNG, WebP');
        expect(result.message).toContain('MP4, WebM');
      }
    });

    it('should reject GIF images', async () => {
      const file = createValidImageFile({ originalname: 'anim.gif', mimetype: 'image/gif' });
      const result = await service.uploadFile(file, 'tenant-001', 'event-001');

      expect(isMediaUploadError(result)).toBe(true);
      if (isMediaUploadError(result)) {
        expect(result.code).toBe(ErrorCode.INVALID_FILE_FORMAT);
      }
    });

    it('should reject files with mismatched extension and MIME type', async () => {
      const file = createValidImageFile({
        originalname: 'photo.png',
        mimetype: 'image/jpeg', // MIME says JPEG but extension is PNG
      });
      const result = await service.uploadFile(file, 'tenant-001', 'event-001');

      expect(isMediaUploadError(result)).toBe(true);
      if (isMediaUploadError(result)) {
        expect(result.code).toBe(ErrorCode.INVALID_FILE_FORMAT);
        expect(result.message).toContain('Ekstensi file tidak sesuai');
      }
    });

    it('should reject files with no extension', async () => {
      const file = createValidImageFile({
        originalname: 'noextension',
        mimetype: 'image/jpeg',
      });
      const result = await service.uploadFile(file, 'tenant-001', 'event-001');

      expect(isMediaUploadError(result)).toBe(true);
      if (isMediaUploadError(result)) {
        expect(result.code).toBe(ErrorCode.INVALID_FILE_FORMAT);
      }
    });
  });

  describe('uploadFile - size validation (Req 5.4, 13.8, 13.9)', () => {
    it('should accept images up to 5MB', async () => {
      const file = createValidImageFile({ size: MAX_FILE_SIZES.IMAGE }); // exactly 5MB
      const result = await service.uploadFile(file, 'tenant-001', 'event-001');
      expect(isMediaUploadError(result)).toBe(false);
    });

    it('should reject images over 5MB with specific error (Req 5.5, 13.9)', async () => {
      const file = createValidImageFile({ size: MAX_FILE_SIZES.IMAGE + 1 }); // 5MB + 1 byte
      const result = await service.uploadFile(file, 'tenant-001', 'event-001');

      expect(isMediaUploadError(result)).toBe(true);
      if (isMediaUploadError(result)) {
        expect(result.code).toBe(ErrorCode.FILE_TOO_LARGE);
        expect(result.message).toContain('5MB');
        expect(result.message).toContain('Ukuran file melebihi batas maksimum');
      }
    });

    it('should accept videos up to 50MB', async () => {
      const file = createValidVideoFile({ size: MAX_FILE_SIZES.VIDEO }); // exactly 50MB
      const result = await service.uploadFile(file, 'tenant-001', 'event-001');
      expect(isMediaUploadError(result)).toBe(false);
    });

    it('should reject videos over 50MB with specific error (Req 5.5, 13.9)', async () => {
      const file = createValidVideoFile({ size: MAX_FILE_SIZES.VIDEO + 1 }); // 50MB + 1 byte
      const result = await service.uploadFile(file, 'tenant-001', 'event-001');

      expect(isMediaUploadError(result)).toBe(true);
      if (isMediaUploadError(result)) {
        expect(result.code).toBe(ErrorCode.FILE_TOO_LARGE);
        expect(result.message).toContain('50MB');
      }
    });

    it('should include actual file size in error message', async () => {
      const file = createValidImageFile({ size: 6 * 1024 * 1024 }); // 6MB
      const result = await service.uploadFile(file, 'tenant-001', 'event-001');

      expect(isMediaUploadError(result)).toBe(true);
      if (isMediaUploadError(result)) {
        expect(result.message).toContain('6.0MB');
      }
    });
  });

  describe('uploadFile - virus scan (Req 13.8, 13.9)', () => {
    it('should pass clean files through virus scan', async () => {
      vi.mocked(virusScanner.scan).mockResolvedValue({ clean: true });
      const file = createValidImageFile();
      const result = await service.uploadFile(file, 'tenant-001', 'event-001');

      expect(isMediaUploadError(result)).toBe(false);
      expect(virusScanner.scan).toHaveBeenCalledWith(file.buffer, file.originalname);
    });

    it('should reject files with malware detected (Req 13.9)', async () => {
      vi.mocked(virusScanner.scan).mockResolvedValue({
        clean: false,
        malwareName: 'Trojan.GenericKD',
      });
      const file = createValidImageFile();
      const result = await service.uploadFile(file, 'tenant-001', 'event-001');

      expect(isMediaUploadError(result)).toBe(true);
      if (isMediaUploadError(result)) {
        expect(result.code).toBe(ErrorCode.MALWARE_DETECTED);
        expect(result.message).toContain('malware');
        expect(result.message).toContain('Trojan.GenericKD');
      }
    });

    it('should return generic malware message when no name provided', async () => {
      vi.mocked(virusScanner.scan).mockResolvedValue({ clean: false });
      const file = createValidImageFile();
      const result = await service.uploadFile(file, 'tenant-001', 'event-001');

      expect(isMediaUploadError(result)).toBe(true);
      if (isMediaUploadError(result)) {
        expect(result.code).toBe(ErrorCode.MALWARE_DETECTED);
        expect(result.message).toBe('File terdeteksi mengandung malware');
      }
    });

    it('should not call virus scanner if format validation fails', async () => {
      const file = createValidImageFile({ mimetype: 'application/pdf', originalname: 'doc.pdf' });
      await service.uploadFile(file, 'tenant-001', 'event-001');

      expect(virusScanner.scan).not.toHaveBeenCalled();
    });

    it('should not call virus scanner if size validation fails', async () => {
      const file = createValidImageFile({ size: MAX_FILE_SIZES.IMAGE + 1 });
      await service.uploadFile(file, 'tenant-001', 'event-001');

      expect(virusScanner.scan).not.toHaveBeenCalled();
    });
  });

  describe('uploadFile - cloud storage upload', () => {
    it('should upload file to cloud storage on success', async () => {
      const file = createValidImageFile();
      const result = await service.uploadFile(file, 'tenant-001', 'event-001');

      expect(isMediaUploadError(result)).toBe(false);
      if (!isMediaUploadError(result)) {
        expect(result.url).toBe('https://storage.example.com/uploaded-file.jpg');
        expect(result.originalname).toBe('photo.jpg');
        expect(result.mimetype).toBe('image/jpeg');
        expect(result.size).toBe(1024 * 1024);
        expect(result.category).toBe('image');
      }

      expect(cloudStorage.upload).toHaveBeenCalledWith(
        file.buffer,
        expect.stringContaining('tenant-001/event-001/media/'),
        'image/jpeg'
      );
    });

    it('should return upload error when cloud storage fails', async () => {
      vi.mocked(cloudStorage.upload).mockRejectedValue(new Error('Network error'));
      const file = createValidImageFile();
      const result = await service.uploadFile(file, 'tenant-001', 'event-001');

      expect(isMediaUploadError(result)).toBe(true);
      if (isMediaUploadError(result)) {
        expect(result.code).toBe(ErrorCode.UPLOAD_FAILED);
        expect(result.message).toContain('Gagal mengunggah file');
      }
    });

    it('should categorize video files correctly', async () => {
      const file = createValidVideoFile();
      const result = await service.uploadFile(file, 'tenant-001', 'event-001');

      expect(isMediaUploadError(result)).toBe(false);
      if (!isMediaUploadError(result)) {
        expect(result.category).toBe('video');
      }
    });
  });

  describe('validateFormat', () => {
    it('should return null for all allowed image MIME types', () => {
      for (const mime of ALLOWED_IMAGE_MIMES) {
        const ext = mime === 'image/jpeg' ? '.jpg' : `.${mime.split('/')[1]}`;
        const file = createValidImageFile({
          originalname: `file${ext}`,
          mimetype: mime,
        });
        expect(service.validateFormat(file)).toBeNull();
      }
    });

    it('should return null for all allowed video MIME types', () => {
      for (const mime of ALLOWED_VIDEO_MIMES) {
        const ext = `.${mime.split('/')[1]}`;
        const file = createValidVideoFile({
          originalname: `file${ext}`,
          mimetype: mime,
        });
        expect(service.validateFormat(file)).toBeNull();
      }
    });
  });

  describe('validateSize', () => {
    it('should return null for images within limit', () => {
      const file = createValidImageFile({ size: 4 * 1024 * 1024 });
      expect(service.validateSize(file, 'image')).toBeNull();
    });

    it('should return null for videos within limit', () => {
      const file = createValidVideoFile({ size: 40 * 1024 * 1024 });
      expect(service.validateSize(file, 'video')).toBeNull();
    });

    it('should return error for images exceeding limit', () => {
      const file = createValidImageFile({ size: 6 * 1024 * 1024 });
      const error = service.validateSize(file, 'image');
      expect(error).not.toBeNull();
      expect(error!.code).toBe(ErrorCode.FILE_TOO_LARGE);
    });

    it('should return error for videos exceeding limit', () => {
      const file = createValidVideoFile({ size: 51 * 1024 * 1024 });
      const error = service.validateSize(file, 'video');
      expect(error).not.toBeNull();
      expect(error!.code).toBe(ErrorCode.FILE_TOO_LARGE);
    });
  });

  describe('getMediaCategory', () => {
    it('should return image for image MIME types', () => {
      expect(service.getMediaCategory('image/jpeg')).toBe('image');
      expect(service.getMediaCategory('image/png')).toBe('image');
      expect(service.getMediaCategory('image/webp')).toBe('image');
    });

    it('should return video for video MIME types', () => {
      expect(service.getMediaCategory('video/mp4')).toBe('video');
      expect(service.getMediaCategory('video/webm')).toBe('video');
    });
  });

  describe('generateStorageKey', () => {
    it('should include tenant ID, event ID, and filename', () => {
      const key = service.generateStorageKey('tenant-001', 'event-001', 'photo.jpg');
      expect(key).toContain('tenant-001');
      expect(key).toContain('event-001');
      expect(key).toContain('media/');
      expect(key).toContain('photo.jpg');
    });

    it('should sanitize special characters in filename', () => {
      const key = service.generateStorageKey('tenant-001', 'event-001', 'my photo (1).jpg');
      expect(key).not.toContain(' ');
      expect(key).not.toContain('(');
      expect(key).not.toContain(')');
      expect(key).toContain('my_photo__1_.jpg');
    });

    it('should include timestamp for uniqueness', () => {
      const key1 = service.generateStorageKey('tenant-001', 'event-001', 'photo.jpg');
      // Key should contain a numeric timestamp
      expect(key1).toMatch(/\/\d+-photo\.jpg$/);
    });
  });

  describe('getFileExtension', () => {
    it('should extract extension with dot', () => {
      expect(service.getFileExtension('photo.jpg')).toBe('.jpg');
      expect(service.getFileExtension('video.mp4')).toBe('.mp4');
      expect(service.getFileExtension('image.PNG')).toBe('.png');
    });

    it('should handle multiple dots in filename', () => {
      expect(service.getFileExtension('my.photo.jpeg')).toBe('.jpeg');
    });

    it('should return empty string for no extension', () => {
      expect(service.getFileExtension('noextension')).toBe('');
    });
  });

  describe('formatFileSize', () => {
    it('should format bytes', () => {
      expect(service.formatFileSize(500)).toBe('500B');
    });

    it('should format kilobytes', () => {
      expect(service.formatFileSize(1536)).toBe('1.5KB');
    });

    it('should format megabytes', () => {
      expect(service.formatFileSize(5 * 1024 * 1024)).toBe('5.0MB');
      expect(service.formatFileSize(6 * 1024 * 1024)).toBe('6.0MB');
    });
  });

  describe('isMediaUploadError type guard', () => {
    it('should return true for error objects', () => {
      expect(
        isMediaUploadError({ code: ErrorCode.FILE_TOO_LARGE, message: 'Too large' })
      ).toBe(true);
    });

    it('should return false for upload results', () => {
      expect(
        isMediaUploadError({
          url: 'https://example.com/file.jpg',
          originalname: 'file.jpg',
          mimetype: 'image/jpeg',
          size: 1024,
          category: 'image',
        })
      ).toBe(false);
    });
  });
});
