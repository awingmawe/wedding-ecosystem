#!/usr/bin/env bash
# =============================================================================
# Verify Cloudflare Health Check and Load Balancer Configuration
# =============================================================================
# Validates that health monitors, pools, and load balancer are correctly
# configured and operational.
#
# Usage:
#   export CLOUDFLARE_API_TOKEN="your-api-token"
#   export CLOUDFLARE_ACCOUNT_ID="your-account-id"
#   export CLOUDFLARE_ZONE_ID="your-zone-id"
#   ./verify-health-checks.sh
# =============================================================================

set -euo pipefail

# Validate required environment variables
: "${CLOUDFLARE_API_TOKEN:?Error: CLOUDFLARE_API_TOKEN is required}"
: "${CLOUDFLARE_ACCOUNT_ID:?Error: CLOUDFLARE_ACCOUNT_ID is required}"
: "${CLOUDFLARE_ZONE_ID:?Error: CLOUDFLARE_ZONE_ID is required}"

API_BASE="https://api.cloudflare.com/client/v4"
AUTH_HEADER="Authorization: Bearer ${CLOUDFLARE_API_TOKEN}"

PASS=0
FAIL=0

check() {
  local description="$1"
  local result="$2"
  if [ "${result}" = "true" ]; then
    echo "  ✓ ${description}"
    PASS=$((PASS + 1))
  else
    echo "  ✗ ${description}"
    FAIL=$((FAIL + 1))
  fi
}

echo "============================================="
echo "Verifying Health Check & Failover Configuration"
echo "============================================="

# =============================================================================
# Step 1: Verify Health Monitors exist
# =============================================================================
echo ""
echo "[1/4] Checking Health Monitors..."

MONITORS_RESPONSE=$(curl -s "${API_BASE}/accounts/${CLOUDFLARE_ACCOUNT_ID}/load_balancers/monitors" \
  -H "${AUTH_HEADER}")

MONITORS_SUCCESS=$(echo "${MONITORS_RESPONSE}" | jq -r '.success')
check "Monitors API accessible" "${MONITORS_SUCCESS}"

# Find our specific monitor
WEDDING_MONITOR=$(echo "${MONITORS_RESPONSE}" | jq -r '.result[] | select(.description | contains("Wedding Digital")) | .id')
if [ -n "${WEDDING_MONITOR}" ]; then
  check "Wedding Digital health monitor exists" "true"

  # Verify monitor settings
  MONITOR_INTERVAL=$(echo "${MONITORS_RESPONSE}" | jq -r ".result[] | select(.id == \"${WEDDING_MONITOR}\") | .interval")
  MONITOR_CONSECUTIVE_DOWN=$(echo "${MONITORS_RESPONSE}" | jq -r ".result[] | select(.id == \"${WEDDING_MONITOR}\") | .consecutive_down")
  MONITOR_PATH=$(echo "${MONITORS_RESPONSE}" | jq -r ".result[] | select(.id == \"${WEDDING_MONITOR}\") | .path")
  MONITOR_TYPE=$(echo "${MONITORS_RESPONSE}" | jq -r ".result[] | select(.id == \"${WEDDING_MONITOR}\") | .type")

  check "Monitor interval is 10 seconds (Req 11.5)" "$([ "${MONITOR_INTERVAL}" = "10" ] && echo true || echo false)"
  check "Monitor consecutive_down is 3 (Req 11.5)" "$([ "${MONITOR_CONSECUTIVE_DOWN}" = "3" ] && echo true || echo false)"
  check "Monitor checks /health endpoint" "$([ "${MONITOR_PATH}" = "/health" ] && echo true || echo false)"
  check "Monitor type is HTTPS" "$([ "${MONITOR_TYPE}" = "https" ] && echo true || echo false)"

  # Verify failover timing: 10s × 3 = 30s (Req 11.3)
  FAILOVER_TIME=$((MONITOR_INTERVAL * MONITOR_CONSECUTIVE_DOWN))
  check "Failover detection time ≤ 30s (Req 11.3): ${FAILOVER_TIME}s" "$([ "${FAILOVER_TIME}" -le 30 ] && echo true || echo false)"
else
  check "Wedding Digital health monitor exists" "false"
fi

# =============================================================================
# Step 2: Verify Origin Pools
# =============================================================================
echo ""
echo "[2/4] Checking Origin Pools..."

POOLS_RESPONSE=$(curl -s "${API_BASE}/accounts/${CLOUDFLARE_ACCOUNT_ID}/load_balancers/pools" \
  -H "${AUTH_HEADER}")

POOLS_SUCCESS=$(echo "${POOLS_RESPONSE}" | jq -r '.success')
check "Pools API accessible" "${POOLS_SUCCESS}"

