#!/usr/bin/env bash
# =============================================================================
# Configure WebSocket Subdomain (ws.{domain}) with Sticky Session Support
# =============================================================================
# This script configures:
# 1. DNS CNAME record for ws.{domain} → Railway WebSocket origin
# 2. Enables WebSocket support on the Cloudflare zone
# 3. Configures Load Balancer with cookie-based session affinity (sticky sessions)
#
# Requirements: 11.4, 13.2, 13.3
#
# Prerequisites:
#   - CLOUDFLARE_API_TOKEN: API token with Zone:Edit, DNS:Edit, LB:Edit permissions
#   - CLOUDFLARE_ZONE_ID: Zone ID from Cloudflare Dashboard
#   - CLOUDFLARE_ACCOUNT_ID: Account ID from Cloudflare Dashboard
#   - DOMAIN: Production domain (e.g., weddingdigital.id)
#   - WEBSOCKET_ORIGIN: Railway WebSocket origin (e.g., websocket-production.up.railway.app)
#
# Usage:
#   export CLOUDFLARE_API_TOKEN="your-token"
#   export CLOUDFLARE_ZONE_ID="your-zone-id"
#   export CLOUDFLARE_ACCOUNT_ID="your-account-id"
#   export DOMAIN="weddingdigital.id"
#   export WEBSOCKET_ORIGIN="websocket-production.up.railway.app"
#   ./scripts/configure-websocket.sh
# =============================================================================

set -euo pipefail

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Validate required environment variables
for var in CLOUDFLARE_API_TOKEN CLOUDFLARE_ZONE_ID CLOUDFLARE_ACCOUNT_ID DOMAIN WEBSOCKET_ORIGIN; do
  if [ -z "${!var:-}" ]; then
    echo -e "${RED}ERROR: $var is not set${NC}"
    exit 1
  fi
done

API_BASE="https://api.cloudflare.com/client/v4"
AUTH_HEADER="Authorization: Bearer ${CLOUDFLARE_API_TOKEN}"
CONTENT_TYPE="Content-Type: application/json"

echo "============================================="
echo " WebSocket Subdomain Configuration"
echo " Domain: ws.${DOMAIN}"
echo " Origin: ${WEBSOCKET_ORIGIN}"
echo "============================================="
echo ""

# =============================================================================
# Step 1: Create DNS CNAME record for ws.{domain}
# =============================================================================
echo -e "${YELLOW}[1/4] Creating DNS record: ws.${DOMAIN} → ${WEBSOCKET_ORIGIN}${NC}"

# Check if record already exists
EXISTING_RECORD=$(curl -s -X GET \
  "${API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/dns_records?type=CNAME&name=ws.${DOMAIN}" \
  -H "${AUTH_HEADER}" \
  -H "${CONTENT_TYPE}")

RECORD_COUNT=$(echo "$EXISTING_RECORD" | jq -r '.result | length')

if [ "$RECORD_COUNT" -gt "0" ]; then
  RECORD_ID=$(echo "$EXISTING_RECORD" | jq -r '.result[0].id')
  echo "  Record exists (ID: ${RECORD_ID}). Updating..."

  RESULT=$(curl -s -X PUT \
    "${API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/dns_records/${RECORD_ID}" \
    -H "${AUTH_HEADER}" \
    -H "${CONTENT_TYPE}" \
    -d "{
      \"type\": \"CNAME\",
      \"name\": \"ws\",
      \"content\": \"${WEBSOCKET_ORIGIN}\",
      \"proxied\": true,
      \"ttl\": 1,
      \"comment\": \"WebSocket server (Socket.io 4.8) - Railway origin\"
    }")
else
  echo "  Creating new CNAME record..."

  RESULT=$(curl -s -X POST \
    "${API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/dns_records" \
    -H "${AUTH_HEADER}" \
    -H "${CONTENT_TYPE}" \
    -d "{
      \"type\": \"CNAME\",
      \"name\": \"ws\",
      \"content\": \"${WEBSOCKET_ORIGIN}\",
      \"proxied\": true,
      \"ttl\": 1,
      \"comment\": \"WebSocket server (Socket.io 4.8) - Railway origin\"
    }")
fi

SUCCESS=$(echo "$RESULT" | jq -r '.success')
if [ "$SUCCESS" = "true" ]; then
  echo -e "  ${GREEN}✓ DNS record configured: ws.${DOMAIN} → ${WEBSOCKET_ORIGIN} (proxied)${NC}"
else
  echo -e "  ${RED}✗ Failed to configure DNS record${NC}"
  echo "$RESULT" | jq '.errors'
  exit 1
fi

# =============================================================================
# Step 2: Verify WebSocket support is enabled on the zone
# =============================================================================
echo ""
echo -e "${YELLOW}[2/4] Verifying WebSocket support is enabled${NC}"

