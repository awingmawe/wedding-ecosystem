#!/usr/bin/env bash
# =============================================================================
# Cloudflare DNS TTL Update Script
# Updates TTL for all production DNS records (go-live → stable transition)
#
# Usage:
#   export CLOUDFLARE_API_TOKEN="your-api-token"
#   export CLOUDFLARE_ZONE_ID="your-zone-id"
#   export DOMAIN="weddingdigital.id"
#   export DNS_TTL=3600  # Target TTL (default: 3600 for stable)
#   ./update-dns-ttl.sh
# =============================================================================

set -euo pipefail

# Validate required environment variables
: "${CLOUDFLARE_API_TOKEN:?Error: CLOUDFLARE_API_TOKEN is not set}"
: "${CLOUDFLARE_ZONE_ID:?Error: CLOUDFLARE_ZONE_ID is not set}"
: "${DOMAIN:?Error: DOMAIN is not set}"

# Default to stable TTL (3600s) if not specified
DNS_TTL="${DNS_TTL:-3600}"

API_BASE="https://api.cloudflare.com/client/v4"
ZONE_URL="${API_BASE}/zones/${CLOUDFLARE_ZONE_ID}"

# Helper function for Cloudflare API calls
cf_api() {
  local method="$1"
  local endpoint="$2"
  local data="${3:-}"

  if [ -n "$data" ]; then
    curl -s -X "$method" \
      "${endpoint}" \
      -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "$data"
  else
    curl -s -X "$method" \
      "${endpoint}" \
      -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      -H "Content-Type: application/json"
  fi
}

echo "=== DNS TTL Update ==="
echo "Domain: ${DOMAIN}"
echo "Target TTL: ${DNS_TTL}s"
echo ""

# Subdomains to update
SUBDOMAINS=("dashboard" "scanner" "api" "ws")

# Update explicit subdomain records
for subdomain in "${SUBDOMAINS[@]}"; do
  RESULT=$(cf_api GET "${ZONE_URL}/dns_records?type=CNAME&name=${subdomain}.${DOMAIN}")
  COUNT=$(echo "$RESULT" | jq -r '.result | length')

  if [ "$COUNT" -gt "0" ]; then
    RECORD_ID=$(echo "$RESULT" | jq -r '.result[0].id')
    CONTENT=$(echo "$RESULT" | jq -r '.result[0].content')
    PROXIED=$(echo "$RESULT" | jq -r '.result[0].proxied')

    UPDATE=$(cf_api PATCH "${ZONE_URL}/dns_records/${RECORD_ID}" "{\"ttl\": ${DNS_TTL}}")
    SUCCESS=$(echo "$UPDATE" | jq -r '.success')

    if [ "$SUCCESS" = "true" ]; then
      echo "  ✓ ${subdomain}.${DOMAIN} TTL updated to ${DNS_TTL}s"
    else
      echo "  ✗ Failed to update ${subdomain}.${DOMAIN}"
      echo "$UPDATE" | jq '.errors'
    fi
  else
    echo "  ⚠ ${subdomain}.${DOMAIN} not found — skipping"
  fi
done

# Update wildcard record
RESULT=$(cf_api GET "${ZONE_URL}/dns_records?type=CNAME&name=*.${DOMAIN}")
COUNT=$(echo "$RESULT" | jq -r '.result | length')

if [ "$COUNT" -gt "0" ]; then
  RECORD_ID=$(echo "$RESULT" | jq -r '.result[0].id')
  UPDATE=$(cf_api PATCH "${ZONE_URL}/dns_records/${RECORD_ID}" "{\"ttl\": ${DNS_TTL}}")
  SUCCESS=$(echo "$UPDATE" | jq -r '.success')

  if [ "$SUCCESS" = "true" ]; then
    echo "  ✓ *.${DOMAIN} TTL updated to ${DNS_TTL}s"
  else
    echo "  ✗ Failed to update *.${DOMAIN}"
    echo "$UPDATE" | jq '.errors'
  fi
else
  echo "  ⚠ *.${DOMAIN} not found — skipping"
fi

echo ""
echo "=== TTL Update Complete ==="
echo ""
echo "Note: When records are proxied (orange cloud), Cloudflare manages"
echo "the effective TTL. The configured TTL applies if proxy is disabled."
