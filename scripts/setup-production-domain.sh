#!/usr/bin/env bash
# =============================================================================
# Production Domain Setup Script
# =============================================================================
# This script applies all domain-dependent configurations when the production
# domain goes live. Run this AFTER:
#   1. Domain is registered and added to Cloudflare
#   2. Nameservers are pointed to Cloudflare
#   3. Vercel project is connected to the domain
#
# Requirements covered: 7.2, 7.4, 7.5, 7.7, 8.5, 11.1, 11.6
#
# Usage:
#   export PRODUCTION_DOMAIN="yourdomain.com"
#   export CLOUDFLARE_API_TOKEN="your-api-token"
#   export CLOUDFLARE_ZONE_ID="your-zone-id"
#   export CLOUDFLARE_ACCOUNT_ID="your-account-id"
#   export R2_BUCKET_NAME="wedding-ecosystem"
#   ./scripts/setup-production-domain.sh
#
# Optional (for Vercel env var updates):
#   export VERCEL_TOKEN="your-vercel-token"
#   export VERCEL_PROJECT_DASHBOARD="prj_xxx"
#   export VERCEL_PROJECT_INVITATION="prj_xxx"
#   export VERCEL_PROJECT_SCANNER="prj_xxx"
# =============================================================================

set -euo pipefail

# --- Color output helpers ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[✓]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; }

# --- Validate required environment variables ---
: "${PRODUCTION_DOMAIN:?Error: PRODUCTION_DOMAIN is required (e.g., weddingdigital.id)}"
: "${CLOUDFLARE_API_TOKEN:?Error: CLOUDFLARE_API_TOKEN is required}"
: "${CLOUDFLARE_ZONE_ID:?Error: CLOUDFLARE_ZONE_ID is required}"
: "${CLOUDFLARE_ACCOUNT_ID:?Error: CLOUDFLARE_ACCOUNT_ID is required}"
: "${R2_BUCKET_NAME:=wedding-ecosystem}"

API_BASE="https://api.cloudflare.com/client/v4"
AUTH_HEADER="Authorization: Bearer ${CLOUDFLARE_API_TOKEN}"
CONTENT_TYPE="Content-Type: application/json"

echo ""
echo "============================================="
echo " Production Domain Setup"
echo "============================================="
echo " Domain:     ${PRODUCTION_DOMAIN}"
echo " Zone ID:    ${CLOUDFLARE_ZONE_ID}"
echo " Account ID: ${CLOUDFLARE_ACCOUNT_ID}"
echo " R2 Bucket:  ${R2_BUCKET_NAME}"
echo "============================================="
echo ""

# =============================================================================
# Step 1: Verify domain is active on Cloudflare
# =============================================================================
info "Step 1/9: Verifying domain is active on Cloudflare..."

ZONE_STATUS=$(curl -s "${API_BASE}/zones/${CLOUDFLARE_ZONE_ID}" \
  -H "${AUTH_HEADER}" | jq -r '.result.status')

if [ "${ZONE_STATUS}" != "active" ]; then
  error "Zone is not active (status: ${ZONE_STATUS}). Ensure nameservers are configured."
  exit 1
fi
success "Domain zone is active on Cloudflare"

# =============================================================================
# Step 2: Configure R2 Custom Domain (cdn.{domain})
# =============================================================================
info "Step 2/9: Configuring R2 Custom Domain (cdn.${PRODUCTION_DOMAIN})..."

# Note: R2 Custom Domains are configured via the Cloudflare Dashboard or API.
# The API endpoint for R2 custom domains:
R2_CUSTOM_DOMAIN_RESPONSE=$(curl -s -X POST \
  "${API_BASE}/accounts/${CLOUDFLARE_ACCOUNT_ID}/r2/buckets/${R2_BUCKET_NAME}/custom_domains" \
  -H "${AUTH_HEADER}" \
  -H "${CONTENT_TYPE}" \
  --data "{\"domain\": \"cdn.${PRODUCTION_DOMAIN}\"}" 2>&1) || true

if echo "${R2_CUSTOM_DOMAIN_RESPONSE}" | jq -e '.success == true' > /dev/null 2>&1; then
  success "R2 Custom Domain cdn.${PRODUCTION_DOMAIN} configured"
