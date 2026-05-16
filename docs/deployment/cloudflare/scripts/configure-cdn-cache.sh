#!/usr/bin/env bash
# =============================================================================
# Configure Cloudflare CDN Cache Rules, Compression, and Origin Shield
# =============================================================================
# Requirements covered:
# - 7.2: CDN caching (immutable assets: 1 year, HTML/API: 60s or no-cache)
# - 7.4: Brotli compression with Gzip fallback for text-based assets
# - 7.7: Origin shield (Smart Tiered Cache) to reduce origin load
#
# Usage:
#   export CLOUDFLARE_API_TOKEN="your-api-token"
#   export CLOUDFLARE_ZONE_ID="your-zone-id"
#   export DOMAIN="example.com"
#   ./configure-cdn-cache.sh
# =============================================================================

set -euo pipefail

# Validate required environment variables
: "${CLOUDFLARE_API_TOKEN:?Error: CLOUDFLARE_API_TOKEN is required}"
: "${CLOUDFLARE_ZONE_ID:?Error: CLOUDFLARE_ZONE_ID is required}"
: "${DOMAIN:?Error: DOMAIN is required (e.g., example.com)}"

API_BASE="https://api.cloudflare.com/client/v4"
AUTH_HEADER="Authorization: Bearer ${CLOUDFLARE_API_TOKEN}"
CONTENT_TYPE="Content-Type: application/json"

echo "============================================="
echo "Cloudflare CDN Configuration"
echo "Zone ID: ${CLOUDFLARE_ZONE_ID}"
echo "Domain:  ${DOMAIN}"
echo "============================================="

# =============================================================================
# Step 1: Enable Brotli compression at zone level
# =============================================================================
echo ""
echo "[1/5] Enabling Brotli compression..."

curl -s -X PATCH "${API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/settings/brotli" \
  -H "${AUTH_HEADER}" \
  -H "${CONTENT_TYPE}" \
  --data '{"value":"on"}' | jq '.success'

echo "  ✓ Brotli compression enabled"

# =============================================================================
# Step 2: Configure Cache Rules (http_request_cache_settings phase)
# =============================================================================
echo ""
echo "[2/5] Configuring Cache Rules..."

CACHE_RULES_PAYLOAD=$(cat <<EOF
{
  "rules": [
    {
      "expression": "(http.request.uri.path matches \"^/_next/static/.*\") or (http.request.uri.path matches \".*\\\\\\\\.[0-9a-f]{8,}\\\\\\\\.(js|css|woff2|woff|ttf|eot|svg|png|jpg|webp)$\")",
      "description": "Cache immutable hashed assets for 1 year (Req 7.2)",
      "action": "set_cache_settings",
      "action_parameters": {
        "cache": true,
        "edge_ttl": {
          "mode": "override_origin",
          "default": 31536000
        },
        "browser_ttl": {
          "mode": "override_origin",
          "default": 31536000
        }
      },
      "enabled": true
    },
    {
      "expression": "(not http.request.uri.path matches \"^/_next/static/.*\") and (not http.request.uri.path matches \".*\\\\\\\\.[0-9a-f]{8,}\\\\\\\\.(js|css|woff2|woff|ttf|eot|svg|png|jpg|webp)$\") and (http.host ne \"api.${DOMAIN}\") and (http.host ne \"ws.${DOMAIN}\") and (not http.request.uri.path starts_with \"/api/\")",
      "description": "Cache HTML/dynamic content for 60s (Req 7.2)",
      "action": "set_cache_settings",
      "action_parameters": {
        "cache": true,
        "edge_ttl": {
          "mode": "override_origin",
          "default": 60
        },
        "browser_ttl": {
          "mode": "override_origin",
          "default": 60
        }
      },
      "enabled": true
    },
    {
      "expression": "(http.host eq \"api.${DOMAIN}\") or (http.request.uri.path starts_with \"/api/\")",
      "description": "Bypass CDN cache for API responses (Req 7.2)",
      "action": "set_cache_settings",
      "action_parameters": {
        "cache": false
      },
      "enabled": true
    },
    {
      "expression": "(http.host eq \"ws.${DOMAIN}\")",
      "description": "Bypass CDN cache for WebSocket connections",
      "action": "set_cache_settings",
      "action_parameters": {
        "cache": false
      },
      "enabled": true
    }
  ]
}
EOF
)

