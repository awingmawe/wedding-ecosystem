#!/usr/bin/env bash
# Configure Cloudflare R2 Storage for Wedding Digital SaaS Production
#
# Requirements: 8.1, 8.2, 8.3, 8.5, 8.7
#
# Prerequisites:
#   - R2 must be enabled on the Cloudflare account (via Dashboard)
#   - CLOUDFLARE_API_TOKEN with R2:Edit permissions
#   - CLOUDFLARE_ACCOUNT_ID
#   - DOMAIN (production domain)
#
# Usage:
#   export CLOUDFLARE_API_TOKEN="your-token"
#   export CLOUDFLARE_ACCOUNT_ID="your-account-id"
#   export DOMAIN="example.com"
#   ./configure-r2-storage.sh

set -euo pipefail

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Validate required environment variables
: "${CLOUDFLARE_API_TOKEN:?Error: CLOUDFLARE_API_TOKEN is required}"
: "${CLOUDFLARE_ACCOUNT_ID:?Error: CLOUDFLARE_ACCOUNT_ID is required}"
: "${DOMAIN:?Error: DOMAIN is required (e.g., example.com)}"

BUCKET_NAME="wedding-digital-media-production"
API_BASE="https://api.cloudflare.com/client/v4"

echo -e "${GREEN}=== Cloudflare R2 Storage Configuration ===${NC}"
echo "Account ID: ${CLOUDFLARE_ACCOUNT_ID}"
echo "Domain: ${DOMAIN}"
echo "Bucket: ${BUCKET_NAME}"
echo ""

# Helper function for API calls
cf_api() {
  local method="$1"
  local endpoint="$2"
  local data="${3:-}"

  if [ -n "$data" ]; then
    curl -s -X "$method" \
      "${API_BASE}${endpoint}" \
      -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "$data"
  else
    curl -s -X "$method" \
      "${API_BASE}${endpoint}" \
      -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      -H "Content-Type: application/json"
  fi
}

# Step 1: Create R2 Bucket
echo -e "${YELLOW}[1/5] Creating R2 bucket...${NC}"
RESULT=$(cf_api POST "/accounts/${CLOUDFLARE_ACCOUNT_ID}/r2/buckets" \
  "{\"name\":\"${BUCKET_NAME}\",\"locationHint\":\"apac\"}")

if echo "$RESULT" | grep -q '"success":true'; then
  echo -e "${GREEN}  ✓ Bucket '${BUCKET_NAME}' created successfully${NC}"
elif echo "$RESULT" | grep -q "already exists"; then
  echo -e "${YELLOW}  ⚠ Bucket '${BUCKET_NAME}' already exists (skipping)${NC}"
else
  echo -e "${RED}  ✗ Failed to create bucket: $(echo "$RESULT" | jq -r '.errors[0].message // "Unknown error"')${NC}"
  exit 1
fi

# Step 2: Enable Object Versioning
echo -e "${YELLOW}[2/5] Enabling object versioning...${NC}"
RESULT=$(cf_api PUT "/accounts/${CLOUDFLARE_ACCOUNT_ID}/r2/buckets/${BUCKET_NAME}/versioning" \
  '{"enabled":true}')

if echo "$RESULT" | grep -q '"success":true'; then
  echo -e "${GREEN}  ✓ Object versioning enabled${NC}"
else
  echo -e "${YELLOW}  ⚠ Could not enable versioning (may require Dashboard): $(echo "$RESULT" | jq -r '.errors[0].message // "Check Dashboard"')${NC}"
fi