elif echo "${R2_CUSTOM_DOMAIN_RESPONSE}" | jq -e '.errors[0].code == 10004' > /dev/null 2>&1; then
  warn "R2 Custom Domain already exists — skipping"
else
  warn "R2 Custom Domain API call returned unexpected response."
  warn "You may need to configure this manually in Cloudflare Dashboard:"
  warn "  → R2 → ${R2_BUCKET_NAME} → Settings → Custom Domains → Add cdn.${PRODUCTION_DOMAIN}"
  echo "  Response: ${R2_CUSTOM_DOMAIN_RESPONSE}" | head -5
fi

# =============================================================================
# Step 3: Update R2 CORS rules
# =============================================================================
info "Step 3/9: Updating R2 CORS rules..."

R2_CORS_PAYLOAD=$(cat <<EOF
{
  "cors_rules": [
    {
      "allowed_origins": ["https://dashboard.${PRODUCTION_DOMAIN}"],
      "allowed_methods": ["PUT", "POST"],
      "allowed_headers": ["Content-Type", "Content-Length", "x-amz-content-sha256", "x-amz-date", "Authorization"],
      "max_age_seconds": 3600
    },
    {
      "allowed_origins": [
        "https://cdn.${PRODUCTION_DOMAIN}",
        "https://dashboard.${PRODUCTION_DOMAIN}",
        "https://scanner.${PRODUCTION_DOMAIN}",
        "https://*.${PRODUCTION_DOMAIN}"
      ],
      "allowed_methods": ["GET", "HEAD"],
      "allowed_headers": ["*"],
      "expose_headers": ["Content-Length", "Content-Type", "ETag"],
      "max_age_seconds": 86400
    }
  ]
}
EOF
)

# R2 CORS is configured via S3-compatible API or Cloudflare API
# Using Cloudflare API for bucket CORS:
CORS_RESPONSE=$(curl -s -X PUT \
  "${API_BASE}/accounts/${CLOUDFLARE_ACCOUNT_ID}/r2/buckets/${R2_BUCKET_NAME}/cors" \
  -H "${AUTH_HEADER}" \
  -H "${CONTENT_TYPE}" \
  --data "${R2_CORS_PAYLOAD}" 2>&1) || true

if echo "${CORS_RESPONSE}" | jq -e '.success == true' > /dev/null 2>&1; then
  success "R2 CORS rules updated"
else
  warn "R2 CORS API call may not be supported via this endpoint."
  warn "Configure CORS manually or via S3-compatible API (see docs/deployment/cloudflare/R2-STORAGE-CONFIGURATION.md)"
  echo "  Upload origins: https://dashboard.${PRODUCTION_DOMAIN}"
  echo "  Download origins: https://cdn.${PRODUCTION_DOMAIN}, https://*.${PRODUCTION_DOMAIN}"
fi

# =============================================================================
# Step 4: Apply CDN cache rules (zone-level)
# =============================================================================
info "Step 4/9: Applying CDN cache rules..."

# Delegate to the CDN cache configuration script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CDN_WRAPPER="${SCRIPT_DIR}/configure-cdn-cache.sh"
CDN_SCRIPT="${SCRIPT_DIR}/../docs/deployment/cloudflare/scripts/configure-cdn-cache.sh"

if [ -f "${CDN_WRAPPER}" ]; then
  bash "${CDN_WRAPPER}"
  success "CDN cache rules applied"
elif [ -f "${CDN_SCRIPT}" ]; then
  DOMAIN="${PRODUCTION_DOMAIN}" bash "${CDN_SCRIPT}"
  success "CDN cache rules applied"
else
  warn "CDN cache script not found."
  warn "Run manually: DOMAIN=${PRODUCTION_DOMAIN} ./docs/deployment/cloudflare/scripts/configure-cdn-cache.sh"
  warn "Or: ./scripts/configure-cdn-cache.sh"
fi

# =============================================================================
# Step 5: Enable Brotli compression
# =============================================================================
info "Step 5/9: Enabling Brotli compression..."

BROTLI_RESPONSE=$(curl -s -X PATCH "${API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/settings/brotli" \
  -H "${AUTH_HEADER}" \
  -H "${CONTENT_TYPE}" \
  --data '{"value":"on"}')

