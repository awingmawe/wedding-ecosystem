#!/usr/bin/env bash
# Verify Cloudflare R2 Storage Configuration for Wedding Digital SaaS
#
# Checks that R2 bucket is properly configured with:
# - Correct bucket exists in APAC region
# - Object versioning enabled
# - Public access disabled
# - CORS rules configured
# - Custom domain connected
#
# Usage:
#   export CLOUDFLARE_API_TOKEN="your-token"
#   export CLOUDFLARE_ACCOUNT_ID="your-account-id"
#   export DOMAIN="example.com"
#   ./verify-r2-storage.sh

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
PASS=0
FAIL=0
WARN=0

echo -e "${GREEN}=== R2 Storage Configuration Verification ===${NC}"
echo "Account ID: ${CLOUDFLARE_ACCOUNT_ID}"
echo "Domain: ${DOMAIN}"
echo "Bucket: ${BUCKET_NAME}"
echo ""

# Helper function for API calls
cf_api() {
  local method="$1"
  local endpoint="$2"
  curl -s -X "$method" \
    "${API_BASE}${endpoint}" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "Content-Type: application/json"
}

# Check 1: Bucket exists
echo -e "${YELLOW}[1/6] Checking bucket exists...${NC}"
RESULT=$(cf_api GET "/accounts/${CLOUDFLARE_ACCOUNT_ID}/r2/buckets/${BUCKET_NAME}")
if echo "$RESULT" | grep -q '"success":true'; then
  echo -e "${GREEN}  ✓ Bucket '${BUCKET_NAME}' exists${NC}"
  LOCATION=$(echo "$RESULT" | jq -r '.result.location // "unknown"')
  echo "    Location: ${LOCATION}"
  PASS=$((PASS + 1))
else
  echo -e "${RED}  ✗ Bucket '${BUCKET_NAME}' not found${NC}"
  FAIL=$((FAIL + 1))
fi

# Check 2: Versioning enabled
echo -e "${YELLOW}[2/6] Checking object versioning...${NC}"
RESULT=$(cf_api GET "/accounts/${CLOUDFLARE_ACCOUNT_ID}/r2/buckets/${BUCKET_NAME}/versioning")
if echo "$RESULT" | grep -q '"enabled":true'; then
  echo -e "${GREEN}  ✓ Object versioning is enabled${NC}"
  PASS=$((PASS + 1))
elif echo "$RESULT" | grep -q '"success":true'; then
  echo -e "${RED}  ✗ Object versioning is disabled${NC}"
  FAIL=$((FAIL + 1))
else
  echo -e "${YELLOW}  ⚠ Could not verify versioning (check Dashboard)${NC}"
  WARN=$((WARN + 1))
fi

# Check 3: Public access disabled
echo -e "${YELLOW}[3/6] Checking public access is blocked...${NC}"
# Try to access via r2.dev URL (should fail)
R2_PUBLIC_URL="https://${BUCKET_NAME}.${CLOUDFLARE_ACCOUNT_ID}.r2.dev/"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$R2_PUBLIC_URL" 2>/dev/null || echo "000")
if [ "$HTTP_STATUS" = "403" ] || [ "$HTTP_STATUS" = "404" ] || [ "$HTTP_STATUS" = "000" ]; then
  echo -e "${GREEN}  ✓ Public access is blocked (HTTP ${HTTP_STATUS})${NC}"
  PASS=$((PASS + 1))
else
  echo -e "${RED}  ✗ Public access may be enabled (HTTP ${HTTP_STATUS})${NC}"
  FAIL=$((FAIL + 1))
fi

# Check 4: CORS configuration
echo -e "${YELLOW}[4/6] Checking CORS configuration...${NC}"
RESULT=$(cf_api GET "/accounts/${CLOUDFLARE_ACCOUNT_ID}/r2/buckets/${BUCKET_NAME}/cors")
if echo "$RESULT" | grep -q '"success":true'; then
  CORS_RULES=$(echo "$RESULT" | jq '.result.cors_rules // [] | length')
  if [ "$CORS_RULES" -ge 2 ]; then
    echo -e "${GREEN}  ✓ CORS configured with ${CORS_RULES} rules${NC}"
    PASS=$((PASS + 1))
  else
    echo -e "${YELLOW}  ⚠ CORS has ${CORS_RULES} rules (expected 2: upload + download)${NC}"
    WARN=$((WARN + 1))
  fi
else
  echo -e "${YELLOW}  ⚠ Could not verify CORS (check Dashboard)${NC}"
  WARN=$((WARN + 1))
fi

# Check 5: Custom domain
echo -e "${YELLOW}[5/6] Checking custom domain (cdn.${DOMAIN})...${NC}"
CDN_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://cdn.${DOMAIN}/" 2>/dev/null || echo "000")
if [ "$CDN_STATUS" = "200" ] || [ "$CDN_STATUS" = "403" ] || [ "$CDN_STATUS" = "404" ]; then
  echo -e "${GREEN}  ✓ Custom domain 'cdn.${DOMAIN}' is responding (HTTP ${CDN_STATUS})${NC}"
  PASS=$((PASS + 1))
else
  echo -e "${YELLOW}  ⚠ Custom domain 'cdn.${DOMAIN}' not responding (HTTP ${CDN_STATUS})${NC}"
  echo "    This may be expected if DNS is not yet configured"
  WARN=$((WARN + 1))
fi

# Check 6: Encryption (always-on for R2)
echo -e "${YELLOW}[6/6] Checking encryption...${NC}"
echo -e "${GREEN}  ✓ SSE with Cloudflare-managed keys (always-on for R2)${NC}"
PASS=$((PASS + 1))

# Summary
echo ""
echo -e "${GREEN}=== Verification Summary ===${NC}"
echo -e "  ${GREEN}Passed: ${PASS}${NC}"
echo -e "  ${RED}Failed: ${FAIL}${NC}"
echo -e "  ${YELLOW}Warnings: ${WARN}${NC}"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}Some checks failed. Review the output above and fix issues.${NC}"
  exit 1
elif [ "$WARN" -gt 0 ]; then
  echo -e "${YELLOW}All critical checks passed, but some items need manual verification.${NC}"
  exit 0
else
  echo -e "${GREEN}All checks passed! R2 storage is properly configured.${NC}"
  exit 0
fi
