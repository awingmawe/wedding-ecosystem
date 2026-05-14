/**
 * Cloudflare Worker: Image Resizer for CMS Media
 *
 * Provides on-the-fly responsive image resizing for media uploaded through the CMS.
 * Images are stored in Cloudflare R2 and served through this worker with automatic
 * format negotiation (WebP/AVIF) and responsive sizing.
 *
 * Requirements covered:
 * - 7.3: CDN image optimization (WebP conversion, responsive sizing) for CMS media
 *
 * URL Format:
 *   /media/{path}?w={width}&h={height}&q={quality}&fit={fit}
 *
 * Parameters:
 *   - w (width): Target width in pixels (default: original)
 *   - h (height): Target height in pixels (default: original)
 *   - q (quality): Image quality 1-100 (default: 80)
 *   - fit: Resize fit mode - cover, contain, scale-down, crop (default: scale-down)
 *   - format: Force format - auto, webp, avif, jpeg, png (default: auto)
 *
 * Examples:
 *   /media/gallery/photo1.jpg?w=400          → 400px wide, auto height, WebP if supported
 *   /media/gallery/photo1.jpg?w=800&h=600    → 800x600, cover fit
 *   /media/gallery/photo1.jpg?w=200&q=60     → 200px wide, quality 60
 *
 * Responsive Presets (via `preset` param):
 *   /media/gallery/photo1.jpg?preset=thumbnail  → 150x150, cover
 *   /media/gallery/photo1.jpg?preset=card       → 400x300, cover
 *   /media/gallery/photo1.jpg?preset=hero       → 1200x630, cover
 *   /media/gallery/photo1.jpg?preset=gallery    → 800x600, contain
 */

export interface Env {
  // R2 bucket binding for CMS media storage
  MEDIA_BUCKET: R2Bucket;
  // Allowed origins for CORS
  ALLOWED_ORIGINS: string;
}

// Predefined responsive image presets for common CMS use cases
const PRESETS: Record<string, { width: number; height: number; fit: string; quality: number }> = {
  thumbnail: { width: 150, height: 150, fit: 'cover', quality: 70 },
  card: { width: 400, height: 300, fit: 'cover', quality: 80 },
  gallery: { width: 800, height: 600, fit: 'contain', quality: 80 },
  hero: { width: 1200, height: 630, fit: 'cover', quality: 85 },
  full: { width: 1920, height: 1080, fit: 'scale-down', quality: 85 },
};

// Maximum allowed dimensions to prevent abuse
const MAX_WIDTH = 2560;
const MAX_HEIGHT = 2560;
const MAX_QUALITY = 100;
const MIN_QUALITY = 1;
const DEFAULT_QUALITY = 80;

// Supported image extensions
const SUPPORTED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg']);

/**
 * Determine the best output format based on Accept header
 */
function negotiateFormat(request: Request, forceFormat?: string): string {
  if (forceFormat && forceFormat !== 'auto') {
    return forceFormat;
  }

  const accept = request.headers.get('Accept') || '';

  // Prefer AVIF for browsers that support it (best compression)
  if (accept.includes('image/avif')) {
    return 'avif';
  }

  // Fall back to WebP (wide browser support, good compression)
  if (accept.includes('image/webp')) {
    return 'webp';
  }

  // Default: let Cloudflare decide (usually serves original format)
  return 'auto';
}

/**
 * Parse and validate image transformation parameters from URL
 */
function parseParams(url: URL): {
  width?: number;
  height?: number;
  quality: number;
  fit: string;
  format: string;
} {
  const preset = url.searchParams.get('preset');

  if (preset && PRESETS[preset]) {
    return { ...PRESETS[preset], format: 'auto' };
  }

  const width = url.searchParams.get('w') ? parseInt(url.searchParams.get('w')!, 10) : undefined;
  const height = url.searchParams.get('h') ? parseInt(url.searchParams.get('h')!, 10) : undefined;
  const quality = url.searchParams.get('q')
    ? parseInt(url.searchParams.get('q')!, 10)
    : DEFAULT_QUALITY;
  const fit = url.searchParams.get('fit') || 'scale-down';
  const format = url.searchParams.get('format') || 'auto';

  return {
    width: width ? Math.min(Math.max(1, width), MAX_WIDTH) : undefined,
    height: height ? Math.min(Math.max(1, height), MAX_HEIGHT) : undefined,
    quality: Math.min(Math.max(MIN_QUALITY, quality), MAX_QUALITY),
    fit: ['cover', 'contain', 'scale-down', 'crop'].includes(fit) ? fit : 'scale-down',
    format,
  };
}

/**
 * Get file extension from path
 */
function getExtension(path: string): string {
  const parts = path.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Only handle /media/ paths
    if (!path.startsWith('/media/')) {
      return new Response('Not Found', { status: 404 });
    }

    // Extract the R2 object key (remove /media/ prefix)
    const objectKey = path.replace(/^\/media\//, '');

    // Validate file extension
    const extension = getExtension(objectKey);
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      return new Response('Unsupported image format', { status: 415 });
    }

    // SVGs don't need resizing — serve directly
    if (extension === 'svg') {
      const object = await env.MEDIA_BUCKET.get(objectKey);
      if (!object) {
        return new Response('Image not found', { status: 404 });
      }
      return new Response(object.body, {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }

    // Parse transformation parameters
    const params = parseParams(url);
    const outputFormat = negotiateFormat(request, params.format);

    // Build Cloudflare Image Resizing options
    const imageOptions: RequestInitCfPropertiesImage = {
      quality: params.quality,
      fit: params.fit as 'cover' | 'contain' | 'scale-down' | 'crop',
      metadata: 'none', // Strip EXIF data for privacy and smaller files
    };

    if (params.width) {
      imageOptions.width = params.width;
    }
    if (params.height) {
      imageOptions.height = params.height;
    }
    if (outputFormat !== 'auto') {
      imageOptions.format = outputFormat as 'webp' | 'avif' | 'json';
    }

    // Construct the origin URL for the image in R2
    // The R2 bucket is connected via a custom domain or public bucket URL
    const imageUrl = new URL(path, url.origin);
    // Remove query params to get clean origin URL
    imageUrl.search = '';

    try {
      // Use Cloudflare Image Resizing via fetch with cf.image options
      const response = await fetch(imageUrl.toString(), {
        cf: {
          image: imageOptions,
        },
      });

      if (!response.ok) {
        // If image resizing fails, try serving original from R2
        const object = await env.MEDIA_BUCKET.get(objectKey);
        if (!object) {
          return new Response('Image not found', { status: 404 });
        }
        return new Response(object.body, {
          headers: {
            'Content-Type': object.httpMetadata?.contentType || `image/${extension}`,
            'Cache-Control': 'public, max-age=86400',
          },
        });
      }

      // Clone response and add caching headers
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      headers.set('Vary', 'Accept');

      // Add CORS headers for CMS dashboard access
      const origin = request.headers.get('Origin');
      if (origin && env.ALLOWED_ORIGINS.split(',').some((o) => origin.includes(o.trim()))) {
        headers.set('Access-Control-Allow-Origin', origin);
      }

      return new Response(response.body, {
        status: response.status,
        headers,
      });
    } catch (error) {
      // Fallback: serve original image from R2 without transformation
      const object = await env.MEDIA_BUCKET.get(objectKey);
      if (!object) {
        return new Response('Image not found', { status: 404 });
      }
      return new Response(object.body, {
        headers: {
          'Content-Type': object.httpMetadata?.contentType || `image/${extension}`,
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }
  },
};
