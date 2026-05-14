#!/usr/bin/env bash
# =============================================================================
# Configure Cloudflare Load Balancer Health Checks and Failover
# =============================================================================
# Requirements covered:
# - 11.3: DNS health check that auto-failover when primary unresponsive for 30s
# - 11.5: Load balancer health check interval 10s, threshold 3 consecutive failures
#
# Failover timing: interval(10s) × consecutive_down(3) = 30 seconds
#
# Usage:
#   export CLOUDFLARE_API_TOKEN="your-api-token"
#   export CLOUDFLARE_ACCOUNT_ID="your-account-id"
#   export CLOUDFLARE_ZONE_ID="your-zone-id"
#   export DOMAIN="weddingdigital.id"
#   export PRIMARY_ORIGIN="primary-api.railway.app"
#   export SECONDARY_ORIGIN="secondary-api.railway.app"
#   ./configure-health-checks.sh
# =============================================================================

set -euo pipefail

# Validate required environment variables
: "${CLOUDFLARE_API_TOKEN:?Error: CLOUDFLARE_API_TOKEN is required}"
: "${CLOUDFLARE_ACCOUNT_ID:?Error: CLOUDFLARE_ACCOUNT_ID is required}"
: "${CLOUDFLARE_ZONE_ID:?Error: CLOUDFLARE_ZONE_ID is required}"
: "${DOMAIN:?Error: DOMAIN is required (e.g., weddingdigital.id)}"
: "${PRIMARY_ORIGIN:?Error: PRIMARY_ORIGIN is required (e.g., primary-api.railway.app)}"
: "${SECONDARY_ORIGIN:?Error: SECONDARY_ORIGIN is required (e.g., secondary-api.railway.app)}"

API_BASE="https://api.cloudflare.com/client/v4"
AUTH_HEADER="Authorization: Bearer ${CLOUDFLARE_API_TOKEN}"
CONTENT_TYPE="Content-Type: application/json"

NOTIFICATION_EMAIL="${NOTIFICATION_EMAIL:-ops@weddingdigital.id}"

echo "============================================="
echo "Cloudflare Health Check & Failover Configuration"
echo "Account ID:       ${CLOUDFLARE_ACCOUNT_ID}"
echo "Zone ID:          ${CLOUDFLARE_ZONE_ID}"
echo "Domain:           ${DOMAIN}"
echo "Primary Origin:   ${PRIMARY_ORIGIN}"
echo "Secondary Origin: ${SECONDARY_ORIGIN}"
echo "============================================="

# =============================================================================
# Step 1: Create Health Monitor
# Checks /health every 10 seconds, marks unhealthy after 3 failures (30s)
# =============================================================================
echo ""
echo "[1/4] Creating Health Monitor..."

MONITOR_RESPONSE=$(curl -s -X POST "${API_BASE}/accounts/${CLOUDFLARE_ACCOUNT_ID}/load_balancers/monitors" \
  -H "${AUTH_HEADER}" \
  -H "${CONTENT_TYPE}" \
  --data "{
    \"type\": \"https\",
    \"description\": \"Wedding Digital API Health Monitor - /health endpoint\",
    \"method\": \"GET\",
    \"path\": \"/health\",
    \"port\": 443,
    \"interval\": 10,
    \"timeout\": 5,
    \"retries\": 0,
    \"consecutive_down\": 3,
    \"consecutive_up\": 2,
    \"expected_codes\": \"200\",
    \"expected_body\": \"\",
    \"follow_redirects\": true,
    \"allow_insecure\": false,
    \"header\": {
      \"Host\": [\"api.${DOMAIN}\"],
      \"User-Agent\": [\"Cloudflare-Health-Monitor/1.0\"]
    }
  }")

MONITOR_SUCCESS=$(echo "${MONITOR_RESPONSE}" | jq -r '.success')
MONITOR_ID=$(echo "${MONITOR_RESPONSE}" | jq -r '.result.id')

if [ "${MONITOR_SUCCESS}" = "true" ]; then
  echo "  ✓ Health Monitor created (ID: ${MONITOR_ID})"
  echo "    - Endpoint: GET /health"
  echo "    - Interval: 10 seconds"
  echo "    - Timeout: 5 seconds"
  echo "    - Consecutive failures to mark unhealthy: 3 (= 30s)"
  echo "    - Consecutive successes to mark healthy: 2"
else
  echo "  ✗ Failed to create Health Monitor"
  echo "${MONITOR_RESPONSE}" | jq '.errors'
  exit 1
fi

# =============================================================================
# Step 2: Create Primary Origin Pool
# =============================================================================
echo ""
echo "[2/4] Creating Primary Origin Pool..."

PRIMARY_POOL_RESPONSE=$(curl -s -X POST "${API_BASE}/accounts/${CLOUDFLARE_ACCOUNT_ID}/load_balancers/pools" \
  -H "${AUTH_HEADER}" \
  -H "${CONTENT_TYPE}" \
  --data "{
    \"name\": \"wedding-api-primary\",
    \"description\": \"Primary API pool - Railway production endpoint\",
    \"enabled\": true,
    \"minimum_origins\": 1,
    \"monitor\": \"${MONITOR_ID}\",
    \"check_regions\": [\"SEAS\", \"EAF\"],
    \"notification_email\": \"${NOTIFICATION_EMAIL}\",
    \"origins\": [
      {
        \"name\": \"railway-primary\",
        \"address\": \"${PRIMARY_ORIGIN}\",
        \"enabled\": true,
        \"weight\": 1.0,
        \"header\": {
          \"Host\": [\"api.${DOMAIN}\"]
        }
      }
    ]
  }")

