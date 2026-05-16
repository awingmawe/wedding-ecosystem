#!/usr/bin/env bash
# =============================================================================
# Cloudflare DNS Configuration Script
# Configures DNS records for all production subdomains via Cloudflare API
#
# Requirements covered:
# - 11.1: DNS records for dashboard, scanner, api, ws, and wildcard (invitation)
# - 11.2: TTL 300 seconds initially for go-live flexibility
# - 11.7: DNSSEC enabled for DNS spoofing prevention
#
# Usage:
#   export CLOUDFLARE_API_TOKEN="your-api-token"
#   export CLOUDFLARE_ZONE_ID="your-zone-id"
#   export DOMAIN="weddingdigital.id"
#   export VERCEL_CNAME_TARGET="cname.vercel-dns.com"
#   export RAILWAY_API_TARGET="your-api-service.up.railway.app"
#   export RAILWAY_WS_TARGET="your-ws-service.up.railway.app"
#   ./configure-dns.sh
# =============================================================================

set -euo pipefail

# Validate required environment variables
: "${CLOUDFLARE_API_TOKEN:?Error: CLOUDFLARE_API_TOKEN is not set}"
: "${CLOUDFLARE_ZONE_ID:?Error: CLOUDFLARE_ZONE_ID is not set}"
: "${DOMAIN:?Error: DOMAIN is not set}"
: "${VERCEL_CNAME_TARGET:=${VERCEL_CNAME_TARGET:-cname.vercel-dns.com}}"
: "${RAILWAY_API_TARGET:?Error: RAILWAY_API_TARGET is not set}"
: "${RAILWAY_WS_TARGET:?Error: RAILWAY_WS_TARGET is not set}"

# Configuration
DNS_TTL=300  # Low TTL for go-live flexibility (increase to 3600 after stable)
PROXIED=true # Enable Cloudflare proxy (CDN, WAF, DDoS protection)

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

# Helper function to create or update a DNS record
create_or_update_record() {
  local name="$1"
  local type="$2"
  local content="$3"
  local comment="$4"

  # Check if record already exists
  local existing
  existing=$(cf_api GET "${ZONE_URL}/dns_records?type=${type}&name=${name}.${DOMAIN}")
  local count
  count=$(echo "$existing" | jq -r '.result | length')

  if [ "$count" -gt "0" ]; then
    # Update existing record
    local record_id
    record_id=$(echo "$existing" | jq -r '.result[0].id')
    local result
    result=$(cf_api PUT "${ZONE_URL}/dns_records/${record_id}" "{
      \"type\": \"${type}\",
      \"name\": \"${name}\",
      \"content\": \"${content}\",
      \"ttl\": ${DNS_TTL},
      \"proxied\": ${PROXIED},
      \"comment\": \"${comment}\"
    }")
    local success
    success=$(echo "$result" | jq -r '.success')
    if [ "$success" = "true" ]; then
      echo "  ✓ Updated: ${name}.${DOMAIN} → ${content} (TTL: ${DNS_TTL}s)"
    else
      echo "  ✗ Failed to update ${name}.${DOMAIN}"
      echo "$result" | jq '.errors'
      return 1
    fi
  else
    # Create new record
    local result
    result=$(cf_api POST "${ZONE_URL}/dns_records" "{
      \"type\": \"${type}\",
      \"name\": \"${name}\",
      \"content\": \"${content}\",
      \"ttl\": ${DNS_TTL},
      \"proxied\": ${PROXIED},
      \"comment\": \"${comment}\"
    }")
    local success
    success=$(echo "$result" | jq -r '.success')
    if [ "$success" = "true" ]; then
      echo "  ✓ Created: ${name}.${DOMAIN} → ${content} (TTL: ${DNS_TTL}s)"
    else
      echo "  ✗ Failed to create ${name}.${DOMAIN}"
      echo "$result" | jq '.errors'
      return 1
    fi
  fi
}

# Helper for wildcard record (name is just "*")
create_or_update_wildcard() {
  local content="$1"
  local comment="$2"

  # Check if wildcard record already exists
  local existing
  existing=$(cf_api GET "${ZONE_URL}/dns_records?type=CNAME&name=*.${DOMAIN}")
  local count
  count=$(echo "$existing" | jq -r '.result | length')

  if [ "$count" -gt "0" ]; then
    local record_id
    record_id=$(echo "$existing" | jq -r '.result[0].id')
    local result
    result=$(cf_api PUT "${ZONE_URL}/dns_records/${record_id}" "{
      \"type\": \"CNAME\",
      \"name\": \"*\",
      \"content\": \"${content}\",
      \"ttl\": ${DNS_TTL},
      \"proxied\": ${PROXIED},
      \"comment\": \"${comment}\"
    }")
    local success
    success=$(echo "$result" | jq -r '.success')
    if [ "$success" = "true" ]; then
      echo "  ✓ Updated: *.${DOMAIN} → ${content} (TTL: ${DNS_TTL}s)"
    else
      echo "  ✗ Failed to update *.${DOMAIN}"
      echo "$result" | jq '.errors'
      return 1
    fi
  else
    local result
    result=$(cf_api POST "${ZONE_URL}/dns_records" "{
      \"type\": \"CNAME\",
      \"name\": \"*\",
      \"content\": \"${content}\",
      \"ttl\": ${DNS_TTL},
      \"proxied\": ${PROXIED},
      \"comment\": \"${comment}\"
    }")
    local success
    success=$(echo "$result" | jq -r '.success')
    if [ "$success" = "true" ]; then
      echo "  ✓ Created: *.${DOMAIN} → ${content} (TTL: ${DNS_TTL}s)"
    else
      echo "  ✗ Failed to create *.${DOMAIN}"
      echo "$result" | jq '.errors'
      return 1
    fi
  fi
}