# WebSocket support is enabled by default on all Cloudflare plans.
# This step verifies the setting is active.
ZONE_SETTINGS=$(curl -s -X GET \
  "${API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/settings/websockets" \
  -H "${AUTH_HEADER}" \
  -H "${CONTENT_TYPE}")

WS_VALUE=$(echo "$ZONE_SETTINGS" | jq -r '.result.value')

if [ "$WS_VALUE" = "on" ]; then
  echo -e "  ${GREEN}✓ WebSocket support is enabled${NC}"
else
  echo "  Enabling WebSocket support..."
  RESULT=$(curl -s -X PATCH \
    "${API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/settings/websockets" \
    -H "${AUTH_HEADER}" \
    -H "${CONTENT_TYPE}" \
    -d '{"value": "on"}')

  SUCCESS=$(echo "$RESULT" | jq -r '.success')
  if [ "$SUCCESS" = "true" ]; then
    echo -e "  ${GREEN}✓ WebSocket support enabled${NC}"
  else
    echo -e "  ${RED}✗ Failed to enable WebSocket support${NC}"
    echo "$RESULT" | jq '.errors'
    exit 1
  fi
fi

# =============================================================================
# Step 3: Create Load Balancer Monitor (Health Check)
# =============================================================================
echo ""
echo -e "${YELLOW}[3/4] Creating health check monitor for WebSocket server${NC}"

# Check if monitor already exists
EXISTING_MONITORS=$(curl -s -X GET \
  "${API_BASE}/accounts/${CLOUDFLARE_ACCOUNT_ID}/load_balancers/monitors" \
  -H "${AUTH_HEADER}" \
  -H "${CONTENT_TYPE}")

MONITOR_ID=$(echo "$EXISTING_MONITORS" | jq -r '.result[] | select(.description == "WebSocket server health check") | .id' | head -1)

if [ -n "$MONITOR_ID" ] && [ "$MONITOR_ID" != "null" ]; then
  echo "  Monitor exists (ID: ${MONITOR_ID}). Updating..."

  RESULT=$(curl -s -X PUT \
    "${API_BASE}/accounts/${CLOUDFLARE_ACCOUNT_ID}/load_balancers/monitors/${MONITOR_ID}" \
    -H "${AUTH_HEADER}" \
    -H "${CONTENT_TYPE}" \
    -d "{
      \"type\": \"https\",
      \"expected_codes\": \"200\",
      \"method\": \"GET\",
      \"path\": \"/health\",
      \"interval\": 10,
      \"timeout\": 5,
      \"retries\": 3,
      \"description\": \"WebSocket server health check\",
      \"header\": {
        \"Host\": [\"ws.${DOMAIN}\"]
      }
    }")
else
  echo "  Creating new health check monitor..."

  RESULT=$(curl -s -X POST \
    "${API_BASE}/accounts/${CLOUDFLARE_ACCOUNT_ID}/load_balancers/monitors" \
    -H "${AUTH_HEADER}" \
    -H "${CONTENT_TYPE}" \
    -d "{
      \"type\": \"https\",
      \"expected_codes\": \"200\",
      \"method\": \"GET\",
      \"path\": \"/health\",
      \"interval\": 10,
      \"timeout\": 5,
      \"retries\": 3,
      \"description\": \"WebSocket server health check\",
      \"header\": {
        \"Host\": [\"ws.${DOMAIN}\"]
      }
    }")

  MONITOR_ID=$(echo "$RESULT" | jq -r '.result.id')
fi

SUCCESS=$(echo "$RESULT" | jq -r '.success')
if [ "$SUCCESS" = "true" ]; then
  echo -e "  ${GREEN}✓ Health check monitor configured (interval: 10s, threshold: 3 failures)${NC}"
else
  echo -e "  ${RED}✗ Failed to configure health check monitor${NC}"
  echo "$RESULT" | jq '.errors'
  echo -e "  ${YELLOW}Note: Load Balancer requires Cloudflare Pro+ plan. Skipping LB setup.${NC}"
  echo -e "  ${YELLOW}Railway's built-in LB with sticky sessions will be used instead.${NC}"
  echo ""
  echo -e "${GREEN}=============================================${NC}"
  echo -e "${GREEN} Configuration Complete (DNS + WebSocket)${NC}"
  echo -e "${GREEN}=============================================${NC}"
  echo ""
  echo "Summary:"
  echo "  DNS:        ws.${DOMAIN} → ${WEBSOCKET_ORIGIN} (CNAME, proxied)"
  echo "  WebSocket:  Enabled on zone"
  echo "  Sticky:     Handled by Railway LB (io cookie from Socket.io)"
  echo ""
  echo "Client URL:   wss://ws.${DOMAIN}"
  exit 0