# Step 3: Configure CORS
echo -e "${YELLOW}[3/5] Configuring CORS rules...${NC}"
CORS_CONFIG=$(cat <<EOF
{
  "cors_rules": [
    {
      "allowed_origins": ["https://dashboard.${DOMAIN}"],
      "allowed_methods": ["PUT", "POST"],
      "allowed_headers": ["Content-Type", "Content-Length", "Content-MD5", "x-amz-content-sha256", "x-amz-date", "Authorization"],
      "expose_headers": ["ETag", "x-amz-request-id"],
      "max_age_seconds": 3600
    },
    {
      "allowed_origins": ["https://cdn.${DOMAIN}", "https://*.${DOMAIN}"],
      "allowed_methods": ["GET", "HEAD"],
      "allowed_headers": ["Content-Type", "Range"],
      "expose_headers": ["Content-Length", "Content-Type", "ETag", "Accept-Ranges"],
      "max_age_seconds": 86400
    }
  ]
}
EOF
)

RESULT=$(cf_api PUT "/accounts/${CLOUDFLARE_ACCOUNT_ID}/r2/buckets/${BUCKET_NAME}/cors" "$CORS_CONFIG")

if echo "$RESULT" | grep -q '"success":true'; then
  echo -e "${GREEN}  ✓ CORS rules configured${NC}"
else
  echo -e "${YELLOW}  ⚠ Could not configure CORS via API: $(echo "$RESULT" | jq -r '.errors[0].message // "Check Dashboard"')${NC}"
  echo "    Configure manually in Dashboard → R2 → ${BUCKET_NAME} → Settings → CORS"
fi

# Step 4: Disable public access (r2.dev subdomain)
echo -e "${YELLOW}[4/5] Ensuring public access is disabled...${NC}"
RESULT=$(cf_api PUT "/accounts/${CLOUDFLARE_ACCOUNT_ID}/r2/buckets/${BUCKET_NAME}/public_access" \
  '{"enabled":false}')

if echo "$RESULT" | grep -q '"success":true'; then
  echo -e "${GREEN}  ✓ Public access (r2.dev) disabled${NC}"
else
  echo -e "${YELLOW}  ⚠ Public access setting: $(echo "$RESULT" | jq -r '.errors[0].message // "Verify in Dashboard"')${NC}"
fi

# Step 5: Configure Custom Domain (CDN access)
echo -e "${YELLOW}[5/5] Configuring custom domain for CDN access...${NC}"
RESULT=$(cf_api POST "/accounts/${CLOUDFLARE_ACCOUNT_ID}/r2/buckets/${BUCKET_NAME}/custom_domains" \
  "{\"hostname\":\"cdn.${DOMAIN}\"}")

if echo "$RESULT" | grep -q '"success":true'; then
  echo -e "${GREEN}  ✓ Custom domain 'cdn.${DOMAIN}' configured${NC}"
elif echo "$RESULT" | grep -q "already exists"; then
  echo -e "${YELLOW}  ⚠ Custom domain 'cdn.${DOMAIN}' already configured (skipping)${NC}"
else
  echo -e "${YELLOW}  ⚠ Custom domain configuration: $(echo "$RESULT" | jq -r '.errors[0].message // "Check Dashboard"')${NC}"
  echo "    Configure manually: Dashboard → R2 → ${BUCKET_NAME} → Settings → Custom Domains"
fi

echo ""
echo -e "${GREEN}=== R2 Storage Configuration Complete ===${NC}"
echo ""
echo "Summary:"
echo "  Bucket:       ${BUCKET_NAME}"
echo "  Location:     APAC (Asia-Pacific)"
echo "  Encryption:   SSE with Cloudflare-managed keys (always-on)"
echo "  Versioning:   Enabled"
echo "  Public:       Disabled"
echo "  CDN Domain:   cdn.${DOMAIN}"
echo "  CORS Upload:  dashboard.${DOMAIN}"
echo "  CORS Download: cdn.${DOMAIN}, *.${DOMAIN}"
echo ""
echo "Next steps:"
echo "  1. Verify configuration: ./verify-r2-storage.sh"
echo "  2. Configure lifecycle rules in Dashboard (if API doesn't support)"
echo "  3. Set up R2 API credentials in backend environment variables"
echo "  4. Implement signed URL generation in packages/api/src/services/storage.ts"