PRIMARY_POOL=$(echo "${POOLS_RESPONSE}" | jq -r '.result[] | select(.name == "wedding-api-primary") | .id')
SECONDARY_POOL=$(echo "${POOLS_RESPONSE}" | jq -r '.result[] | select(.name == "wedding-api-secondary") | .id')

check "Primary pool exists" "$([ -n "${PRIMARY_POOL}" ] && echo true || echo false)"
check "Secondary pool exists" "$([ -n "${SECONDARY_POOL}" ] && echo true || echo false)"

if [ -n "${PRIMARY_POOL}" ]; then
  PRIMARY_HEALTHY=$(echo "${POOLS_RESPONSE}" | jq -r ".result[] | select(.id == \"${PRIMARY_POOL}\") | .healthy")
  PRIMARY_ENABLED=$(echo "${POOLS_RESPONSE}" | jq -r ".result[] | select(.id == \"${PRIMARY_POOL}\") | .enabled")
  check "Primary pool is enabled" "${PRIMARY_ENABLED}"
  echo "    Primary pool health status: ${PRIMARY_HEALTHY:-unknown}"
fi

if [ -n "${SECONDARY_POOL}" ]; then
  SECONDARY_ENABLED=$(echo "${POOLS_RESPONSE}" | jq -r ".result[] | select(.id == \"${SECONDARY_POOL}\") | .enabled")
  check "Secondary pool is enabled" "${SECONDARY_ENABLED}"
fi

# =============================================================================
# Step 3: Verify Load Balancer
# =============================================================================
echo ""
echo "[3/4] Checking Load Balancer..."

LB_RESPONSE=$(curl -s "${API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/load_balancers" \
  -H "${AUTH_HEADER}")

LB_SUCCESS=$(echo "${LB_RESPONSE}" | jq -r '.success')
check "Load Balancer API accessible" "${LB_SUCCESS}"

WEDDING_LB=$(echo "${LB_RESPONSE}" | jq -r '.result[] | select(.description | contains("Wedding Digital")) | .id')
if [ -n "${WEDDING_LB}" ]; then
  check "Wedding Digital load balancer exists" "true"

  LB_ENABLED=$(echo "${LB_RESPONSE}" | jq -r ".result[] | select(.id == \"${WEDDING_LB}\") | .enabled")
  LB_STEERING=$(echo "${LB_RESPONSE}" | jq -r ".result[] | select(.id == \"${WEDDING_LB}\") | .steering_policy")
  LB_FAILOVER=$(echo "${LB_RESPONSE}" | jq -r ".result[] | select(.id == \"${WEDDING_LB}\") | .adaptive_routing.failover_across_pools")

  check "Load balancer is enabled" "${LB_ENABLED}"
  check "Steering policy is 'off' (failover mode)" "$([ "${LB_STEERING}" = "off" ] && echo true || echo false)"
  check "Failover across pools enabled" "${LB_FAILOVER}"
else
  check "Wedding Digital load balancer exists" "false"
fi

# =============================================================================
# Step 4: Verify Health Monitor Events (recent)
# =============================================================================
echo ""
echo "[4/4] Checking Recent Health Events..."

EVENTS_RESPONSE=$(curl -s "${API_BASE}/accounts/${CLOUDFLARE_ACCOUNT_ID}/load_balancers/events?since=$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-1H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo '2024-01-01T00:00:00Z')" \
  -H "${AUTH_HEADER}" 2>/dev/null || echo '{"success":false}')

EVENTS_SUCCESS=$(echo "${EVENTS_RESPONSE}" | jq -r '.success' 2>/dev/null || echo "false")
if [ "${EVENTS_SUCCESS}" = "true" ]; then
  EVENT_COUNT=$(echo "${EVENTS_RESPONSE}" | jq -r '.result | length')
  echo "  ℹ Recent health events (last hour): ${EVENT_COUNT}"
else
  echo "  ℹ Health events API not accessible (may require additional permissions)"
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "============================================="
echo "Verification Results: ${PASS} passed, ${FAIL} failed"
echo "============================================="

if [ "${FAIL}" -gt 0 ]; then
  echo ""
  echo "⚠ Some checks failed. Run configure-health-checks.sh to set up missing resources."
  exit 1
else
  echo ""
  echo "✓ All health check and failover configurations verified."
  echo ""
  echo "Failover behavior summary:"
  echo "  • Monitor checks /health every 10s"
  echo "  • 3 consecutive failures (30s) → primary marked unhealthy"
  echo "  • Traffic automatically fails over to secondary pool"
  echo "  • 2 consecutive successes → primary marked healthy, traffic returns"
fi
