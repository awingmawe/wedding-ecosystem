#!/usr/bin/env bash
# =============================================================================
# Cloudflare DNS Verification Script
# Verifies DNS records and DNSSEC configuration for all production subdomains
#
# Usage:
#   export CLOUDFLARE_API_TOKEN="your-api-token"
#   export CLOUDFLARE_ZONE_ID="your-zone-id"
#   export DOMAIN="weddingdigital.id"
#   ./verify-dns.sh
# =============================================================================

set -euo pipefail

# Validate required environment variables
: "${CLOUDFLARE_API_TOKEN:?Error: CLOUDFLARE_API_TOKEN is not set}"
: "${CLOUDFLARE_ZONE_ID:?Error: CLOUDFLARE_ZONE_ID is not set}"
: "${DOMAIN:?Error: DOMAIN is not set}"

API_BASE="https://api.cloudflare.com/client/v4"
ZONE_URL="${API_BASE}/zones/${CLOUDFLARE_ZONE_ID}"

PASS=0
FAIL=0

# Helper function for Cloudflare API calls
cf_api() {
  local method="$1"
  local endpoint="$2"

  curl -s -X "$method" \
    "${endpoint}" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "Content-Type: application/json"
}

echo "=== DNS Configuration Verification ==="
echo "Domain: ${DOMAIN}"
echo ""

# Expected subdomains
EXPECTED_RECORDS=("dashboard" "scanner" "api" "ws")

# -----------------------------------------------------------------------------
# 1. Verify each subdomain record exists
# -----------------------------------------------------------------------------
echo "--- DNS Records ---"

for subdomain in "${EXPECTED_RECORDS[@]}"; do
  RESULT=$(cf_api GET "${ZONE_URL}/dns_records?type=CNAME&name=${subdomain}.${DOMAIN}")
  COUNT=$(echo "$RESULT" | jq -r '.result | length')

  if [ "$COUNT" -gt "0" ]; then
    CONTENT=$(echo "$RESULT" | jq -r '.result[0].content')
    TTL=$(echo "$RESULT" | jq -r '.result[0].ttl')
    PROXIED=$(echo "$RESULT" | jq -r '.result[0].proxied')
    echo "  ✓ ${subdomain}.${DOMAIN} → ${CONTENT} (TTL: ${TTL}s, Proxied: ${PROXIED})"
    PASS=$((PASS + 1))

    # Verify TTL is 300 (go-live mode)
    if [ "$TTL" = "1" ] && [ "$PROXIED" = "true" ]; then
      # TTL=1 means "Auto" when proxied (Cloudflare manages it)
      echo "    ℹ TTL is Auto (Cloudflare-managed, proxied mode)"
    elif [ "$TTL" = "300" ]; then
      echo "    ✓ TTL is 300s (go-live mode)"
    else
      echo "    ⚠ TTL is ${TTL}s (expected 300s for go-live)"
    fi
  else
    echo "  ✗ ${subdomain}.${DOMAIN} — NOT FOUND"
    FAIL=$((FAIL + 1))
  fi
done

# Check wildcard record
echo ""
RESULT=$(cf_api GET "${ZONE_URL}/dns_records?type=CNAME&name=*.${DOMAIN}")
COUNT=$(echo "$RESULT" | jq -r '.result | length')

if [ "$COUNT" -gt "0" ]; then
  CONTENT=$(echo "$RESULT" | jq -r '.result[0].content')
  TTL=$(echo "$RESULT" | jq -r '.result[0].ttl')
  PROXIED=$(echo "$RESULT" | jq -r '.result[0].proxied')
  echo "  ✓ *.${DOMAIN} → ${CONTENT} (TTL: ${TTL}s, Proxied: ${PROXIED})"
  echo "    ℹ Handles dynamic {event-slug}.${DOMAIN} routing for Invitation App"
  PASS=$((PASS + 1))
else
  echo "  ✗ *.${DOMAIN} (wildcard) — NOT FOUND"
  FAIL=$((FAIL + 1))
fi

# -----------------------------------------------------------------------------
# 2. Verify DNSSEC status
# -----------------------------------------------------------------------------
echo ""
echo "--- DNSSEC ---"
DNSSEC_RESULT=$(cf_api GET "${ZONE_URL}/dnssec")
DNSSEC_STATUS=$(echo "$DNSSEC_RESULT" | jq -r '.result.status')

case "$DNSSEC_STATUS" in
  "active")
    echo "  ✓ DNSSEC is active"
    PASS=$((PASS + 1))
    ;;
  "pending")
    echo "  ⚠ DNSSEC is pending — DS record needs to be added at domain registrar"
    DS=$(echo "$DNSSEC_RESULT" | jq -r '.result.ds')
    echo "    DS Record: ${DS}"
    PASS=$((PASS + 1))
    ;;
  "disabled")
    echo "  ✗ DNSSEC is disabled"
    FAIL=$((FAIL + 1))
    ;;
  *)
    echo "  ⚠ DNSSEC status: ${DNSSEC_STATUS}"
    ;;
esac

# -----------------------------------------------------------------------------
# 3. Verify DNS propagation (external check)
# -----------------------------------------------------------------------------
echo ""
echo "--- DNS Propagation (dig) ---"

if command -v dig &> /dev/null; then
  for subdomain in "${EXPECTED_RECORDS[@]}"; do
    DIG_RESULT=$(dig +short "${subdomain}.${DOMAIN}" 2>/dev/null || true)
    if [ -n "$DIG_RESULT" ]; then
      echo "  ✓ ${subdomain}.${DOMAIN} resolves: ${DIG_RESULT}"
    else
      echo "  ⚠ ${subdomain}.${DOMAIN} not yet propagated (may take up to 5 minutes)"
    fi
  done
else
  echo "  ℹ 'dig' not available — skipping external propagation check"
  echo "    Use https://dnschecker.org to verify propagation manually"
fi

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
echo ""
echo "=== Verification Summary ==="
echo "  Passed: ${PASS}"
echo "  Failed: ${FAIL}"
echo ""

if [ "$FAIL" -gt "0" ]; then
  echo "⚠ Some checks failed. Run configure-dns.sh to fix missing records."
  exit 1
else
  echo "✓ All DNS checks passed."
fi
