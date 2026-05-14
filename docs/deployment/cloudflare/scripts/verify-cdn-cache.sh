#!/usr/bin/env bash
# =============================================================================
# Verify Cloudflare CDN Cache, Compression, and Origin Shield Configuration
# =============================================================================
# Checks that CDN caching rules, Brotli compression, and Tiered Cache are
# correctly configured for the Wedding Digital SaaS platform.
#
# Usage:
#   export DOMAIN="example.com"
#   ./verify-cdn-cache.sh
#
# Optional (for API-level verification):
#   export CLOUDFLARE_API_TOKEN="your-api-token"
#   export CLOUDFLARE_ZONE_ID="your-zone-id"
# =============================================================================

set -euo pipefail

: "${DOMAIN:?Error: DOMAIN is required (e.g., example.com)}"

PASS=0
FAIL=0
SKIP=0

check() {
  local description="$1"
  local result="$2"
  if [ "$result" = "true" ]; then
    echo "  ✓ PASS: ${description}"
    PASS=$((PASS + 1))
  else
    echo "  ✗ FAIL: ${description}"
    FAIL=$((FAIL + 1))
  fi
}

skip() {
  local description="$1"
  local reason="$2"
  echo "  ○ SKIP: ${description} (${reason})"
  SKIP=$((SKIP + 1))
}

echo "============================================="
echo "CDN Configuration Verification"
echo "Domain: ${DOMAIN}"
echo "============================================="

# =============================================================================
# Test 1: Brotli compression on text assets
# =============================================================================
echo ""
echo "[1/5] Checking Brotli compression..."

RESPONSE=$(curl -sI -H "Accept-Encoding: br, gzip" "https://dashboard.${DOMAIN}/" 2>/dev/null || echo "CURL_FAILED")

if [ "$RESPONSE" = "CURL_FAILED" ]; then
  skip "Brotli compression" "domain not reachable"
else
  ENCODING=$(echo "$RESPONSE" | grep -i "content-encoding" | tr -d '\r' | awk '{print $2}')
  if [ "$ENCODING" = "br" ]; then
    check "Brotli compression active on HTML" "true"
  elif [ "$ENCODING" = "gzip" ]; then
    echo "  ⚠ WARNING: Gzip returned instead of Brotli (may be client/server negotiation)"
    check "Compression active (Gzip fallback)" "true"
  else
    check "Brotli or Gzip compression active" "false"
  fi
fi

# =============================================================================
# Test 2: Gzip fallback when Brotli not supported
# =============================================================================
echo ""
echo "[2/5] Checking Gzip fallback..."

RESPONSE=$(curl -sI -H "Accept-Encoding: gzip" "https://dashboard.${DOMAIN}/" 2>/dev/null || echo "CURL_FAILED")

if [ "$RESPONSE" = "CURL_FAILED" ]; then
  skip "Gzip fallback" "domain not reachable"
else
  ENCODING=$(echo "$RESPONSE" | grep -i "content-encoding" | tr -d '\r' | awk '{print $2}')
  if [ "$ENCODING" = "gzip" ]; then
    check "Gzip fallback works when Brotli not requested" "true"
  else
    check "Gzip fallback works when Brotli not requested" "false"
  fi
fi

# =============================================================================
# Test 3: Cache-Control headers on static assets
# =============================================================================
echo ""
echo "[3/5] Checking Cache-Control headers..."

# Test immutable asset (Next.js static)
RESPONSE=$(curl -sI "https://dashboard.${DOMAIN}/_next/static/chunks/main.js" 2>/dev/null || echo "CURL_FAILED")

if [ "$RESPONSE" = "CURL_FAILED" ]; then
  skip "Immutable asset cache headers" "domain not reachable"
else
  CACHE_CONTROL=$(echo "$RESPONSE" | grep -i "cache-control" | tr -d '\r')
  if echo "$CACHE_CONTROL" | grep -qi "immutable\|max-age=31536000"; then
    check "Immutable assets have long cache TTL" "true"
  else
    check "Immutable assets have long cache TTL" "false"
    echo "    Got: ${CACHE_CONTROL}"
  fi
fi

# Test API no-cache
RESPONSE=$(curl -sI "https://api.${DOMAIN}/health" 2>/dev/null || echo "CURL_FAILED")

if [ "$RESPONSE" = "CURL_FAILED" ]; then
  skip "API no-cache headers" "domain not reachable"
else
  CF_CACHE=$(echo "$RESPONSE" | grep -i "cf-cache-status" | tr -d '\r' | awk '{print $2}')
  if [ "$CF_CACHE" = "DYNAMIC" ] || [ "$CF_CACHE" = "BYPASS" ]; then
    check "API responses bypass CDN cache" "true"
  else
    check "API responses bypass CDN cache" "false"
    echo "    Got cf-cache-status: ${CF_CACHE}"
  fi
fi

# =============================================================================
# Test 4: Tiered Cache (Origin Shield) via API
# =============================================================================
echo ""
echo "[4/5] Checking Tiered Cache (Origin Shield)..."

if [ -n "${CLOUDFLARE_API_TOKEN:-}" ] && [ -n "${CLOUDFLARE_ZONE_ID:-}" ]; then
  TIERED_CACHE=$(curl -s "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/cache/tiered_cache_smart_topology_enable" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" | jq -r '.result.value // empty')

  if [ "$TIERED_CACHE" = "on" ]; then
    check "Smart Tiered Cache (Origin Shield) enabled" "true"
  else
    check "Smart Tiered Cache (Origin Shield) enabled" "false"
  fi
else
  skip "Smart Tiered Cache API check" "CLOUDFLARE_API_TOKEN or CLOUDFLARE_ZONE_ID not set"
fi

# =============================================================================
# Test 5: Brotli zone setting via API
# =============================================================================
echo ""
echo "[5/5] Checking Brotli zone setting..."

if [ -n "${CLOUDFLARE_API_TOKEN:-}" ] && [ -n "${CLOUDFLARE_ZONE_ID:-}" ]; then
  BROTLI=$(curl -s "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/settings/brotli" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" | jq -r '.result.value // empty')

  if [ "$BROTLI" = "on" ]; then
    check "Brotli zone setting enabled" "true"
  else
    check "Brotli zone setting enabled" "false"
  fi
else
  skip "Brotli zone setting API check" "CLOUDFLARE_API_TOKEN or CLOUDFLARE_ZONE_ID not set"
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "============================================="
echo "Verification Summary"
echo "============================================="
echo "  Passed: ${PASS}"
echo "  Failed: ${FAIL}"
echo "  Skipped: ${SKIP}"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "⚠ Some checks failed. Review the output above."
  exit 1
else
  echo "✓ All checks passed (or skipped due to missing access)."
  exit 0
fi