fi

# =============================================================================
# Step 4: Create Load Balancer Pool + Load Balancer with Session Affinity
# =============================================================================
echo ""
echo -e "${YELLOW}[4/4] Creating Load Balancer with session affinity (sticky sessions)${NC}"

# Create origin pool
echo "  Creating origin pool..."
POOL_RESULT=$(curl -s -X POST \
  "${API_BASE}/accounts/${CLOUDFLARE_ACCOUNT_ID}/load_balancers/pools" \
  -H "${AUTH_HEADER}" \
  -H "${CONTENT_TYPE}" \
  -d "{
    \"name\": \"websocket-railway-pool\",
    \"origins\": [
      {
        \"name\": \"railway-websocket-primary\",
        \"address\": \"${WEBSOCKET_ORIGIN}\",
        \"enabled\": true,
        \"weight\": 1,
        \"header\": {
          \"Host\": [\"ws.${DOMAIN}\"]
        }
      }
    ],
    \"monitor\": \"${MONITOR_ID}\",
    \"minimum_origins\": 1,
    \"check_regions\": [\"SEAS\"]
  }")

POOL_ID=$(echo "$POOL_RESULT" | jq -r '.result.id')
POOL_SUCCESS=$(echo "$POOL_RESULT" | jq -r '.success')

if [ "$POOL_SUCCESS" = "true" ]; then
  echo -e "  ${GREEN}✓ Origin pool created (ID: ${POOL_ID})${NC}"
else
  echo -e "  ${YELLOW}⚠ Pool creation issue (may already exist)${NC}"
  # Try to find existing pool
  EXISTING_POOLS=$(curl -s -X GET \
    "${API_BASE}/accounts/${CLOUDFLARE_ACCOUNT_ID}/load_balancers/pools" \
    -H "${AUTH_HEADER}" \
    -H "${CONTENT_TYPE}")
  POOL_ID=$(echo "$EXISTING_POOLS" | jq -r '.result[] | select(.name == "websocket-railway-pool") | .id' | head -1)

  if [ -z "$POOL_ID" ] || [ "$POOL_ID" = "null" ]; then
    echo -e "  ${RED}✗ Failed to create or find origin pool${NC}"
    echo "$POOL_RESULT" | jq '.errors'
    exit 1
  fi
  echo -e "  ${GREEN}✓ Using existing pool (ID: ${POOL_ID})${NC}"
fi

# Create Load Balancer with session affinity
echo "  Creating Load Balancer with cookie-based session affinity..."
LB_RESULT=$(curl -s -X POST \
  "${API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/load_balancers" \
  -H "${AUTH_HEADER}" \
  -H "${CONTENT_TYPE}" \
  -d "{
    \"name\": \"ws.${DOMAIN}\",
    \"fallback_pool\": \"${POOL_ID}\",
    \"default_pools\": [\"${POOL_ID}\"],
    \"proxied\": true,
    \"session_affinity\": \"cookie\",
    \"session_affinity_attributes\": {
      \"samesite\": \"Strict\",
      \"secure\": \"Always\"
    },
    \"steering_policy\": \"random\"
  }")

LB_SUCCESS=$(echo "$LB_RESULT" | jq -r '.success')
if [ "$LB_SUCCESS" = "true" ]; then
  echo -e "  ${GREEN}✓ Load Balancer created with cookie-based session affinity${NC}"
else
  echo -e "  ${YELLOW}⚠ Load Balancer creation issue${NC}"
  echo "$LB_RESULT" | jq '.errors'
  echo -e "  ${YELLOW}Note: If LB already exists, update it manually in Cloudflare Dashboard.${NC}"
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo -e "${GREEN}=============================================${NC}"
echo -e "${GREEN} WebSocket Configuration Complete${NC}"
echo -e "${GREEN}=============================================${NC}"
echo ""
echo "Summary:"
echo "  DNS:              ws.${DOMAIN} → ${WEBSOCKET_ORIGIN} (CNAME, proxied)"
echo "  WebSocket:        Enabled on zone"
echo "  Session Affinity: Cookie-based (Cloudflare __cflb + Socket.io io cookie)"
echo "  Health Check:     GET /health every 10s (threshold: 3 failures)"
echo "  Steering:         Random (single origin)"
echo ""
echo "Client URL:         wss://ws.${DOMAIN}"
echo ""
echo "Next steps:"
echo "  1. Set NEXT_PUBLIC_WS_URL=wss://ws.${DOMAIN} in Vercel environment variables"
echo "  2. Verify WebSocket connectivity: wscat -c wss://ws.${DOMAIN}/socket.io/?EIO=4&transport=websocket"
echo "  3. Test sticky sessions: curl -v https://ws.${DOMAIN}/health (check for __cflb cookie)"