echo "=== Cloudflare DNS Configuration ==="
echo "Domain: ${DOMAIN}"
echo "TTL: ${DNS_TTL}s (go-live mode)"
echo "Proxied: ${PROXIED}"
echo ""

# -----------------------------------------------------------------------------
# 1. Create DNS records for frontend apps (Vercel)
# -----------------------------------------------------------------------------
echo "[1/6] Configuring Dashboard subdomain..."
create_or_update_record "dashboard" "CNAME" "${VERCEL_CNAME_TARGET}" "Dashboard App (Next.js) on Vercel"

echo "[2/6] Configuring Scanner subdomain..."
create_or_update_record "scanner" "CNAME" "${VERCEL_CNAME_TARGET}" "Scanner PWA (Next.js) on Vercel"

echo "[3/6] Configuring Invitation wildcard subdomain..."
create_or_update_wildcard "${VERCEL_CNAME_TARGET}" "Invitation App wildcard - {event-slug}.${DOMAIN} routing"

# -----------------------------------------------------------------------------
# 2. Create DNS records for backend services (Railway)
# -----------------------------------------------------------------------------
echo "[4/6] Configuring API subdomain..."
create_or_update_record "api" "CNAME" "${RAILWAY_API_TARGET}" "Fastify API server on Railway"

echo "[5/6] Configuring WebSocket subdomain..."
create_or_update_record "ws" "CNAME" "${RAILWAY_WS_TARGET}" "WebSocket (Socket.io) server on Railway"

# -----------------------------------------------------------------------------
# 3. Enable DNSSEC
# -----------------------------------------------------------------------------
echo "[6/6] Enabling DNSSEC..."
DNSSEC_STATUS=$(cf_api GET "${ZONE_URL}/dnssec" | jq -r '.result.status')

if [ "$DNSSEC_STATUS" = "active" ]; then
  echo "  ✓ DNSSEC already active"
elif [ "$DNSSEC_STATUS" = "pending" ]; then
  echo "  ⚠ DNSSEC is pending - DS record needs to be added at domain registrar"
  DS_RECORD=$(cf_api GET "${ZONE_URL}/dnssec" | jq -r '.result.ds')
  echo "  DS Record: ${DS_RECORD}"
else
  RESULT=$(cf_api PATCH "${ZONE_URL}/dnssec" '{"status":"active"}')
  SUCCESS=$(echo "$RESULT" | jq -r '.success')
  if [ "$SUCCESS" = "true" ]; then
    echo "  ✓ DNSSEC enabled"
    DS_RECORD=$(echo "$RESULT" | jq -r '.result.ds')
    echo ""
    echo "  ⚠ IMPORTANT: Add the following DS record at your domain registrar:"
    echo "  ${DS_RECORD}"
  else
    echo "  ✗ Failed to enable DNSSEC"
    echo "$RESULT" | jq '.errors'
  fi
fi

echo ""
echo "=== DNS Configuration Complete ==="
echo ""
echo "Records configured:"
echo "  • dashboard.${DOMAIN} → ${VERCEL_CNAME_TARGET} (CNAME, TTL: ${DNS_TTL}s)"
echo "  • scanner.${DOMAIN}   → ${VERCEL_CNAME_TARGET} (CNAME, TTL: ${DNS_TTL}s)"
echo "  • *.${DOMAIN}         → ${VERCEL_CNAME_TARGET} (CNAME, TTL: ${DNS_TTL}s)"
echo "  • api.${DOMAIN}       → ${RAILWAY_API_TARGET} (CNAME, TTL: ${DNS_TTL}s)"
echo "  • ws.${DOMAIN}        → ${RAILWAY_WS_TARGET} (CNAME, TTL: ${DNS_TTL}s)"
echo "  • DNSSEC: Enabled"
echo ""
echo "Next steps:"
echo "  1. Add DS record at domain registrar (if DNSSEC was just enabled)"
echo "  2. Configure Vercel custom domains for dashboard, scanner, and wildcard"
echo "  3. Configure Railway custom domains for api and ws"
echo "  4. Verify DNS propagation: ./verify-dns.sh"
echo "  5. After stable (48h+), increase TTL to 3600s: ./update-dns-ttl.sh"
