import { describe, it, expect } from 'vitest';
import { validateMediaFile } from './cms';

// Helper to create a mock File with a specified size without allocating actual bytes
function createMockFile(name: string, size: number, type: string): File {
  const file = new File([''], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('validateMediaFile', () => {
  describe('image validation', () => {
    it('accepts valid JPEG file within size limit', () => {
      const file = createMockFile('photo.jpg', 1024 * 1024, 'image/jpeg'); // 1MB
      expect(validateMediaFile(file, 'image')).toBeNull();
    });

    it('accepts valid PNG file within size limit', () => {
      const file = createMockFile('photo.png', 2 * 1024 * 1024, 'image/png'); // 2MB
      expect(validateMediaFile(file, 'image')).toBeNull();
    });

    it('accepts valid WebP file within size limit', () => {
      const file = createMockFile('photo.webp', 3 * 1024 * 1024, 'image/webp'); // 3MB
      expect(validateMediaFile(file, 'image')).toBeNull();
    });

    it('rejects unsupported image format', () => {
      const file = createMockFile('photo.gif', 1024, 'image/gif');
      const result = validateMediaFile(file, 'image');
      expect(result).not.toBeNull();
      expect(result!.type).toBe('format');
      expect(result!.message).toContain('JPEG, PNG, atau WebP');
    });

    it('rejects image exceeding 5MB size limit', () => {
      const file = createMockFile('large.jpg', 6 * 1024 * 1024, 'image/jpeg'); // 6MB
      const result = validateMediaFile(file, 'image');
      expect(result).not.toBeNull();
      expect(result!.type).toBe('size');
      expect(result!.message).toContain('5MB');
    });

    it('accepts image at exactly 5MB', () => {
      const file = createMockFile('exact.jpg', 5 * 1024 * 1024, 'image/jpeg'); // 5MB
      expect(validateMediaFile(file, 'image')).toBeNull();
    });
  });

  describe('video validation', () => {
    it('accepts valid MP4 file within size limit', () => {
      const file = createMockFile('video.mp4', 10 * 1024 * 1024, 'video/mp4'); // 10MB
      expect(validateMediaFile(file, 'video')).toBeNull();
    });

    it('rejects unsupported video format', () => {
      const file = createMockFile('video.avi', 1024, 'video/avi');
      const result = validateMediaFile(file, 'video');
      expect(result).not.toBeNull();
      expect(result!.type).toBe('format');
      expect(result!.message).toContain('MP4');
    });

    it('rejects video exceeding 50MB size limit', () => {
      const file = createMockFile('large.mp4', 51 * 1024 * 1024, 'video/mp4'); // 51MB
      const result = validateMediaFile(file, 'video');
      expect(result).not.toBeNull();
      expect(result!.type).toBe('size');
      expect(result!.message).toContain('50MB');
    });

    it('accepts video at exactly 50MB', () => {
      const file = createMockFile('exact.mp4', 50 * 1024 * 1024, 'video/mp4'); // 50MB
      expect(validateMediaFile(file, 'video')).toBeNull();
    });
  });
});
