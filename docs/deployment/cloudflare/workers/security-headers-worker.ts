/**
 * Cloudflare Worker: Security Headers Enforcement
 *
 * This worker adds security headers to all responses passing through Cloudflare.
 * It acts as a defense-in-depth layer complementing zone-level HSTS settings.
 *
 * Requirements covered:
 * - 2.3: HSTS header (max-age=31536000, includeSubDomains)
 * - 2.1: TLS enforcement via headers
 *
 * Deploy via Cloudflare Workers (wrangler) or Cloudflare Dashboard.
 * Route: *.<domain>/*
 */

export interface Env {
  // No bindings required for this worker
}

const SECURITY_HEADERS: Record<string, string> = {
  // HSTS: Force HTTPS for 1 year, including all subdomains
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',

  // Prevent MIME type sniffing
  'X-Content-Type-Options': 'nosniff',

  // Prevent clickjacking
  'X-Frame-Options': 'DENY',

  // Control referrer information
  'Referrer-Policy': 'strict-origin-when-cross-origin',

  // Restrict browser features
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

// Headers to remove (prevent information leakage)
const HEADERS_TO_REMOVE = ['X-Powered-By', 'Server'];

export default {
  async fetch(request: Request, _env: Env, _ctx: ExecutionContext): Promise<Response> {
    // Fetch the original response from origin
    const response = await fetch(request);

    // Clone response to modify headers
    const modifiedResponse = new Response(response.body, response);

    // Add security headers
    for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
      modifiedResponse.headers.set(header, value);
    }

    // Remove information-leaking headers
    for (const header of HEADERS_TO_REMOVE) {
      modifiedResponse.headers.delete(header);
    }

    return modifiedResponse;
  },
};
