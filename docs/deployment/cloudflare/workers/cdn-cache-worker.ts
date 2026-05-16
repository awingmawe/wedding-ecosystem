/**
 * Cloudflare Worker: CDN Cache Control Headers
 *
 * This worker enforces cache-control headers at the edge for all responses.
 * It complements zone-level cache rules by ensuring correct Cache-Control
 * headers are set on responses before they reach the browser.
 *
 * Requirements covered:
 * - 7.2: Immutable assets (hashed filenames) with max-age 1 year
 * - 7.2: HTML/API responses with max-age 60s or no-cache
 * - 7.4: Brotli compression with Gzip fallback (handled by zone settings)
 * - 7.7: Origin shield (Smart Tiered Cache, configured at zone level)
 *
 * Deploy via Cloudflare Workers (wrangler) or Cloudflare Dashboard.
 * Route: *.<domain>/*
 *
 * Type checking: npx wrangler types (generates @cloudflare/workers-types)
 */

// Cloudflare Workers types (provided by @cloudflare/workers-types at deploy time)
interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

export interface Env {
  // No bindings required for this worker
}

/**
 * Regex patterns for immutable hashed assets:
 * - Next.js static chunks: /_next/static/...
 * - Content-hashed files: filename.abc12345.js, filename.abc12345.css, etc.
 */
const IMMUTABLE_PATTERNS = [
  /^\/_next\/static\//,
  /\.[0-9a-f]{8,}\.(js|css|woff2|woff|ttf|eot|svg|png|jpg|jpeg|webp|avif|ico)$/,
];

/**
 * Patterns for API and WebSocket endpoints that should never be cached
 */
const NO_CACHE_PATTERNS = [/^\/api\//, /^\/health$/];

/**
 * File extensions considered as text-based (eligible for compression)
 */
const TEXT_EXTENSIONS = new Set([
  'html',
  'css',
  'js',
  'mjs',
  'json',
  'xml',
  'svg',
  'txt',
  'map',
  'webmanifest',
]);

/**
 * Determines the cache strategy for a given request URL
 */
function getCacheStrategy(url: URL, hostname: string): 'immutable' | 'short' | 'no-cache' {
  const path = url.pathname;

  // API and WebSocket subdomains: never cache
  if (hostname.startsWith('api.') || hostname.startsWith('ws.')) {
    return 'no-cache';
  }

  // API paths: never cache
  if (NO_CACHE_PATTERNS.some((pattern) => pattern.test(path))) {
    return 'no-cache';
  }

  // Immutable hashed assets: cache for 1 year
  if (IMMUTABLE_PATTERNS.some((pattern) => pattern.test(path))) {
    return 'immutable';
  }

  // Everything else (HTML, dynamic pages): short cache
  return 'short';
}

export default {
  async fetch(request: Request, _env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const hostname = url.hostname;

    // Fetch the original response from origin
    const response = await fetch(request);

    // Clone response to modify headers
    const modifiedResponse = new Response(response.body, response);

    const strategy = getCacheStrategy(url, hostname);

    switch (strategy) {
      case 'immutable':
        // Immutable assets: cache for 1 year, mark as immutable
        // Browser and CDN both cache aggressively
        modifiedResponse.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
        modifiedResponse.headers.set('CDN-Cache-Control', 'max-age=31536000');
        break;

      case 'short':
        // HTML/dynamic content: short cache (60s) with stale-while-revalidate
        // Allows ISR pages to be served from edge while revalidating
        modifiedResponse.headers.set(
          'Cache-Control',
          'public, max-age=60, stale-while-revalidate=300'
        );
        modifiedResponse.headers.set('CDN-Cache-Control', 'max-age=60');
        break;

      case 'no-cache':
        // API/WebSocket: no caching at any layer
        modifiedResponse.headers.set(
          'Cache-Control',
          'no-store, no-cache, must-revalidate, proxy-revalidate'
        );
        modifiedResponse.headers.set('CDN-Cache-Control', 'no-store');
        // Ensure Cloudflare doesn't cache
        modifiedResponse.headers.set('Cloudflare-CDN-Cache-Control', 'no-store');
        break;
    }

    // Add Vary header for proper cache key differentiation
    const existingVary = modifiedResponse.headers.get('Vary') || '';
    if (!existingVary.includes('Accept-Encoding')) {
      modifiedResponse.headers.set(
        'Vary',
        existingVary ? `${existingVary}, Accept-Encoding` : 'Accept-Encoding'
      );
    }

    return modifiedResponse;
  },
};
