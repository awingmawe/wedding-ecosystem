#!/usr/bin/env bash
# =============================================================================
# Cloudflare SSL/TLS Configuration Script
# Applies SSL/TLS settings via Cloudflare API for all production domains
#
# Requirements covered:
# - 2.1: SSL/TLS with minimum TLS 1.2, preference TLS 1.3
# - 2.2: HTTPS redirect (HTTP 301 → HTTPS)
# - 2.3: HSTS header (max-age=31536000, includeSubDomains)
# - 2.4: End-to-end encryption (Cloudflare → Railway origin)
# - 2.7: Trusted CA certificate with auto-renewal
#
# Usage:
#   export CLOUDFLARE_API_TOKEN="your-api-token"
#   export CLOUDFLARE_ZONE_ID="your-zone-id"
#   ./configure-ssl-tls.sh
# =============================================================================

set -euo pipefail

# Validate required environment variables
: "${CLOUDFLARE_API_TOKEN:?Error: CLOUDFLARE_API_TOKEN is not set}"
: "${CLOUDFLARE_ZONE_ID:?Error: CLOUDFLARE_ZONE_ID is not set}"

API_BASE="https://api.cloudflare.com/client/v4"
ZONE_URL="${API_BASE}/zones/${CLOUDFLARE_ZONE_ID}"

# Helper function for Cloudflare API calls
cf_api() {
  local method="$1"
  local endpoint="$2"
  local data="${3:-}"

  if [ -n "$data" ]; then
    curl -s -X "$method" \
      "${ZONE_URL}${endpoint}" \
      -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "$data"
  else
    curl -s -X "$method" \
      "${ZONE_URL}${endpoint}" \
      -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      -H "Content-Type: application/json"
  fi
}

echo "=== Cloudflare SSL/TLS Configuration ==="
echo ""

# -----------------------------------------------------------------------------
# 1. Set SSL/TLS mode to Full (Strict)
# -----------------------------------------------------------------------------
echo "[1/6] Setting SSL/TLS mode to Full (Strict)..."
RESULT=$(cf_api PATCH "/settings/ssl" '{"value":"strict"}')
SUCCESS=$(echo "$RESULT" | jq -r '.success')
if [ "$SUCCESS" = "true" ]; then
  echo "  ✓ SSL mode set to Full (Strict)"
else
  echo "  ✗ Failed to set SSL mode"
  echo "$RESULT" | jq '.errors'
  exit 1
fi

# -----------------------------------------------------------------------------
# 2. Set minimum TLS version to 1.2
# -----------------------------------------------------------------------------
echo "[2/6] Setting minimum TLS version to 1.2..."
RESULT=$(cf_api PATCH "/settings/min_tls_version" '{"value":"1.2"}')
SUCCESS=$(echo "$RESULT" | jq -r '.success')
if [ "$SUCCESS" = "true" ]; then
  echo "  ✓ Minimum TLS version set to 1.2"
else
  echo "  ✗ Failed to set minimum TLS version"
  echo "$RESULT" | jq '.errors'
  exit 1
fi

# -----------------------------------------------------------------------------
# 3. Enable TLS 1.3
# -----------------------------------------------------------------------------
echo "[3/6] Enabling TLS 1.3..."
RESULT=$(cf_api PATCH "/settings/tls_1_3" '{"value":"on"}')
SUCCESS=$(echo "$RESULT" | jq -r '.success')
if [ "$SUCCESS" = "true" ]; then
  echo "  ✓ TLS 1.3 enabled"
else
  echo "  ✗ Failed to enable TLS 1.3"
  echo "$RESULT" | jq '.errors'
  exit 1
fi

# -----------------------------------------------------------------------------
# 4. Enable Always Use HTTPS (HTTP 301 → HTTPS redirect)
# -----------------------------------------------------------------------------
echo "[4/6] Enabling Always Use HTTPS (301 redirect)..."
RESULT=$(cf_api PATCH "/settings/always_use_https" '{"value":"on"}')
SUCCESS=$(echo "$RESULT" | jq -r '.success')
if [ "$SUCCESS" = "true" ]; then
  echo "  ✓ Always Use HTTPS enabled (HTTP → HTTPS 301 redirect)"
else
  echo "  ✗ Failed to enable Always Use HTTPS"
  echo "$RESULT" | jq '.errors'
  exit 1
fi

# -----------------------------------------------------------------------------
# 5. Configure HSTS (max-age=31536000, includeSubDomains)
# -----------------------------------------------------------------------------
echo "[5/6] Configuring HSTS header..."
RESULT=$(cf_api PATCH "/settings/security_header" '{
  "value": {
    "strict_transport_security": {
      "enabled": true,
      "max_age": 31536000,
      "include_subdomains": true,
      "nosniff": true,
      "preload": false
    }
  }
}')
SUCCESS=$(echo "$RESULT" | jq -r '.success')
if [ "$SUCCESS" = "true" ]; then
  echo "  ✓ HSTS configured (max-age=31536000, includeSubDomains)"
else
  echo "  ✗ Failed to configure HSTS"
  echo "$RESULT" | jq '.errors'
  exit 1
fi

# -----------------------------------------------------------------------------
# 6. Enable Automatic HTTPS Rewrites (fix mixed content)
# -----------------------------------------------------------------------------
echo "[6/6] Enabling Automatic HTTPS Rewrites..."
RESULT=$(cf_api PATCH "/settings/automatic_https_rewrites" '{"value":"on"}')
SUCCESS=$(echo "$RESULT" | jq -r '.success')
if [ "$SUCCESS" = "true" ]; then
  echo "  ✓ Automatic HTTPS Rewrites enabled"
else
  echo "  ✗ Failed to enable Automatic HTTPS Rewrites"
  echo "$RESULT" | jq '.errors'
  exit 1
fi

echo ""
echo "=== Configuration Complete ==="
echo ""
echo "Summary:"
echo "  • SSL/TLS Mode: Full (Strict)"
echo "  • Minimum TLS: 1.2"
echo "  • TLS 1.3: Enabled (preferred)"
echo "  • HTTPS Redirect: HTTP 301 → HTTPS"
echo "  • HSTS: max-age=31536000; includeSubDomains"
echo "  • Automatic HTTPS Rewrites: Enabled"
echo ""
echo "Next steps:"
echo "  1. Install Cloudflare Origin CA certificate on Railway"
echo "  2. Verify all domains respond over HTTPS"
echo "  3. Run verification script: ./verify-ssl-tls.sh"
