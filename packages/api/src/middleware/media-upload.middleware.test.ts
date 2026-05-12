import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMediaFileFilter,
  createMediaUploadHandler,
  MULTER_LIMITS,
  MulterFile,
} from './media-upload.middleware';
import type { CloudStorage, VirusScanner } from '../services/media-upload.service';
import { MAX_FILE_SIZES } from '../services/media-upload.service';

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

function createMockRequest(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: 'tenant-001',
    params: { eventId: 'event-001' },
    file: {
      fieldname: 'file',
      originalname: 'photo.jpg',
      encoding: '7bit',
      mimetype: 'image/jpeg',
      size: 1024 * 1024,
      buffer: Buffer.from('fake-image-data'),
    } as MulterFile,
    ...overrides,
  };
}

function createMockReply() {
  const reply = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      reply.statusCode = code;
      return reply;
    },
    send(data: unknown) {
      reply.body = data;
      return reply;
    },
  };
  return reply;
}

// --- Tests ---

describe('Media Upload Middleware', () => {
  describe('createMediaFileFilter', () => {
    const fileFilter = createMediaFileFilter();

    it('should accept valid JPEG files', () => {
      const cb = vi.fn();
      fileFilter(null, { mimetype: 'image/jpeg', originalname: 'photo.jpg' }, cb);
      expect(cb).toHaveBeenCalledWith(null, true);
    });

    it('should accept valid PNG files', () => {
      const cb = vi.fn();
      fileFilter(null, { mimetype: 'image/png', originalname: 'photo.png' }, cb);
      expect(cb).toHaveBeenCalledWith(null, true);
    });

    it('should accept valid WebP files', () => {
      const cb = vi.fn();
      fileFilter(null, { mimetype: 'image/webp', originalname: 'photo.webp' }, cb);
      expect(cb).toHaveBeenCalledWith(null, true);
    });

    it('should accept valid MP4 files', () => {
      const cb = vi.fn();
      fileFilter(null, { mimetype: 'video/mp4', originalname: 'video.mp4' }, cb);
      expect(cb).toHaveBeenCalledWith(null, true);
    });

    it('should accept valid WebM files', () => {
      const cb = vi.fn();
      fileFilter(null, { mimetype: 'video/webm', originalname: 'video.webm' }, cb);
      expect(cb).toHaveBeenCalledWith(null, true);
    });

    it('should reject unsupported MIME types', () => {
      const cb = vi.fn();
      fileFilter(null, { mimetype: 'application/pdf', originalname: 'doc.pdf' }, cb);
      expect(cb).toHaveBeenCalledWith(expect.any(Error), false);
      const error = cb.mock.calls[0][0] as Error;
      expect(error.message).toContain('Format file tidak didukung');
      expect(error.message).toContain('application/pdf');
    });

    it('should reject GIF images', () => {
      const cb = vi.fn();
      fileFilter(null, { mimetype: 'image/gif', originalname: 'anim.gif' }, cb);
      expect(cb).toHaveBeenCalledWith(expect.any(Error), false);
    });

    it('should reject files with mismatched extension and MIME type', () => {
      const cb = vi.fn();
      fileFilter(null, { mimetype: 'image/jpeg', originalname: 'photo.png' }, cb);
      expect(cb).toHaveBeenCalledWith(expect.any(Error), false);
      const error = cb.mock.calls[0][0] as Error;
      expect(error.message).toContain('Ekstensi file tidak sesuai');
    });

    it('should reject files with no extension', () => {
      const cb = vi.fn();
      fileFilter(null, { mimetype: 'image/jpeg', originalname: 'noextension' }, cb);
      expect(cb).toHaveBeenCalledWith(expect.any(Error), false);
    });

    it('should accept .jpeg extension for image/jpeg', () => {
      const cb = vi.fn();
      fileFilter(null, { mimetype: 'image/jpeg', originalname: 'photo.jpeg' }, cb);
      expect(cb).toHaveBeenCalledWith(null, true);
    });
  });

  describe('MULTER_LIMITS', () => {
    it('should set fileSize to VIDEO max (50MB) as upper bound', () => {
      expect(MULTER_LIMITS.fileSize).toBe(MAX_FILE_SIZES.VIDEO);
    });

    it('should limit to 1 file per request', () => {
      expect(MULTER_LIMITS.files).toBe(1);
    });
  });

  describe('createMediaUploadHandler', () => {
    let cloudStorage: CloudStorage;
    let virusScanner: VirusScanner;
    let handler: ReturnType<typeof createMediaUploadHandler>;

    beforeEach(() => {
      cloudStorage = createMockCloudStorage();
      virusScanner = createMockVirusScanner();
      handler = createMediaUploadHandler({ cloudStorage, virusScanner });
    });

    it('should return 401 when tenant context is missing', async () => {
      const request = createMockRequest({ tenantId: undefined });
      const reply = createMockReply();

      await handler(request as never, reply as never);

      expect(reply.statusCode).toBe(401);
      expect((reply.body as { message: string }).message).toContain('Tenant context');
    });

    it('should return 400 when no file is provided', async () => {
      const request = createMockRequest({ file: undefined });
      const reply = createMockReply();

      await handler(request as never, reply as never);

      expect(reply.statusCode).toBe(400);
      expect((reply.body as { message: string }).message).toContain('File tidak ditemukan');
    });

    it('should return 201 with upload result on success', async () => {
      const request = createMockRequest();
      const reply = createMockReply();

      await handler(request as never, reply as never);

      expect(reply.statusCode).toBe(201);
      const body = reply.body as { data: { url: string; category: string } };
      expect(body.data.url).toBe('https://storage.example.com/uploaded-file.jpg');
      expect(body.data.category).toBe('image');
    });

    it('should return 415 for unsupported format', async () => {
      const request = createMockRequest({
        file: {
          fieldname: 'file',
          originalname: 'doc.pdf',
          encoding: '7bit',
          mimetype: 'application/pdf',
          size: 1024,
          buffer: Buffer.from('fake-data'),
        },
      });
      const reply = createMockReply();

      await handler(request as never, reply as never);

      expect(reply.statusCode).toBe(415);
      expect((reply.body as { error: string }).error).toBe('UPLOAD_10002');
    });

    it('should return 413 for file too large', async () => {
      const request = createMockRequest({
        file: {
          fieldname: 'file',
          originalname: 'photo.jpg',
          encoding: '7bit',
          mimetype: 'image/jpeg',
          size: MAX_FILE_SIZES.IMAGE + 1,
          buffer: Buffer.from('fake-data'),
        },
      });
      const reply = createMockReply();

      await handler(request as never, reply as never);

      expect(reply.statusCode).toBe(413);
      expect((reply.body as { error: string }).error).toBe('UPLOAD_10001');
    });

    it('should return 422 for malware detected', async () => {
      vi.mocked(virusScanner.scan).mockResolvedValue({
        clean: false,
        malwareName: 'Trojan.Test',
      });
      const request = createMockRequest();
      const reply = createMockReply();

      await handler(request as never, reply as never);

      expect(reply.statusCode).toBe(422);
      expect((reply.body as { error: string }).error).toBe('UPLOAD_10003');
      expect((reply.body as { message: string }).message).toContain('Trojan.Test');
    });

    it('should return 500 when cloud storage fails', async () => {
      vi.mocked(cloudStorage.upload).mockRejectedValue(new Error('Network error'));
      const request = createMockRequest();
      const reply = createMockReply();

      await handler(request as never, reply as never);

      expect(reply.statusCode).toBe(500);
      expect((reply.body as { error: string }).error).toBe('UPLOAD_10004');
    });

    it('should pass correct parameters to cloud storage', async () => {
      const request = createMockRequest();
      const reply = createMockReply();

      await handler(request as never, reply as never);

      expect(cloudStorage.upload).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.stringContaining('tenant-001/event-001/media/'),
        'image/jpeg'
      );
    });

    it('should handle video uploads correctly', async () => {
      const request = createMockRequest({
        file: {
          fieldname: 'file',
          originalname: 'video.mp4',
          encoding: '7bit',
          mimetype: 'video/mp4',
          size: 10 * 1024 * 1024,
          buffer: Buffer.from('fake-video-data'),
        },
      });
      const reply = createMockReply();

      await handler(request as never, reply as never);

      expect(reply.statusCode).toBe(201);
      const body = reply.body as { data: { category: string } };
      expect(body.data.category).toBe('video');
    });
  });
});
