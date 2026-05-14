#!/usr/bin/env bash
# =============================================================================
# CDN Cache Configuration Wrapper Script
# =============================================================================
# Convenience wrapper that delegates to the full CDN cache configuration script
# located in docs/deployment/cloudflare/scripts/configure-cdn-cache.sh.
#
# This script applies Cloudflare zone-level CDN cache rules including:
# - Immutable asset caching (1 year for hashed filenames)
# - HTML/dynamic content caching (60s)
# - API/WebSocket bypass
# - Brotli + Gzip compression
# - Smart Tiered Cache (Origin Shield)
#
# Requirements covered: 7.2, 7.4, 7.7
#
# Usage:
#   export CLOUDFLARE_API_TOKEN="your-api-token"
#   export CLOUDFLARE_ZONE_ID="your-zone-id"
#   export PRODUCTION_DOMAIN="yourdomain.com"
#   ./scripts/configure-cdn-cache.sh
# =============================================================================

set -euo pipefail

# --- Color output helpers ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[✓]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; }

# --- Validate required environment variables ---
: "${CLOUDFLARE_API_TOKEN:?Error: CLOUDFLARE_API_TOKEN is required}"
: "${CLOUDFLARE_ZONE_ID:?Error: CLOUDFLARE_ZONE_ID is required}"
: "${PRODUCTION_DOMAIN:?Error: PRODUCTION_DOMAIN is required (e.g., weddingdigital.id)}"

# Resolve script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Path to the full CDN cache configuration script
CDN_SCRIPT="${PROJECT_ROOT}/docs/deployment/cloudflare/scripts/configure-cdn-cache.sh"

if [ ! -f "${CDN_SCRIPT}" ]; then
  error "CDN cache configuration script not found at: ${CDN_SCRIPT}"
  error "Expected location: docs/deployment/cloudflare/scripts/configure-cdn-cache.sh"
  exit 1
fi

info "Applying CDN cache rules for domain: ${PRODUCTION_DOMAIN}"
info "Using script: ${CDN_SCRIPT}"
echo ""

# Export DOMAIN variable expected by the downstream script
export DOMAIN="${PRODUCTION_DOMAIN}"

# Execute the full CDN cache configuration
bash "${CDN_SCRIPT}"

echo ""
success "CDN cache configuration complete for ${PRODUCTION_DOMAIN}"