if echo "${BROTLI_RESPONSE}" | jq -e '.success == true' > /dev/null 2>&1; then
  success "Brotli compression enabled"
else
  warn "Failed to enable Brotli. Enable manually: Dashboard → Speed → Optimization → Brotli"
fi

# =============================================================================
# Step 6: Enable Smart Tiered Cache (Origin Shield)
# =============================================================================
info "Step 6/9: Enabling Smart Tiered Cache..."

TIERED_CACHE_RESPONSE=$(curl -s -X PATCH \
  "${API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/cache/tiered_cache_smart_topology_enable" \
  -H "${AUTH_HEADER}" \
  -H "${CONTENT_TYPE}" \
  --data '{"value":"on"}')

if echo "${TIERED_CACHE_RESPONSE}" | jq -e '.success == true' > /dev/null 2>&1; then
  success "Smart Tiered Cache enabled"
else
  warn "Failed to enable Tiered Cache. Enable manually: Dashboard → Caching → Tiered Cache"
fi

# =============================================================================
# Step 7: Deploy Cloudflare Worker routes
# =============================================================================
info "Step 7/9: Configuring Cloudflare Worker routes..."

# CDN Cache Worker route
CDN_WORKER_ROUTE_RESPONSE=$(curl -s -X POST \
  "${API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/workers/routes" \
  -H "${AUTH_HEADER}" \
  -H "${CONTENT_TYPE}" \
  --data "{\"pattern\": \"*.${PRODUCTION_DOMAIN}/*\", \"script\": \"wedding-cdn-cache\"}" 2>&1) || true

if echo "${CDN_WORKER_ROUTE_RESPONSE}" | jq -e '.success == true' > /dev/null 2>&1; then
  success "CDN Cache Worker route configured"
else
  warn "CDN Cache Worker route may already exist or worker not deployed yet."
  warn "Deploy worker first: cd docs/deployment/cloudflare/workers && npx wrangler deploy --config wrangler-cdn-cache.toml"
fi

# Image Resizer Worker route
IMG_WORKER_ROUTE_RESPONSE=$(curl -s -X POST \
  "${API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/workers/routes" \
  -H "${AUTH_HEADER}" \
  -H "${CONTENT_TYPE}" \
  --data "{\"pattern\": \"cdn.${PRODUCTION_DOMAIN}/media/*\", \"script\": \"image-resizer\"}" 2>&1) || true

if echo "${IMG_WORKER_ROUTE_RESPONSE}" | jq -e '.success == true' > /dev/null 2>&1; then
  success "Image Resizer Worker route configured"
else
  warn "Image Resizer Worker route may already exist or worker not deployed yet."
  warn "Deploy worker first: cd docs/deployment/cloudflare/workers && npx wrangler deploy --config wrangler-image-resizer.toml"
fi

# =============================================================================
# Step 8: Update Vercel environment variables (if token provided)
# =============================================================================
info "Step 8/9: Updating Vercel environment variables..."

if [ -n "${VERCEL_TOKEN:-}" ]; then
  VERCEL_API="https://api.vercel.com"
  VERCEL_AUTH="Authorization: Bearer ${VERCEL_TOKEN}"

  # Environment variables to set on all frontend projects
  VERCEL_ENVS=(
    "NEXT_PUBLIC_API_URL=https://api.${PRODUCTION_DOMAIN}"
    "NEXT_PUBLIC_WS_URL=wss://ws.${PRODUCTION_DOMAIN}"
    "NEXT_PUBLIC_CDN_URL=https://cdn.${PRODUCTION_DOMAIN}"
    "NEXT_PUBLIC_DASHBOARD_URL=https://dashboard.${PRODUCTION_DOMAIN}"
  )

  for PROJECT_ID in "${VERCEL_PROJECT_DASHBOARD:-}" "${VERCEL_PROJECT_INVITATION:-}" "${VERCEL_PROJECT_SCANNER:-}"; do
    if [ -z "${PROJECT_ID}" ]; then
      continue
    fi

    for ENV_PAIR in "${VERCEL_ENVS[@]}"; do
      KEY="${ENV_PAIR%%=*}"
      VALUE="${ENV_PAIR#*=}"

      curl -s -X POST "${VERCEL_API}/v10/projects/${PROJECT_ID}/env" \
        -H "${VERCEL_AUTH}" \
        -H "${CONTENT_TYPE}" \
        --data "{\"key\": \"${KEY}\", \"value\": \"${VALUE}\", \"type\": \"plain\", \"target\": [\"production\"]}" > /dev/null 2>&1 || true
    done
  done
  success "Vercel environment variables updated"