curl -s -X PUT "${API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/rulesets/phases/http_request_cache_settings/entrypoint" \
  -H "${AUTH_HEADER}" \
  -H "${CONTENT_TYPE}" \
  --data "${CACHE_RULES_PAYLOAD}" | jq '.success'

echo "  ✓ Cache Rules configured"

# =============================================================================
# Step 3: Configure Cache Response Rules (http_response_cache_settings phase)
# =============================================================================
echo ""
echo "[3/5] Configuring Cache Response Rules (immutable headers)..."

CACHE_RESPONSE_RULES_PAYLOAD=$(cat <<EOF
{
  "rules": [
    {
      "expression": "(http.request.uri.path matches \"^/_next/static/.*\") or (http.request.uri.path matches \".*\\\\\\\\.[0-9a-f]{8,}\\\\\\\\.(js|css|woff2|woff|ttf|eot|svg|png|jpg|webp)$\")",
      "description": "Set immutable + max-age 1 year for hashed assets (Req 7.2)",
      "action": "set_cache_control",
      "action_parameters": {
        "max-age": {
          "operation": "set",
          "value": 31536000
        },
        "immutable": {
          "operation": "set"
        }
      },
      "enabled": true
    }
  ]
}
EOF
)

curl -s -X PUT "${API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/rulesets/phases/http_response_cache_settings/entrypoint" \
  -H "${AUTH_HEADER}" \
  -H "${CONTENT_TYPE}" \
  --data "${CACHE_RESPONSE_RULES_PAYLOAD}" | jq '.success'

echo "  ✓ Cache Response Rules configured"

# =============================================================================
# Step 4: Configure Compression Rules (http_response_compression phase)
# =============================================================================
echo ""
echo "[4/5] Configuring Compression Rules (Brotli + Gzip)..."

COMPRESSION_RULES_PAYLOAD=$(cat <<EOF
{
  "rules": [
    {
      "expression": "(http.request.uri.path.extension in {\"html\" \"css\" \"js\" \"json\" \"xml\" \"svg\" \"txt\" \"map\" \"mjs\" \"webmanifest\"})",
      "description": "Brotli with Gzip fallback for text assets (Req 7.4)",
      "action": "compress_response",
      "action_parameters": {
        "algorithms": [
          { "name": "brotli" },
          { "name": "gzip" },
          { "name": "auto" }
        ]
      },
      "enabled": true
    }
  ]
}
EOF
)

curl -s -X PUT "${API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/rulesets/phases/http_response_compression/entrypoint" \
  -H "${AUTH_HEADER}" \
  -H "${CONTENT_TYPE}" \
  --data "${COMPRESSION_RULES_PAYLOAD}" | jq '.success'

echo "  ✓ Compression Rules configured"

# =============================================================================
# Step 5: Enable Smart Tiered Cache (Origin Shield)
# =============================================================================
echo ""
echo "[5/5] Enabling Smart Tiered Cache (Origin Shield)..."

curl -s -X PATCH "${API_BASE}/zones/${CLOUDFLARE_ZONE_ID}/cache/tiered_cache_smart_topology_enable" \
  -H "${AUTH_HEADER}" \
  -H "${CONTENT_TYPE}" \
  --data '{"value":"on"}' | jq '.success'

echo "  ✓ Smart Tiered Cache enabled"

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "============================================="
echo "CDN Configuration Complete!"
echo "============================================="
echo ""
echo "Settings applied:"
echo "  • Immutable assets (hashed): max-age=31536000 (1 year), immutable"
echo "  • HTML/dynamic content:      max-age=60 (60 seconds)"
echo "  • API responses:             no-cache (bypass CDN)"
echo "  • WebSocket:                 bypass CDN"
echo "  • Compression:               Brotli (primary) + Gzip (fallback)"
echo "  • Origin Shield:             Smart Tiered Cache (auto upper-tier)"
echo ""
echo "Run ./verify-cdn-cache.sh to verify the configuration."