PRIMARY_POOL_SUCCESS=$(echo "${PRIMARY_POOL_RESPONSE}" | jq -r '.success')
PRIMARY_POOL_ID=$(echo "${PRIMARY_POOL_RESPONSE}" | jq -r '.result.id')

if [ "${PRIMARY_POOL_SUCCESS}" = "true" ]; then
  echo "  ✓ Primary Pool created (ID: ${PRIMARY_POOL_ID})"
  echo "    - Origin: ${PRIMARY_ORIGIN}"
  echo "    - Monitor: ${MONITOR_ID}"
  echo "    - Regions: SEAS (Southeast Asia), EAF (East Africa)"
else
  echo "  ✗ Failed to create Primary Pool"
  echo "${PRIMARY_POOL_RESPONSE}" | jq '.errors'
  exit 1
fi

# =============================================================================
# Step 3: Create Secondary/Failover Origin Pool
# =============================================================================
echo ""
echo "[3/4] Creating Secondary (Failover) Origin Pool..."

SECONDARY_POOL_RESPONSE=$(curl -s -X POST "${API_BASE}/accounts/${CLOUDFLARE_ACCOUNT_ID}/load_balancers/pools" \
  -H "${AUTH_HEADER}" \
  -H "${CONTENT_TYPE}" \
  --data "{
    \"name\": \"wedding-api-secondary\",
    \"description\": \"Secondary API pool - Railway failover endpoint\",
    \"enabled\": true,
    \"minimum_origins\": 1,
    \"monitor\": \"${MONITOR_ID}\",
    \"check_regions\": [\"SEAS\", \"EAF\"],
    \"notification_email\": \"${NOTIFICATION_EMAIL}\",
    \"origins\": [
      {
        \"name\": \"railway-secondary\",
        \"address\": \"${SECONDARY_ORIGIN}\",
        \"enabled\": true,
        \"weight\": 1.0,
        \"header\": {
          \"Host\": [\"api.${DOMAIN}\"]
        }
      }
    ]
  }")

SECONDARY_POOL_SUCCESS=$(echo "${SECONDARY_POOL_RESPONSE}" | jq -r '.success')
SECONDARY_POOL_ID=$(echo "${SECONDARY_POOL_RESPONSE}" | jq -r '.result.id')

if [ "${SECONDARY_POOL_SUCCESS}" = "true" ]; then
  echo "  ✓ Secondary Pool created (ID: ${SECONDARY_POOL_ID})"
  echo "    - Origin: ${SECONDARY_ORIGIN}"
  echo "    - Monitor: ${MONITOR_ID}"
else
  echo "  ✗ Failed to create Secondary Pool"
  echo "${SECONDARY_POOL_RESPONSE}" | jq '.errors'
  exit 1
fi

# =============================================================================
# Step 4: Create Load Balancer with Active-Passive Failover
# =============================================================================
echo ""
echo "[4/4] Creating Load Balancer (Active-Passive Failover)..."

LB_RESPONSE=$(curl -s -X POST "${API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/load_balancers" \
  -H "${AUTH_HEADER}" \
  -H "${CONTENT_TYPE}" \
  --data "{
    \"name\": \"api.${DOMAIN}\",
    \"description\": \"Wedding Digital API Load Balancer with failover\",
    \"enabled\": true,
    \"proxied\": true,
    \"ttl\": 30,
    \"steering_policy\": \"off\",
    \"session_affinity\": \"none\",
    \"default_pools\": [\"${PRIMARY_POOL_ID}\", \"${SECONDARY_POOL_ID}\"],
    \"fallback_pool\": \"${SECONDARY_POOL_ID}\",
    \"adaptive_routing\": {
      \"failover_across_pools\": true
    }
  }")

LB_SUCCESS=$(echo "${LB_RESPONSE}" | jq -r '.success')
LB_ID=$(echo "${LB_RESPONSE}" | jq -r '.result.id')

if [ "${LB_SUCCESS}" = "true" ]; then
  echo "  ✓ Load Balancer created (ID: ${LB_ID})"
  echo "    - Hostname: api.${DOMAIN}"
  echo "    - Steering: Off (Active-Passive Failover)"
  echo "    - Primary Pool: ${PRIMARY_POOL_ID}"
  echo "    - Fallback Pool: ${SECONDARY_POOL_ID}"
  echo "    - Adaptive Routing: Failover across pools enabled"
else
  echo "  ✗ Failed to create Load Balancer"
  echo "${LB_RESPONSE}" | jq '.errors'
  exit 1
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "============================================="
echo "Health Check & Failover Configuration Complete!"
echo "============================================="
echo ""
echo "Resources created:"
echo "  • Monitor ID:        ${MONITOR_ID}"
echo "  • Primary Pool ID:   ${PRIMARY_POOL_ID}"
echo "  • Secondary Pool ID: ${SECONDARY_POOL_ID}"
echo "  • Load Balancer ID:  ${LB_ID}"
echo ""
echo "Failover behavior:"
echo "  • Health check hits GET /health every 10 seconds"
echo "  • After 3 consecutive failures (30s), primary marked unhealthy"
echo "  • Traffic automatically routes to secondary pool"
echo "  • After 2 consecutive successes, primary marked healthy again"
echo "  • Traffic returns to primary pool"
echo ""
echo "Save these IDs for future reference:"
echo "  MONITOR_ID=${MONITOR_ID}"
echo "  PRIMARY_POOL_ID=${PRIMARY_POOL_ID}"
echo "  SECONDARY_POOL_ID=${SECONDARY_POOL_ID}"
echo "  LB_ID=${LB_ID}"
echo ""
echo "Run ./verify-health-checks.sh to verify the configuration."