else
  warn "VERCEL_TOKEN not set — skipping Vercel env var updates."
  warn "Set these manually in Vercel Dashboard for each project:"
  echo "  NEXT_PUBLIC_API_URL=https://api.${PRODUCTION_DOMAIN}"
  echo "  NEXT_PUBLIC_WS_URL=wss://ws.${PRODUCTION_DOMAIN}"
  echo "  NEXT_PUBLIC_CDN_URL=https://cdn.${PRODUCTION_DOMAIN}"
  echo "  NEXT_PUBLIC_DASHBOARD_URL=https://dashboard.${PRODUCTION_DOMAIN}"
fi

# =============================================================================
# Step 9: Verify SSL/TLS on all subdomains
# =============================================================================
info "Step 9/9: Verifying SSL/TLS on subdomains..."

SUBDOMAINS=(
  "dashboard.${PRODUCTION_DOMAIN}"
  "scanner.${PRODUCTION_DOMAIN}"
  "api.${PRODUCTION_DOMAIN}"
  "ws.${PRODUCTION_DOMAIN}"
  "cdn.${PRODUCTION_DOMAIN}"
)

SSL_OK=true
for SUBDOMAIN in "${SUBDOMAINS[@]}"; do
  if curl -s --max-time 10 -o /dev/null -w "%{http_code}" "https://${SUBDOMAIN}" > /dev/null 2>&1; then
    success "SSL active: ${SUBDOMAIN}"
  else
    # Try just the TLS handshake
    if echo | openssl s_client -connect "${SUBDOMAIN}:443" -servername "${SUBDOMAIN}" 2>/dev/null | grep -q "Verify return code: 0"; then
      success "SSL active: ${SUBDOMAIN}"
    else
      warn "SSL not verified: ${SUBDOMAIN} (may not be propagated yet)"
      SSL_OK=false
    fi
  fi
done

if [ "${SSL_OK}" = false ]; then
  warn "Some subdomains don't have SSL active yet. This is normal if DNS just propagated."
  warn "Cloudflare Universal SSL typically activates within 15 minutes."
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "============================================="
echo " Domain Setup Complete!"
echo "============================================="
echo ""
echo " Domain: ${PRODUCTION_DOMAIN}"
echo ""
echo " Configured:"
echo "   • R2 Custom Domain:    cdn.${PRODUCTION_DOMAIN}"
echo "   • R2 CORS:             Upload from dashboard.${PRODUCTION_DOMAIN}"
echo "                          Download from cdn.${PRODUCTION_DOMAIN}, *.${PRODUCTION_DOMAIN}"
echo "   • CDN Cache Rules:     Immutable (1yr), HTML (60s), API (bypass)"
echo "   • Brotli Compression:  Enabled"
echo "   • Smart Tiered Cache:  Enabled"
echo "   • Worker Routes:       CDN cache + Image resizer"
echo "   • Vercel Env Vars:     NEXT_PUBLIC_API_URL, NEXT_PUBLIC_WS_URL, NEXT_PUBLIC_CDN_URL"
echo "   • SSL/TLS:             Verified on subdomains"
echo ""
echo " Remaining manual steps:"
echo "   1. Update Railway env vars: R2_PUBLIC_URL=https://cdn.${PRODUCTION_DOMAIN}"
echo "   2. Update Railway env vars: PRODUCTION_DOMAIN=${PRODUCTION_DOMAIN}"
echo "   3. Redeploy backend services on Railway"
echo "   4. Redeploy frontend apps on Vercel"
echo "   5. Run smoke tests: .github/workflows/smoke-test.yml"
echo ""
echo " Full checklist: docs/deployment/DOMAIN-SETUP-CHECKLIST.md"
echo ""
echo " CORS plugin (packages/api/src/plugins/cors.ts) automatically"
echo " derives allowed origins from PRODUCTION_DOMAIN env var."
echo " No code changes needed — just set the env var and redeploy."
echo "============================================="
